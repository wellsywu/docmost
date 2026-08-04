import { BadRequestException, Injectable } from '@nestjs/common';
import { IntegrationDatabase } from '@docmost/integration-db';
import { sql } from 'kysely';
import { InjectDoocsDatabase } from '../database/doocs-database.module';
import { DoocsSettingDto } from '../dto/doocs.dto';
import { DOOCS_SETTING_KEYS } from './doocs-settings.constants';

export interface DoocsSetting {
  key: string;
  value: unknown;
  updatedAt: number;
}

@Injectable()
export class DoocsSettingsService {
  constructor(
    @InjectDoocsDatabase() private readonly db: IntegrationDatabase,
  ) {}

  async list(userId: string): Promise<DoocsSetting[]> {
    const rows = await this.db
      .selectFrom('md_user_settings')
      .select(['key', 'value', 'updated_at'])
      .where('user_id', '=', userId)
      .where('key', 'in', [...DOOCS_SETTING_KEYS])
      .orderBy('key', 'asc')
      .execute();

    return rows.map((row) => ({
      key: row.key,
      value: row.value,
      updatedAt: row.updated_at.getTime(),
    }));
  }

  async upsert(
    userId: string,
    settings: DoocsSettingDto[],
  ): Promise<DoocsSetting[]> {
    for (const setting of settings) {
      this.assertAllowed(setting.key);
    }

    if (settings.length === 0) {
      return this.list(userId);
    }

    await this.db
      .insertInto('md_user_settings')
      .values(
        settings.map((setting) => ({
          user_id: userId,
          key: setting.key,
          value: sql`${JSON.stringify(setting.value)}::jsonb`,
          updated_at: new Date(setting.updatedAt),
        })),
      )
      .onConflict((conflict) =>
        conflict.columns(['user_id', 'key']).doUpdateSet({
          value: sql`case
            when excluded.updated_at > md_user_settings.updated_at
            then excluded.value
            else md_user_settings.value
          end`,
          updated_at: sql`greatest(
            md_user_settings.updated_at,
            excluded.updated_at
          )`,
        }),
      )
      .execute();

    return this.list(userId);
  }

  private assertAllowed(key: string): void {
    if (!DOOCS_SETTING_KEYS.has(key)) {
      throw new BadRequestException('Setting key is not allowed');
    }
  }
}
