import { readFileSync } from 'node:fs';
import * as path from 'node:path';

describe('Doocs database deployment isolation', () => {
  const repositoryRoot = path.resolve(__dirname, '../../../../..');
  const compose = readFileSync(
    path.join(repositoryRoot, 'docker-compose.yml'),
    'utf8',
  );
  const initScript = readFileSync(
    path.join(
      repositoryRoot,
      'packages/integration-db/docker/init-integration-database.sh',
    ),
    'utf8',
  );
  const migration = readFileSync(
    path.join(
      repositoryRoot,
      'packages/integration-db/src/migrations/20260730T000000-md-integration.ts',
    ),
    'utf8',
  );
  const uploadConfigMigration = readFileSync(
    path.join(
      repositoryRoot,
      'packages/integration-db/src/migrations/20260801T000000-doocs-upload-config.ts',
    ),
    'utf8',
  );
  const publishAssetMigration = readFileSync(
    path.join(
      repositoryRoot,
      'packages/integration-db/src/migrations/20260802T000000-doocs-publish-assets.ts',
    ),
    'utf8',
  );

  it('uses one PostgreSQL server and two isolated databases', () => {
    expect(compose.match(/image:\s*postgres:16-alpine/g)).toHaveLength(1);
    expect(compose).toContain('/docker-entrypoint-initdb.d/');
    expect(compose).toContain('/docmost_integrations');
  });

  it('creates the integration database idempotently', () => {
    expect(initScript).toContain("datname = 'docmost_integrations'");
    expect(initScript).toContain('WHERE NOT EXISTS');
    expect(initScript).toContain('\\gexec');
  });

  it('keeps the integration schema and encrypted credentials in the shared package', () => {
    for (const table of [
      'wechat_accounts',
      'md_user_settings',
      'md_integration_tickets',
      'md_integration_sessions',
    ]) {
      expect(migration).toContain(`createTable('${table}')`);
    }
    expect(migration).toContain("'app_secret_enc'");
    expect(migration).not.toMatch(/'app_secret'/);
    expect(uploadConfigMigration).toContain(
      "createTable('doocs_upload_configs')",
    );
    expect(uploadConfigMigration).toContain("'s3_access_key_secret_enc'");
    expect(uploadConfigMigration).not.toMatch(/'s3_access_key_secret'/);
    expect(publishAssetMigration).toContain(
      "createTable('doocs_publish_assets')",
    );
    expect(publishAssetMigration).toContain("'attachment_id'");
    expect(publishAssetMigration).not.toMatch(/secret|access_token/i);
  });
});
