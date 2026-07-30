import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import {
  EncryptedSecretEnvelope,
  IntegrationDatabase,
} from '@docmost/integration-db';
import { FastifyRequest } from 'fastify';
import * as bytes from 'bytes';
import { EnvironmentService } from '../../environment/environment.service';
import { InjectMdDatabase } from '../database/md-database.module';
import { MdSecretCipherService } from '../security/md-secret-cipher.service';
import { MdSessionPrincipal } from '../sessions/md-session.service';
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
}

interface ParsedUpload {
  accountId: string;
  bytes: Buffer;
  mime: string;
  filename: string;
}

@Injectable()
export class MdUploadService {
  constructor(
    @InjectMdDatabase() private readonly db: IntegrationDatabase,
    private readonly pageRepo: PageRepo,
    private readonly cipher: MdSecretCipherService,
    private readonly wechat: WechatApiService,
    private readonly environment: EnvironmentService,
  ) {}

  async upload(
    request: FastifyRequest,
    session: MdSessionPrincipal,
  ): Promise<{ url: string; mediaId?: string }> {
    const upload = await this.parseMultipart(request);
    const page = await this.pageRepo.findById(session.pageId);
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const account = (await this.db
      .selectFrom('wechat_accounts')
      .select(['id', 'app_id', 'app_secret_enc'])
      .where('id', '=', upload.accountId)
      .where('workspace_id', '=', page.workspaceId)
      .executeTakeFirst()) as WechatAccountCredentialsRow | undefined;
    if (!account) {
      throw new ForbiddenException(
        'WeChat account is not available for this page',
      );
    }

    const appSecret = this.cipher.decrypt(account.app_secret_enc);
    return this.wechat.uploadImage(
      {
        accountId: account.id,
        appId: account.app_id,
        appSecret,
      },
      upload.bytes,
      upload.mime,
      upload.filename,
    );
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

    if (!accountId) {
      throw new BadRequestException('accountId is required');
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
