import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('doocs_upload_configs')
    .addColumn('workspace_id', 'uuid', (col) => col.primaryKey())
    .addColumn('provider', 'varchar', (col) =>
      col.notNull().defaultTo('wechat'),
    )
    .addColumn('s3_config', 'jsonb')
    .addColumn('s3_access_key_secret_enc', 'jsonb')
    .addColumn('updated_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint(
      'doocs_upload_configs_provider_check',
      sql`provider in ('wechat', 's3')`,
    )
    .addCheckConstraint(
      'doocs_upload_configs_s3_secret_envelope_check',
      sql`s3_access_key_secret_enc is null
        or (
          jsonb_typeof(s3_access_key_secret_enc) = 'object'
          and s3_access_key_secret_enc ?& array['version', 'algorithm', 'iv', 'ciphertext', 'authTag']
        )`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('doocs_upload_configs').ifExists().execute();
}
