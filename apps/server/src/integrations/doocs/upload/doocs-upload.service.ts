import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { Attachment } from '@docmost/db/types/entity.types';
import {
  DoocsUploadProvider,
  EncryptedSecretEnvelope,
  IntegrationDatabase,
} from '@docmost/integration-db';
import { FastifyRequest } from 'fastify';
import * as bytes from 'bytes';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { AttachmentService } from '../../../core/attachment/services/attachment.service';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import { AUDIT_SERVICE, IAuditService } from '../../audit/audit.service';
import { EnvironmentService } from '../../environment/environment.service';
import { StorageService } from '../../storage/storage.service';
import { InjectDoocsDatabase } from '../database/doocs-database.module';
import { DoocsSecretCipherService } from '../security/doocs-secret-cipher.service';
import { DoocsSessionPrincipal } from '../sessions/doocs-session.service';
import {
  DoocsUploadConfigService,
  ResolvedDoocsUploadConfig,
} from './doocs-upload-config.service';
import { publishUrlKey } from './doocs-image-url.util';
import { DoocsS3UploadService } from './s3/doocs-s3-upload.service';
import { WechatApiService } from './wechat/wechat-api.service';

const WECHAT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
]);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_SIGNATURE = Buffer.from([255, 216, 255]);
const GIF87A_SIGNATURE = Buffer.from('GIF87a', 'ascii');
const GIF89A_SIGNATURE = Buffer.from('GIF89a', 'ascii');

interface WechatAccountCredentialsRow {
  id: string;
  app_id: string;
  app_secret_enc: EncryptedSecretEnvelope;
  proxy_origin: string | null;
}

interface ParsedUpload {
  accountId?: string;
  bytes: Buffer;
  mime: string;
  filename: string;
}

interface PageContext {
  id: string;
  spaceId: string;
  workspaceId: string;
}

interface PublishTarget {
  provider: DoocsUploadProvider;
  targetId: string;
  configFingerprint: string;
  upload: () => Promise<{ url: string; mediaId?: string }>;
}

export interface DoocsAttachmentResponse {
  id: string;
  fileName: string;
  url: string;
  mimeType: string | null;
  fileSize: number;
}

export interface DoocsPublishAssetResponse {
  attachmentId: string;
  provider: DoocsUploadProvider;
  status: 'ready' | 'failed';
  url?: string;
  mediaId?: string;
  error?: string;
  retryable: boolean;
}

export interface DoocsAttachmentIdentity {
  attachmentId: string;
  fileName: string;
}

/** Upload attempts run in parallel but stay bounded so opening a page with many
 * images does not fan out one request per image at the provider. */
const PUBLISH_CONCURRENCY = 4;

@Injectable()
export class DoocsUploadService {
  private readonly logger = new Logger(DoocsUploadService.name);

