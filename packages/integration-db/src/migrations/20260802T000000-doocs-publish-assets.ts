import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('doocs_publish_assets')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('workspace_id', 'uuid', (col) => col.notNull())
    .addColumn('page_id', 'uuid', (col) => col.notNull())
    .addColumn('attachment_id', 'uuid', (col) => col.notNull())
    .addColumn('provider', 'varchar', (col) => col.notNull())
    .addColumn('target_id', 'varchar', (col) => col.notNull())
    .addColumn('config_fingerprint', 'char(64)', (col) => col.notNull())
    .addColumn('content_sha256', 'char(64)', (col) => col.notNull())
    .addColumn('status', 'varchar', (col) => col.notNull())
    .addColumn('publish_url', 'text')
    .addColumn('media_id', 'text')
    .addColumn('error_message', 'varchar')
    .addColumn('attempt_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('last_attempt_at', 'timestamptz', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint(
      'doocs_publish_assets_provider_check',
      sql`provider in ('wechat', 's3')`,
    )
    .addCheckConstraint(
      'doocs_publish_assets_status_check',
      sql`status in ('ready', 'failed')`,
    )
    .addUniqueConstraint('doocs_publish_assets_target_unique', [
      'workspace_id',
      'attachment_id',
      'provider',
      'target_id',
      'config_fingerprint',
      'content_sha256',
    ])
    .execute();

  await db.schema
    .createIndex('doocs_publish_assets_page_idx')
    .on('doocs_publish_assets')
    .columns(['workspace_id', 'page_id', 'attachment_id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('doocs_publish_assets').ifExists().execute();
}
