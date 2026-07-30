import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EncryptedSecretEnvelope,
  IntegrationDatabase,
} from '@docmost/integration-db';
import { InjectMdDatabase } from '../database/md-database.module';
import {
  CreateWechatAccountDto,
  UpdateWechatAccountDto,
} from '../dto/wechat-account.dto';
import { MdSecretCipherService } from '../security/md-secret-cipher.service';

interface WechatAccountRow {
  id: string;
  name: string;
  app_id: string;
  app_secret_enc: EncryptedSecretEnvelope;
  mp_id: string | null;
  service_type: string | null;
  verify: boolean;
}

export interface SanitizedWechatAccount {
  id: string;
  name: string;
  appId: string;
  mpId: string | null;
  serviceType: string | null;
  verify: boolean;
  secretConfigured: boolean;
}

@Injectable()
export class WechatAccountService {
  constructor(
    @InjectMdDatabase() private readonly db: IntegrationDatabase,
    private readonly secretCipher: MdSecretCipherService,
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

  private sanitize(row: WechatAccountRow): SanitizedWechatAccount {
    return {
      id: row.id,
      name: row.name,
      appId: row.app_id,
      mpId: row.mp_id,
      serviceType: row.service_type,
      verify: row.verify,
      secretConfigured: Boolean(row.app_secret_enc?.ciphertext),
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
