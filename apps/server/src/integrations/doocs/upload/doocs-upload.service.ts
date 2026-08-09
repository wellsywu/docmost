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
import {
  buildPublicAttachmentUrl,
  publishUrlKey,
} from './doocs-image-url.util';
import { TokenService } from '../../../core/auth/services/token.service';
import { DoocsS3UploadService } from './s3/doocs-s3-upload.service';

const WECHAT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
]);
/** Hosts `media/uploadimg` and `material/add_material` return URLs on. */
const WECHAT_IMAGE_HOSTS = ['qpic.cn', 'qlogo.cn'];

/**
 * Browser-uploaded rows have no server-side view of the bytes, so they cannot
 * carry a content hash. A Docmost attachment is immutable — replacing an image
 * creates a new attachment — so a fixed sentinel still yields exactly one row per
 * attachment and target, and `findReadyPublishAsset`, which ignores the hash,
 * matches it.
 */
const BROWSER_UPLOAD_CONTENT_HASH = 'browser-upload';

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
  /**
   * `deferred` is not a failure: under browser-side WeChat publishing the image
   * host is only contacted when the author copies or publishes, so an upload
   * legitimately finishes with no publish URL yet.
   */
  status: 'ready' | 'failed' | 'deferred';
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
    private readonly uploadConfig: DoocsUploadConfigService,
    private readonly s3: DoocsS3UploadService,
    private readonly environment: EnvironmentService,
    private readonly tokens: TokenService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  /**
   * WeChat is always reached from the browser, the way standalone doocs does it.
   * The account's IP whitelist covers the network the author is on, not this
   * server's egress, so uploading from here fails on exactly the deployments
   * that need it most. S3 has no such constraint and still uploads inline.
   */
  private publishesFromBrowser(provider: DoocsUploadProvider): boolean {
    return provider === 'wechat';
  }

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
    // With browser-side publishing configured, WeChat is reached from the browser
    // rather than from here, because the account's IP whitelist covers the colo
    // the browser reaches and not this server's egress. Inserting an image then
    // only has to produce the attachment; the image host is contacted later, when
    // the author copies or publishes. S3 never has this constraint, and a
    // deployment whose own IP is whitelisted keeps the inline upload.
    const target = this.publishesFromBrowser(config.provider)
      ? undefined
      : await this.resolvePublishTarget({
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

    const publishAsset = target
      ? await this.ensurePublishAsset({
          page,
          config,
          attachment,
          accountId: upload.accountId,
          bytes: upload.bytes,
          mime: upload.mime,
          filename: attachment.fileName,
          target,
        })
      : this.deferredPublishAsset(attachment.id);

    return {
      attachment: await this.toAttachmentResponse(attachment, page),
      publishAsset,
    };
  }

  private deferredPublishAsset(
    attachmentId: string,
  ): DoocsPublishAssetResponse {
    return {
      attachmentId,
      provider: 'wechat',
      status: 'deferred',
      retryable: false,
    };
  }

  private readyPublishAsset(
    attachmentId: string,
    provider: DoocsUploadProvider,
    row: { publish_url: string | null; media_id: string | null },
  ): DoocsPublishAssetResponse {
    return {
      attachmentId,
      provider,
      status: 'ready',
      url: row.publish_url ?? undefined,
      ...(row.media_id ? { mediaId: row.media_id } : {}),
      retryable: false,
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

    // A browser-side provider answers ready-or-deferred rather than uploading.
    // The current editor asks for credentials instead of calling this at all, so
    // this is what a tab still running an older build gets: a status it can act
    // on, not a failure it cannot.
    if (this.publishesFromBrowser(config.provider)) {
      return this.resolvePublishUrl({ page, config, accountId, attachment });
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
   * Hands the browser the account's WeChat credentials so it can upload the way
   * standalone doocs does. The AppSecret reaches the page, which is the accepted
   * trade for uploads that work: the whitelist covers the author's network, not
   * this server's egress. At rest the secret stays encrypted; this is the only
   * place it is decrypted for a caller, and it is logged as such.
   */
  async getWechatUploadCredentials(
    accountId: string | undefined,
    session: DoocsSessionPrincipal,
  ): Promise<{
    accountId: string;
    appId: string;
    appSecret: string;
    proxyOrigin: string | null;
  }> {
    const { page, config } = await this.resolvePageContext(session);
    if (config.provider !== 'wechat') {
      throw new BadRequestException(
        'The upload provider for this workspace is not WeChat',
      );
    }

    const account = await this.loadWechatAccount(page.workspaceId, accountId);

    this.auditService.log({
      event: AuditEvent.WECHAT_UPLOAD_CREDENTIALS_ISSUED,
      resourceType: AuditResource.WECHAT_ACCOUNT,
      resourceId: account.id,
      spaceId: page.spaceId,
      metadata: { pageId: page.id, proxyOrigin: account.proxy_origin },
    });

    return {
      accountId: account.id,
      appId: account.app_id,
      appSecret: this.cipher.decrypt(account.app_secret_enc),
      proxyOrigin: account.proxy_origin,
    };
  }

  /**
   * Records what the browser uploaded, so the next copy or publish reuses the
   * image instead of sending it again.
   */
  async registerPublishAssets(
    entries: { attachmentId: string; url: string; mediaId?: string }[],
    accountId: string | undefined,
    session: DoocsSessionPrincipal,
  ): Promise<DoocsPublishAssetResponse[]> {
    const { page } = await this.resolvePageContext(session);
    const account = await this.loadWechatAccount(page.workspaceId, accountId);
    const target = this.wechatTargetIdentity(account);
    const owned = await this.ownedAttachmentIds(
      page,
      entries.map((entry) => entry.attachmentId),
    );

    const results: DoocsPublishAssetResponse[] = [];
    for (const entry of entries) {
      if (!owned.has(entry.attachmentId)) {
        throw new ForbiddenException(
          'Attachment is not available for this page',
        );
      }
      const url = this.assertWechatImageUrl(entry.url);
      await this.savePublishAsset({
        page,
        attachmentId: entry.attachmentId,
        target,
        contentHash: BROWSER_UPLOAD_CONTENT_HASH,
        status: 'ready',
        url,
        mediaId: entry.mediaId,
      });
      results.push({
        attachmentId: entry.attachmentId,
        provider: 'wechat',
        status: 'ready',
        url,
        ...(entry.mediaId ? { mediaId: entry.mediaId } : {}),
        retryable: false,
      });
    }
    return results;
  }

  /**
   * Tells the browser which of these attachments already have an image-host URL,
   * so only the rest have to be uploaded.
   */
  async lookupPublishAssets(
    attachmentIds: string[],
    accountId: string | undefined,
    session: DoocsSessionPrincipal,
  ): Promise<DoocsPublishAssetResponse[]> {
    const { page } = await this.resolvePageContext(session);
    if (attachmentIds.length === 0) {
      return [];
    }
    const account = await this.loadWechatAccount(page.workspaceId, accountId);
    const target = this.wechatTargetIdentity(account);
    const owned = await this.ownedAttachmentIds(page, attachmentIds);

    const results: DoocsPublishAssetResponse[] = [];
    for (const attachmentId of attachmentIds) {
      if (!owned.has(attachmentId)) {
        continue;
      }
      const existing = await this.findReadyPublishAsset(
        page.workspaceId,
        attachmentId,
        target,
      );
      results.push(
        existing?.publish_url
          ? {
              attachmentId,
              provider: 'wechat',
              status: 'ready',
              url: existing.publish_url,
              ...(existing.media_id ? { mediaId: existing.media_id } : {}),
              retryable: false,
            }
          : this.deferredPublishAsset(attachmentId),
      );
    }
    return results;
  }

  private async ownedAttachmentIds(
    page: PageContext,
    attachmentIds: string[],
  ): Promise<Set<string>> {
    const unique = [...new Set(attachmentIds)];
    if (unique.length === 0) {
      return new Set();
    }
    const attachments = await this.attachmentRepo.findByIds(unique);
    return new Set(
      attachments
        .filter(
          (attachment) =>
            !attachment.deletedAt &&
            attachment.workspaceId === page.workspaceId &&
            attachment.pageId === page.id,
        )
        .map((attachment) => attachment.id),
    );
  }

  /**
   * The browser is the one reporting this URL, and `findAttachmentsByPublishUrls`
   * later trusts the table to map a URL back to an attachment. Accepting an
   * arbitrary URL here would let a caller claim any third-party image as this
   * page's attachment on the next save, so only the WeChat image host is allowed.
   */
  private assertWechatImageUrl(value: string): string {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new BadRequestException('Publish URL is not a valid URL');
    }
    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('Publish URL must use HTTPS');
    }
    const host = parsed.hostname.toLowerCase();
    const allowed = WECHAT_IMAGE_HOSTS.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
    if (!allowed) {
      throw new BadRequestException(
        'Publish URL must point at the WeChat image host',
      );
    }
    return parsed.toString();
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

  /**
   * Builds the image URL the doocs editor should show for every attachment on a
   * page: the image-host URL when one already exists, and otherwise a signed
   * Docmost URL so the picture still renders while it waits to be published.
   */
  async resolveEditorImageUrls(opts: {
    page: PageContext;
    attachmentIds: string[];
    accountId?: string;
  }): Promise<{
    urls: Map<string, string>;
    ready: number;
    pending: string[];
    failed: { attachmentId: string; error: string }[];
  }> {
    const urls = new Map<string, string>();
    const pending: string[] = [];
    const failed: { attachmentId: string; error: string }[] = [];
    let ready = 0;

    const config = await this.uploadConfig.resolve(opts.page.workspaceId);
    // WeChat without a chosen account has nothing to look up: only the browser
    // knows which account is selected. Every image is simply left pending.
    const resolved =
      config.provider !== 'wechat' || opts.accountId
        ? await this.resolvePublishUrlsForPage(opts)
        : new Map<string, DoocsPublishAssetResponse>();

    const attachments = await this.attachmentRepo.findByIds(opts.attachmentIds);
    const appUrl = this.environment.getDoocsAttachmentBaseUrl();

    for (const attachment of attachments) {
      if (
        attachment.deletedAt ||
        attachment.workspaceId !== opts.page.workspaceId ||
        attachment.pageId !== opts.page.id
      ) {
        // Not this page's attachment; treated like any other foreign image.
        continue;
      }
      const asset = resolved.get(attachment.id);
      if (asset?.status === 'ready' && asset.url) {
        urls.set(attachment.id, asset.url);
        ready += 1;
        continue;
      }

      urls.set(
        attachment.id,
        buildPublicAttachmentUrl({
          appUrl,
          attachmentId: attachment.id,
          fileName: attachment.fileName,
          token: await this.tokens.generateAttachmentToken({
            attachmentId: attachment.id,
            pageId: opts.page.id,
            workspaceId: opts.page.workspaceId,
          }),
        }),
      );
      if (asset?.status === 'failed') {
        failed.push({
          attachmentId: attachment.id,
          error: asset.error ?? 'Publish asset is not available',
        });
      } else {
        pending.push(attachment.id);
      }
    }

    return { urls, ready, pending, failed };
  }

  private async resolvePublishUrl(opts: {
    page: PageContext;
    config: ResolvedDoocsUploadConfig;
    accountId?: string;
    attachment: Attachment;
  }): Promise<DoocsPublishAssetResponse> {
    const provider = opts.config.provider;
    try {
      // Settled before any target is resolved: resolvePublishTarget cannot build
      // one for a browser-side provider, and letting it throw here would report
      // every not-yet-published image as failed instead of pending.
      if (this.publishesFromBrowser(provider)) {
        const account = await this.loadWechatAccount(
          opts.page.workspaceId,
          opts.accountId,
        );
        const published = await this.findReadyPublishAsset(
          opts.page.workspaceId,
          opts.attachment.id,
          this.wechatTargetIdentity(account),
        );
        // Nothing more this server can do for the rest: the image host is only
        // reachable from the browser, which uploads when the author copies or
        // publishes.
        return published?.publish_url
          ? this.readyPublishAsset(opts.attachment.id, provider, published)
          : this.deferredPublishAsset(opts.attachment.id);
      }

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
        return this.readyPublishAsset(opts.attachment.id, provider, existing);
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

    // No WeChat target exists any more: this server cannot reach the image host,
    // so every caller that could take one is expected to consult
    // publishesFromBrowser() first. publishFile() is the exception — it uploads
    // bytes with no attachment behind them, and the browser now does that
    // directly, so an older editor build reaching here gets told why.
    throw new BadRequestException(
      'WeChat images are uploaded from the browser, not from the server',
    );
  }

  private async loadWechatAccount(
    workspaceId: string,
    accountId: string | undefined,
  ): Promise<WechatAccountCredentialsRow> {
    if (!accountId) {
      throw new BadRequestException('accountId is required');
    }
    const account = (await this.db
      .selectFrom('wechat_accounts')
      .select(['id', 'app_id', 'app_secret_enc', 'proxy_origin'])
      .where('id', '=', accountId)
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst()) as WechatAccountCredentialsRow | undefined;
    if (!account) {
      throw new ForbiddenException(
        'WeChat account is not available for this page',
      );
    }
    return account;
  }

  /**
   * Identity of a publish target, without the upload closure. Ticket issuance and
   * browser-side registration both need the fingerprint so their rows land on the
   * same key the server-side path would have used — change the account's
   * credentials or proxy and previously published images stop matching, which is
   * the intended behaviour.
   */
  private wechatTargetIdentity(
    account: WechatAccountCredentialsRow,
  ): Pick<PublishTarget, 'provider' | 'targetId' | 'configFingerprint'> {
    return {
      provider: 'wechat',
      targetId: account.id,
      configFingerprint: this.fingerprint({
        provider: 'wechat',
        accountId: account.id,
        appId: account.app_id,
        secret: account.app_secret_enc,
        proxyOrigin: account.proxy_origin,
      }),
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

  /**
   * The URL is absolute and signed because the doocs editor runs on its own
   * origin: a relative `/api/files/...` would resolve against the editor's host,
   * and `/api/files/:id` would reject its bearer token anyway.
   */
  private async toAttachmentResponse(
    attachment: Attachment,
    page: PageContext,
  ): Promise<DoocsAttachmentResponse> {
    return {
      id: attachment.id,
      fileName: attachment.fileName,
      url: buildPublicAttachmentUrl({
        appUrl: this.environment.getDoocsAttachmentBaseUrl(),
        attachmentId: attachment.id,
        fileName: attachment.fileName,
        token: await this.tokens.generateAttachmentToken({
          attachmentId: attachment.id,
          pageId: page.id,
          workspaceId: page.workspaceId,
        }),
      }),
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
