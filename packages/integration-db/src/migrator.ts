import { Kysely, Migration, MigrationProvider, Migrator } from 'kysely';
import * as initialMigration from './migrations/20260730T000000-md-integration';
import * as doocsUploadConfigMigration from './migrations/20260801T000000-doocs-upload-config';
import * as doocsPublishAssetsMigration from './migrations/20260802T000000-doocs-publish-assets';
import * as wechatAccountProxyOriginMigration from './migrations/20260803T000000-wechat-account-proxy-origin';
import * as doocsPublishUrlIndexMigration from './migrations/20260804T000000-doocs-publish-url-index';

export const INTEGRATION_MIGRATION_TABLE = 'integration_migrations';
export const INTEGRATION_MIGRATION_LOCK_TABLE = 'integration_migration_lock';

const migrations: Record<string, Migration> = {
  '20260730T000000-md-integration': initialMigration,
  '20260801T000000-doocs-upload-config': doocsUploadConfigMigration,
  '20260802T000000-doocs-publish-assets': doocsPublishAssetsMigration,
  '20260803T000000-wechat-account-proxy-origin':
    wechatAccountProxyOriginMigration,
  '20260804T000000-doocs-publish-url-index': doocsPublishUrlIndexMigration,
};

export const integrationMigrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};

export function createIntegrationMigrator(db: Kysely<any>): Migrator {
  return new Migrator({
    db,
    provider: integrationMigrationProvider,
    migrationTableName: INTEGRATION_MIGRATION_TABLE,
    migrationLockTableName: INTEGRATION_MIGRATION_LOCK_TABLE,
  });
}

export async function migrateIntegrationDatabase(db: unknown): Promise<void> {
  const { error } = await createIntegrationMigrator(
    db as Kysely<any>,
  ).migrateToLatest();
  if (error) {
    const migrationError = new Error(
      'Failed to migrate the integration database',
    );
    (migrationError as Error & { cause?: unknown }).cause = error;
    throw migrationError;
  }
}