  constructor(
    @InjectDoocsDatabase() private readonly db: IntegrationDatabase,
    private readonly pageRepo: PageRepo,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly attachmentService: AttachmentService,
    private readonly storage: StorageService,
    private readonly cipher: DoocsSecretCipherService,
    private readonly wechat: WechatApiService,
    private readonly uploadConfig: DoocsUploadConfigService,
    private readonly s3: DoocsS3UploadService,
    private readonly environment: EnvironmentService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async upload(
    request: FastifyRequest,
    session: DoocsSessionPrincipal,
  ): Promise<{
    attachment: DoocsAttachmentResponse;
    publishAsset: DoocsPublishAssetResponse;
  }> {
    const upload = await this.parseMultipart(request);
    const { page, config } = await this.resolvePageContext(session);
    const fileName = this.normalizeFilename(upload.filename, upload.mime);
    const target = await this.resolvePublishTarget({
      page,
      config,
      accountId: upload.accountId,
      bytes: upload.bytes,
      mime: upload.mime,
      filename: fileName,
    });

    const attachment = await this.attachmentService.uploadPageFileFromBuffer({
      bytes: upload.bytes,
      fileName,
      mimeType: upload.mime,
      pageId: page.id,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      userId: session.userId,
    });
    if (!attachment) {
      throw new BadRequestException('Failed to create Docmost attachment');
    }

    this.auditService.log({
      event: AuditEvent.ATTACHMENT_UPLOADED,
      resourceType: AuditResource.ATTACHMENT,
      resourceId: attachment.id,
      spaceId: page.spaceId,
      metadata: {
        fileName: attachment.fileName,
        pageId: page.id,
        spaceId: page.spaceId,
      },
    });

    const publishAsset = await this.ensurePublishAsset({
      page,
      config,
      attachment,
      accountId: upload.accountId,
      bytes: upload.bytes,
      mime: upload.mime,
      filename: attachment.fileName,
      target,
    });

    return {
      attachment: this.toAttachmentResponse(attachment),
      publishAsset,
    };
  }

  async publishAttachment(
    attachmentId: string,
    accountId: string | undefined,
    session: DoocsSessionPrincipal,
  ): Promise<DoocsPublishAssetResponse> {
    const { page, config } = await this.resolvePageContext(session);
    const attachment = await this.attachmentRepo.findById(attachmentId);
    if (
      !attachment ||
      attachment.deletedAt ||
      attachment.workspaceId !== page.workspaceId ||
      attachment.pageId !== page.id
    ) {
      throw new ForbiddenException('Attachment is not available for this page');
    }

    const content = await this.storage.read(attachment.filePath);
    return this.ensurePublishAsset({
      page,
      config,
      attachment,
      accountId,
      bytes: content,
      mime: attachment.mimeType || 'application/octet-stream',
      filename: attachment.fileName,
    });
  }

  /**
   * Resolves publish URLs for a page's image attachments so the doocs editor can
   * be handed content that carries no Docmost-local links. Ready mappings are
   * reused without touching storage; only missing ones are read and uploaded.
   * Individual failures are reported per attachment instead of failing the page.
   */
  async resolvePublishUrlsForPage(opts: {
    page: PageContext;
    attachmentIds: string[];
    accountId?: string;
  }): Promise<Map<string, DoocsPublishAssetResponse>> {
    const results = new Map<string, DoocsPublishAssetResponse>();
    if (opts.attachmentIds.length === 0) {
      return results;
    }

    const config = await this.uploadConfig.resolve(opts.page.workspaceId);
    const attachments = (
      await this.attachmentRepo.findByIds(opts.attachmentIds)
    ).filter(
      (attachment) =>
        !attachment.deletedAt &&
        attachment.workspaceId === opts.page.workspaceId &&
        attachment.pageId === opts.page.id,
    );

    await this.eachWithConcurrency(attachments, async (attachment) => {
      const resolved = await this.resolvePublishUrl({
        page: opts.page,
        config,
        accountId: opts.accountId,
        attachment,
      });
      results.set(attachment.id, resolved);
    });

    return results;
  }

  /**
   * Reverse of the handoff rewrite: maps publish URLs found in doocs content
   * back to the page's own attachments. Scoped to the page's workspace and page
   * so a publish URL from elsewhere can never claim this page's attachment.
   */
  async findAttachmentsByPublishUrls(
    page: Pick<PageContext, 'id' | 'workspaceId'>,
    urls: string[],
  ): Promise<Map<string, DoocsAttachmentIdentity>> {
    const result = new Map<string, DoocsAttachmentIdentity>();
    if (urls.length === 0) {
      return result;
    }

    const candidates = new Set<string>();
    for (const url of urls) {
      const key = publishUrlKey(url);
      candidates.add(url);
      candidates.add(`http://${key}`);
      candidates.add(`https://${key}`);
    }

    const rows = await this.db
      .selectFrom('doocs_publish_assets')
      .select(['attachment_id', 'publish_url'])
      .where('workspace_id', '=', page.workspaceId)
      .where('status', '=', 'ready')
      .where('publish_url', 'in', [...candidates])
      .execute();
    if (rows.length === 0) {
      return result;
    }

    const attachments = await this.attachmentRepo.findByIds([
      ...new Set(rows.map((row) => row.attachment_id)),
    ]);
    const usable = new Map(
      attachments
        .filter(
          (attachment) =>
            !attachment.deletedAt &&
            attachment.workspaceId === page.workspaceId &&
            attachment.pageId === page.id,
        )
        .map((attachment) => [attachment.id, attachment.fileName]),
    );

    for (const row of rows) {
      const fileName = usable.get(row.attachment_id);
      if (!fileName || !row.publish_url) {
        continue;
      }
      result.set(publishUrlKey(row.publish_url), {
        attachmentId: row.attachment_id,
        fileName,
      });
    }
    return result;
  }

  private async resolvePublishUrl(opts: {
    page: PageContext;
    config: ResolvedDoocsUploadConfig;
    accountId?: string;
    attachment: Attachment;
  }): Promise<DoocsPublishAssetResponse> {
    const provider = opts.config.provider;
    try {
      const target = await this.resolvePublishTarget({
        page: opts.page,
        config: opts.config,
        accountId: opts.accountId,
        // The target only needs the bytes for the upload closure, which is not
        // called when a ready mapping already exists.
        bytes: Buffer.alloc(0),
        mime: opts.attachment.mimeType || 'application/octet-stream',
        filename: opts.attachment.fileName,
      });

      const existing = await this.findReadyPublishAsset(
        opts.page.workspaceId,
        opts.attachment.id,
        target,
      );
      if (existing?.publish_url) {
        return {
          attachmentId: opts.attachment.id,
          provider,
          status: 'ready',
          url: existing.publish_url,
          ...(existing.media_id ? { mediaId: existing.media_id } : {}),
          retryable: false,
        };
      }

      const content = await this.storage.read(opts.attachment.filePath);
      return await this.ensurePublishAsset({
        page: opts.page,
        config: opts.config,
        attachment: opts.attachment,
        accountId: opts.accountId,
        bytes: content,
        mime: opts.attachment.mimeType || 'application/octet-stream',
        filename: opts.attachment.fileName,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to resolve publish url for attachment ${opts.attachment.id}: ${
          (error as Error)?.message ?? 'Unknown error'
        }`,
      );
      return {
        attachmentId: opts.attachment.id,
        provider,
        status: 'failed',
        error: 'Publish asset is not available. Retry before publishing.',
        retryable: true,
      };
    }
  }

  private async eachWithConcurrency<T>(
    items: T[],
    handler: (item: T) => Promise<void>,
  ): Promise<void> {
    for (let index = 0; index < items.length; index += PUBLISH_CONCURRENCY) {
      await Promise.all(
        items.slice(index, index + PUBLISH_CONCURRENCY).map(handler),
      );
    }
  }

  async publishFile(
    request: FastifyRequest,
    session: DoocsSessionPrincipal,
  ): Promise<{ url: string; mediaId?: string }> {
    const upload = await this.parseMultipart(request);
    const { page, config } = await this.resolvePageContext(session);
    const target = await this.resolvePublishTarget({
      page,
      config,
      accountId: upload.accountId,
      bytes: upload.bytes,
      mime: upload.mime,
      filename: this.normalizeFilename(upload.filename, upload.mime),
    });

    try {
      return await target.upload();
    } catch (error) {
      this.logUploadFailure(error, target, {
        mime: upload.mime,
        bytes: upload.bytes.byteLength,
      });
      throw new BadGatewayException(this.publishFailureMessage(error, target));
    }
  }

  /**
   * The provider message is the diagnosable part — for 40164 it even names the
   * rejected egress IP — but it can echo input, so the whole of it goes to the
   * log only; admins read it back through the account connection test. The
   * source bytes are logged with it because a rejection is just as often about
   * the image as about the account.
   */
  private logUploadFailure(
    error: unknown,
    target: PublishTarget,
    source: { attachmentId?: string; mime: string; bytes: number },
  ): void {
    const response = (error as { response?: { message?: unknown } })?.response;
    const detail =
      typeof response?.message === 'string'
        ? response.message
        : ((error as Error)?.message ?? 'Unknown error');

    this.logger.warn(
      `Publish asset upload failed via ${target.provider} (${target.targetId}) for ${
        source.attachmentId ?? 'a direct upload'
      } (${source.mime}, ${source.bytes} bytes): ${detail}`,
    );
  }

  /**
   * Keeps the provider's error code in the message handed back to the editor.
   * A bare code carries no credential and no account detail, and it is the
   * difference between "retry forever" and knowing the upload needs an IP
   * whitelist entry (40164) or an authorized account (48001).
   */
  private publishFailureMessage(error: unknown, target: PublishTarget): string {
    const code = (error as { errcode?: number | string })?.errcode;
    return code === undefined || code === null
      ? 'Publish asset upload failed'
      : `Publish asset upload failed (${target.provider} ${code})`;
  }

  private async resolvePageContext(session: DoocsSessionPrincipal): Promise<{
    page: PageContext;
    config: ResolvedDoocsUploadConfig;
  }> {
    const page = await this.pageRepo.findById(session.pageId);
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    // This also reloads the session user and validates current edit permission.
    const config = await this.uploadConfig.resolveForSession(session);
    return {
      page: {
        id: page.id,
        spaceId: page.spaceId,
        workspaceId: page.workspaceId,
      },
      config,
    };
  }

  private async ensurePublishAsset(opts: {
    page: PageContext;
    config: ResolvedDoocsUploadConfig;
    attachment: Attachment;
    accountId?: string;
    bytes: Buffer;
    mime: string;
    filename: string;
    target?: PublishTarget;
  }): Promise<DoocsPublishAssetResponse> {
    const target = opts.target ?? (await this.resolvePublishTarget(opts));
    const contentHash = createHash('sha256').update(opts.bytes).digest('hex');
    const existing = await this.findPublishAsset(
      opts.page.workspaceId,
      opts.attachment.id,
      target,
      contentHash,
    );
    if (existing?.status === 'ready' && existing.publish_url) {
      return {
        attachmentId: opts.attachment.id,
        provider: target.provider,
        status: 'ready',
        url: existing.publish_url,
        ...(existing.media_id ? { mediaId: existing.media_id } : {}),
        retryable: false,
      };
    }

    try {
      const result = await target.upload();
      await this.savePublishAsset({
        page: opts.page,
        attachmentId: opts.attachment.id,
        target,
        contentHash,
        status: 'ready',
        url: result.url,
        mediaId: result.mediaId,
      });
      return {
        attachmentId: opts.attachment.id,
        provider: target.provider,
        status: 'ready',
        url: result.url,
        ...(result.mediaId ? { mediaId: result.mediaId } : {}),
        retryable: false,
      };
    } catch (uploadError) {
      this.logUploadFailure(uploadError, target, {
        attachmentId: opts.attachment.id,
        mime: opts.mime,
        bytes: opts.bytes.byteLength,
      });
      const error = `${this.publishFailureMessage(uploadError, target)}. Retry before publishing.`;
      try {
        await this.savePublishAsset({
          page: opts.page,
          attachmentId: opts.attachment.id,
          target,
          contentHash,
          status: 'failed',
          error,
        });
      } catch {
        this.logger.warn(
          `Failed to persist publish state for attachment ${opts.attachment.id}`,
        );
      }
      return {
        attachmentId: opts.attachment.id,
        provider: target.provider,
        status: 'failed',
        error,
        retryable: true,
      };
    }
  }

  private async resolvePublishTarget(opts: {
    page: PageContext;
    config: ResolvedDoocsUploadConfig;
    accountId?: string;
    bytes: Buffer;
    mime: string;
    filename: string;
  }): Promise<PublishTarget> {
    if (opts.config.provider === 's3') {
      if (!opts.config.s3) {
        throw new BadRequestException('S3 upload config is incomplete');
      }
      const s3Config = opts.config.s3;
      return {
        provider: 's3',
        targetId: `s3:${s3Config.bucket}`,
        configFingerprint: this.fingerprint({
          provider: 's3',
          ...s3Config,
        }),
        upload: () =>
          this.s3.upload(s3Config, opts.bytes, opts.mime, opts.filename),
      };
    }

    if (!opts.accountId) {
      throw new BadRequestException('accountId is required');
    }
    const account = (await this.db
      .selectFrom('wechat_accounts')
      .select(['id', 'app_id', 'app_secret_enc', 'proxy_origin'])
      .where('id', '=', opts.accountId)
      .where('workspace_id', '=', opts.page.workspaceId)
      .executeTakeFirst()) as WechatAccountCredentialsRow | undefined;
    if (!account) {
      throw new ForbiddenException(
        'WeChat account is not available for this page',
      );
    }

    const appSecret = this.cipher.decrypt(account.app_secret_enc);
    return {
      provider: 'wechat',
      targetId: account.id,
      configFingerprint: this.fingerprint({
        provider: 'wechat',
        accountId: account.id,
        appId: account.app_id,
        secret: account.app_secret_enc,
      }),
      upload: () =>
        this.wechat.uploadImage(
          {
            accountId: account.id,
            appId: account.app_id,
            appSecret,
            proxyOrigin: account.proxy_origin,
          },
          opts.bytes,
          opts.mime,
          opts.filename,
        ),
    };
  }

  private async findPublishAsset(
    workspaceId: string,
    attachmentId: string,
    target: Pick<PublishTarget, 'provider' | 'targetId' | 'configFingerprint'>,
    contentHash: string,
  ) {
    return this.db
      .selectFrom('doocs_publish_assets')
      .select(['status', 'publish_url', 'media_id'])
      .where('workspace_id', '=', workspaceId)
      .where('attachment_id', '=', attachmentId)
      .where('provider', '=', target.provider)
      .where('target_id', '=', target.targetId)
      .where('config_fingerprint', '=', target.configFingerprint)
      .where('content_sha256', '=', contentHash)
      .executeTakeFirst();
  }

  /**
   * Content-hash-free lookup used on the handoff path: a Docmost attachment is
   * immutable (a replaced image becomes a new attachment), so a ready mapping
   * for the same attachment and target still describes the same bytes. Skipping
   * the hash is what lets opening a page avoid reading storage for every image.
   */
  private async findReadyPublishAsset(
    workspaceId: string,
    attachmentId: string,
    target: Pick<PublishTarget, 'provider' | 'targetId' | 'configFingerprint'>,
  ) {
    return this.db
      .selectFrom('doocs_publish_assets')
      .select(['publish_url', 'media_id'])
      .where('workspace_id', '=', workspaceId)
      .where('attachment_id', '=', attachmentId)
      .where('provider', '=', target.provider)
      .where('target_id', '=', target.targetId)
      .where('config_fingerprint', '=', target.configFingerprint)
      .where('status', '=', 'ready')
      .orderBy('updated_at', 'desc')
      .executeTakeFirst();
  }

  private async savePublishAsset(opts: {
    page: PageContext;
    attachmentId: string;
    target: Pick<PublishTarget, 'provider' | 'targetId' | 'configFingerprint'>;
    contentHash: string;
    status: 'ready' | 'failed';
    url?: string;
    mediaId?: string;
    error?: string;
  }): Promise<void> {
    const now = new Date();
    await this.db
      .insertInto('doocs_publish_assets')
      .values({
        workspace_id: opts.page.workspaceId,
        page_id: opts.page.id,
        attachment_id: opts.attachmentId,
        provider: opts.target.provider,
        target_id: opts.target.targetId,
        config_fingerprint: opts.target.configFingerprint,
        content_sha256: opts.contentHash,
        status: opts.status,
        publish_url: opts.url ?? null,
        media_id: opts.mediaId ?? null,
        error_message: opts.error ?? null,
        attempt_count: 1,
        last_attempt_at: now,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc
          .columns([
            'workspace_id',
            'attachment_id',
            'provider',
            'target_id',
            'config_fingerprint',
            'content_sha256',
          ])
          .doUpdateSet((eb) => ({
            page_id: opts.page.id,
            status: opts.status,
            publish_url: opts.url ?? null,
            media_id: opts.mediaId ?? null,
            error_message: opts.error ?? null,
            attempt_count: eb('doocs_publish_assets.attempt_count', '+', 1),
            last_attempt_at: now,
            updated_at: now,
          })),
      )
      .execute();
  }

  private toAttachmentResponse(
    attachment: Attachment,
  ): DoocsAttachmentResponse {
    return {
      id: attachment.id,
      fileName: attachment.fileName,
      url: `/api/files/${attachment.id}/${encodeURIComponent(attachment.fileName)}`,
      mimeType: attachment.mimeType,
      fileSize: Number(attachment.fileSize ?? 0),
    };
  }

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private normalizeFilename(filename: string, mime: string): string {
    const requiredExtension =
      mime === 'image/png' ? '.png' : mime === 'image/gif' ? '.gif' : '.jpg';
    const extension = path.extname(filename).toLowerCase();
    const allowedExtensions =
      mime === 'image/jpeg'
        ? new Set(['.jpg', '.jpeg'])
        : new Set([requiredExtension]);
    if (allowedExtensions.has(extension)) {
      return filename;
    }
    const baseName = extension
      ? filename.slice(0, -extension.length)
      : filename || 'image';
    return `${baseName}${requiredExtension}`;
  }

  private async parseMultipart(request: FastifyRequest): Promise<ParsedUpload> {
    const maxBytes = this.maxImageBytes();
    let accountId: string | undefined;
    let image: Pick<ParsedUpload, 'bytes' | 'mime' | 'filename'> | undefined;

    try {
      for await (const part of request.parts({
        limits: { fileSize: maxBytes, fields: 1, files: 1, parts: 2 },
      })) {
        if (part.type === 'field') {
          if (part.fieldname !== 'accountId' || accountId !== undefined) {
            throw new BadRequestException('Unexpected multipart field');
          }
          if (part.valueTruncated || typeof part.value !== 'string') {
            throw new BadRequestException('Invalid accountId');
          }
          accountId = part.value.trim();
          continue;
        }

        if (part.fieldname !== 'file' || image) {
          part.file.resume();
          throw new BadRequestException('Unexpected multipart file');
        }
        image = await this.readImage(part, maxBytes);
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (
        (error as { statusCode?: number })?.statusCode === 413 ||
        (error as { code?: string })?.code === 'FST_REQ_FILE_TOO_LARGE'
      ) {
        throw this.fileTooLarge();
      }
      throw new BadRequestException('Invalid multipart upload');
    }

    if (!image) {
      throw new BadRequestException('file is required');
    }
    return { accountId, ...image };
  }

  private async readImage(
    part: MultipartFile,
    maxBytes: number,
  ): Promise<Pick<ParsedUpload, 'bytes' | 'mime' | 'filename'>> {
    const declaredMime = part.mimetype.toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(declaredMime)) {
      part.file.resume();
      throw new BadRequestException(
        'Only JPG, JPEG, PNG, and GIF images are supported',
      );
    }

    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of part.file) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        throw this.fileTooLarge();
      }
      chunks.push(buffer);
    }
    if (part.file.truncated) {
      throw this.fileTooLarge();
    }

    const content = Buffer.concat(chunks, total);
    const detectedMime = this.detectMime(content);
    const normalizedDeclaredMime =
      declaredMime === 'image/jpg' ? 'image/jpeg' : declaredMime;
    if (!detectedMime || detectedMime !== normalizedDeclaredMime) {
      throw new BadRequestException('File content does not match image type');
    }

    return {
      bytes: content,
      mime: detectedMime,
      filename: part.filename || 'image',
    };
  }

  private detectMime(content: Buffer): string | undefined {
    if (content.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      return 'image/png';
    }
    if (content.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) {
      return 'image/jpeg';
    }
    if (
      content.subarray(0, GIF87A_SIGNATURE.length).equals(GIF87A_SIGNATURE) ||
      content.subarray(0, GIF89A_SIGNATURE.length).equals(GIF89A_SIGNATURE)
    ) {
      return 'image/gif';
    }
    return undefined;
  }

  private maxImageBytes(): number {
    const configured = bytes(this.environment.getFileUploadSizeLimit());
    return Math.min(
      WECHAT_MAX_IMAGE_BYTES,
      typeof configured === 'number' ? configured : WECHAT_MAX_IMAGE_BYTES,
    );
  }

  private fileTooLarge(): BadRequestException {
    return new BadRequestException(
      `File too large. Exceeds the ${this.maxImageBytes()} byte limit`,
    );
  }
}
