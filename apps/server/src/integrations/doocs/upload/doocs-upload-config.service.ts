import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DoocsS3UploadConfig,
  DoocsUploadProvider,
  EncryptedSecretEnvelope,
  IntegrationDatabase,
} from '@docmost/integration-db';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { PageAccessService } from '../../../core/page/page-access/page-access.service';
import { InjectDoocsDatabase } from '../database/doocs-database.module';
import {
  DoocsS3UploadConfigDto,
  UpdateDoocsUploadConfigDto,
} from '../dto/doocs.dto';
import { DoocsSecretCipherService } from '../security/doocs-secret-cipher.service';
import { DoocsSessionPrincipal } from '../sessions/doocs-session.service';

export interface PublicDoocsUploadConfig {
  provider: DoocsUploadProvider;
  s3?: {
    endpoint: string | null;
    region: string;
    bucket: string;
    accessKeyId: string;
    path: string | null;
    cdnHost: string | null;
    pathStyle: boolean;
    secretConfigured: boolean;
  };
}

interface DoocsUploadConfigRow {
  workspace_id: string;
  provider: DoocsUploadProvider;
  s3_config: DoocsS3UploadConfig | null;
  s3_access_key_secret_enc: EncryptedSecretEnvelope | null;
}

export interface ResolvedDoocsUploadConfig {
  provider: DoocsUploadProvider;
  s3?: DoocsS3UploadConfig & { accessKeySecret: string };
}

@Injectable()
export class DoocsUploadConfigService {
  constructor(
    @InjectDoocsDatabase() private readonly db: IntegrationDatabase,
    private readonly pageRepo: PageRepo,
    private readonly cipher: DoocsSecretCipherService,
    private readonly pageAccessService: PageAccessService,
    private readonly userRepo: UserRepo,
  ) {}

  async getPublic(workspaceId: string): Promise<PublicDoocsUploadConfig> {
    return this.toPublic(await this.find(workspaceId));
  }

  async getPublicForPage(pageId: string): Promise<PublicDoocsUploadConfig> {
    const page = await this.pageRepo.findById(pageId);
    if (!page) {
      throw new BadRequestException('Page not found');
    }
    return this.getPublic(page.workspaceId);
  }

  async getPublicForSession(
    session: DoocsSessionPrincipal,
  ): Promise<PublicDoocsUploadConfig> {
    const page = await this.assertSessionCanEdit(session);
    return this.getPublic(page.workspaceId);
  }

  async resolve(workspaceId: string): Promise<ResolvedDoocsUploadConfig> {
    const row = await this.find(workspaceId);
    if (row?.provider !== 's3') {
      return { provider: 'wechat' };
    }
    if (!row.s3_config || !row.s3_access_key_secret_enc) {
      throw new BadRequestException('S3 upload config is incomplete');
    }
    return {
      provider: 's3',
      s3: {
        ...row.s3_config,
        accessKeySecret: this.cipher.decrypt(row.s3_access_key_secret_enc),
      },
    };
  }

  async resolveForSession(
    session: DoocsSessionPrincipal,
  ): Promise<ResolvedDoocsUploadConfig> {
    const page = await this.assertSessionCanEdit(session);
    return this.resolve(page.workspaceId);
  }

  async update(
    workspaceId: string,
    userId: string,
    dto: UpdateDoocsUploadConfigDto,
  ): Promise<PublicDoocsUploadConfig> {
    const existing = await this.find(workspaceId);
    const update = this.normalizeUpdate(dto, existing);

    const row = (await this.db
      .insertInto('doocs_upload_configs')
      .values({
        workspace_id: workspaceId,
        provider: dto.provider,
        s3_config: update.s3Config,
        s3_access_key_secret_enc: update.s3Secret,
        updated_by: userId,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc.column('workspace_id').doUpdateSet({
          provider: dto.provider,
          s3_config: update.s3Config,
          s3_access_key_secret_enc: update.s3Secret,
          updated_by: userId,
          updated_at: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow()) as DoocsUploadConfigRow;

    return this.toPublic(row);
  }

  private async find(
    workspaceId: string,
  ): Promise<DoocsUploadConfigRow | undefined> {
    return (await this.db
      .selectFrom('doocs_upload_configs')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst()) as DoocsUploadConfigRow | undefined;
  }

  private async assertSessionCanEdit(session: DoocsSessionPrincipal) {
    const page = await this.pageRepo.findById(session.pageId);
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }
    const user = await this.userRepo.findById(session.userId, page.workspaceId);
    if (!user || user.deletedAt || user.deactivatedAt) {
      throw new NotFoundException('User not found');
    }
    await this.pageAccessService.validateCanEdit(page, user);
    return page;
  }

  private normalizeUpdate(
    dto: UpdateDoocsUploadConfigDto,
    existing: DoocsUploadConfigRow | undefined,
  ): {
    s3Config: DoocsS3UploadConfig | null;
    s3Secret: EncryptedSecretEnvelope | null;
  } {
    if (dto.provider === 'wechat') {
      return {
        s3Config: existing?.s3_config ?? null,
        s3Secret: existing?.s3_access_key_secret_enc ?? null,
      };
    }

    if (!dto.s3) {
      throw new BadRequestException('S3 config is required');
    }
    const s3Config = this.normalizeS3(dto.s3);
    const secret = dto.s3.accessKeySecret?.trim();
    const s3Secret = secret
      ? this.cipher.encrypt(secret)
      : existing?.s3_access_key_secret_enc;
    if (!s3Secret) {
      throw new BadRequestException(
        'S3 accessKeySecret is required for first setup',
      );
    }
    return { s3Config, s3Secret };
  }

  private normalizeS3(dto: DoocsS3UploadConfigDto): DoocsS3UploadConfig {
    const region = dto.region.trim();
    const bucket = dto.bucket.trim();
    const accessKeyId = dto.accessKeyId.trim();
    if (!region || !bucket || !accessKeyId) {
      throw new BadRequestException(
        'S3 region, bucket, and accessKeyId are required',
      );
    }

    return {
      endpoint: this.optionalHttpsUrl(dto.endpoint, 'S3 endpoint'),
      region,
      bucket,
      accessKeyId,
      path: this.optionalPath(dto.path),
      cdnHost: this.optionalHttpsUrl(dto.cdnHost, 'S3 CDN host'),
      pathStyle: dto.pathStyle ?? false,
    };
  }

  private toPublic(
    row: DoocsUploadConfigRow | undefined,
  ): PublicDoocsUploadConfig {
    if (!row || row.provider !== 's3' || !row.s3_config) {
      return { provider: 'wechat' };
    }
    return {
      provider: 's3',
      s3: {
        ...row.s3_config,
        secretConfigured: Boolean(row.s3_access_key_secret_enc?.ciphertext),
      },
    };
  }

  private optionalText(value: string | undefined): string | null {
    return value?.trim() || null;
  }

  private optionalHttpsUrl(
    value: string | undefined,
    label: string,
  ): string | null {
    const normalized = this.optionalText(value);
    if (!normalized) {
      return null;
    }
    const withProtocol = normalized.startsWith('http')
      ? normalized
      : `https://${normalized}`;
    if (!withProtocol.startsWith('https://')) {
      throw new BadRequestException(`${label} must use HTTPS`);
    }
    return withProtocol.replace(/\/+$/, '');
  }

  private optionalPath(value: string | undefined): string | null {
    return (
      value
        ?.trim()
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '') || null
    );
  }
}
