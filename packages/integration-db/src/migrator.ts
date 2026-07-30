import { Kysely, Migration, MigrationProvider, Migrator } from 'kysely';
import * as initialMigration from './migrations/20260730T000000-md-integration';

export const INTEGRATION_MIGRATION_TABLE = 'integration_migrations';
export const INTEGRATION_MIGRATION_LOCK_TABLE = 'integration_migration_lock';

const migrations: Record<string, Migration> = {
  '20260730T000000-md-integration': initialMigration,
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
