import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EncryptedSecretEnvelope,
  IntegrationDatabase,
} from '@docmost/integration-db';
import { InjectDoocsDatabase } from '../database/doocs-database.module';
import {
  CreateWechatAccountDto,
  UpdateWechatAccountDto,
} from '../dto/wechat-account.dto';
import { DoocsSecretCipherService } from '../security/doocs-secret-cipher.service';
import { WechatApiService } from '../upload/wechat/wechat-api.service';
import { normalizeProxyOrigin } from './proxy-origin';

/**
 * 1x1 white PNG. `media/uploadimg` does not consume the material library quota,
 * so the connection test can exercise the real upload path without leaving
 * anything behind in the account.
 */
const CONNECTION_TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC',
  'base64',
);

interface WechatAccountRow {
  id: string;
  name: string;
  app_id: string;
  app_secret_enc: EncryptedSecretEnvelope;
  mp_id: string | null;
  service_type: string | null;
  verify: boolean;
  proxy_origin: string | null;
}

export interface SanitizedWechatAccount {
  id: string;
  name: string;
  appId: string;
  mpId: string | null;
  serviceType: string | null;
  verify: boolean;
  secretConfigured: boolean;
  proxyOrigin: string | null;
}

export interface WechatAccountTestResult {
  ok: boolean;
  /** Which step failed: obtaining a token, or the image upload itself. */
  step: 'token' | 'upload';
  message?: string;
}

@Injectable()
export class WechatAccountService {
  constructor(
    @InjectDoocsDatabase() private readonly db: IntegrationDatabase,
    private readonly secretCipher: DoocsSecretCipherService,
    private readonly wechat: WechatApiService,
  ) {}

  async list(workspaceId: string): Promise<SanitizedWechatAccount[]> {
    const rows = await this.db
      .selectFrom('wechat_accounts')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map((row) => this.sanitize(row as WechatAccountRow));
  }

  async create(
    dto: CreateWechatAccountDto,
    workspaceId: string,
    userId: string,
  ): Promise<SanitizedWechatAccount> {
    try {
      const row = await this.db
        .insertInto('wechat_accounts')
        .values({
          workspace_id: workspaceId,
          name: dto.name,
          app_id: dto.appId,
          app_secret_enc: this.secretCipher.encrypt(dto.appSecret),
          mp_id: this.optionalText(dto.mpId),
          service_type: this.optionalText(dto.serviceType),
          verify: dto.verify ?? false,
          proxy_origin: normalizeProxyOrigin(dto.proxyOrigin),
          created_by: userId,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.sanitize(row as WechatAccountRow);
    } catch (error) {
      this.rethrowAccountConflict(error);
    }
  }

  async update(
    dto: UpdateWechatAccountDto,
    workspaceId: string,
  ): Promise<SanitizedWechatAccount> {
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (dto.name !== undefined) update.name = dto.name;
    if (dto.appId !== undefined) update.app_id = dto.appId;
    if (dto.mpId !== undefined) update.mp_id = this.optionalText(dto.mpId);
    if (dto.serviceType !== undefined) {
      update.service_type = this.optionalText(dto.serviceType);
    }
    if (dto.verify !== undefined) update.verify = dto.verify;
    if (dto.proxyOrigin !== undefined) {
      update.proxy_origin = normalizeProxyOrigin(dto.proxyOrigin);
    }
    if (dto.appSecret?.trim()) {
      update.app_secret_enc = this.secretCipher.encrypt(dto.appSecret);
    }

    try {
      const row = await this.db
        .updateTable('wechat_accounts')
        .set(update)
        .where('id', '=', dto.id)
        .where('workspace_id', '=', workspaceId)
        .returningAll()
        .executeTakeFirst();

      if (!row) {
        throw new NotFoundException('WeChat account not found');
      }

      return this.sanitize(row as WechatAccountRow);
    } catch (error) {
      this.rethrowAccountConflict(error);
    }
  }

  async delete(accountId: string, workspaceId: string): Promise<void> {
    try {
      const result = await this.db
        .deleteFrom('wechat_accounts')
        .where('id', '=', accountId)
        .where('workspace_id', '=', workspaceId)
        .executeTakeFirst();

      if (Number(result.numDeletedRows) === 0) {
        throw new NotFoundException('WeChat account not found');
      }
    } catch (error) {
      if ((error as { code?: string })?.code === '23503') {
        throw new ConflictException('WeChat account is in use');
      }
      throw error;
    }
  }

  /**
   * Exercises the full publish path (token, then a real `media/uploadimg`) so a
   * misconfiguration surfaces here instead of when someone copies an article.
   * The two steps are reported separately because they fail for different
   * reasons: the token step for IP whitelist and credential problems, the
   * upload step for account permissions such as an unverified account.
   */
  async testConnection(
    accountId: string,
    workspaceId: string,
  ): Promise<WechatAccountTestResult> {
    const row = (await this.db
      .selectFrom('wechat_accounts')
      .selectAll()
      .where('id', '=', accountId)
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst()) as WechatAccountRow | undefined;

    if (!row) {
      throw new NotFoundException('WeChat account not found');
    }

    const credentials = {
      accountId: row.id,
      appId: row.app_id,
      appSecret: this.secretCipher.decrypt(row.app_secret_enc),
      proxyOrigin: row.proxy_origin,
    };

    try {
      await this.wechat.verifyCredentials(credentials);
    } catch (error) {
      return { ok: false, step: 'token', message: this.errorMessage(error) };
    }

    try {
      await this.wechat.uploadImage(
        credentials,
        CONNECTION_TEST_PNG,
        'image/png',
        'docmost-connection-test.png',
      );
    } catch (error) {
      return { ok: false, step: 'upload', message: this.errorMessage(error) };
    }

    return { ok: true, step: 'upload' };
  }

  private errorMessage(error: unknown): string {
    const response = (error as { response?: { message?: unknown } })?.response;
    if (typeof response?.message === 'string') {
      return response.message;
    }
    return (error as Error)?.message ?? 'Unknown error';
  }

  private sanitize(row: WechatAccountRow): SanitizedWechatAccount {
    return {
      id: row.id,
      name: row.name,
      appId: row.app_id,
      mpId: row.mp_id,
      serviceType: row.service_type,
      verify: row.verify,
      secretConfigured: Boolean(row.app_secret_enc?.ciphertext),
      proxyOrigin: row.proxy_origin,
    };
  }

  private optionalText(value: string | undefined): string | null {
    return value?.trim() || null;
  }

  private rethrowAccountConflict(error: unknown): never {
    if ((error as { code?: string })?.code === '23505') {
      throw new ConflictException('A WeChat account with this AppID exists');
    }
    throw error;
  }
}
