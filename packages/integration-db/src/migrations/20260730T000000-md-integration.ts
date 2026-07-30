import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('wechat_accounts')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('workspace_id', 'uuid', (col) => col.notNull())
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('app_id', 'varchar', (col) => col.notNull())
    .addColumn('app_secret_enc', 'jsonb', (col) => col.notNull())
    .addColumn('mp_id', 'varchar')
    .addColumn('service_type', 'varchar')
    .addColumn('verify', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('wechat_accounts_workspace_app_id_unique', [
      'workspace_id',
      'app_id',
    ])
    .addCheckConstraint(
      'wechat_accounts_secret_envelope_check',
      sql`jsonb_typeof(app_secret_enc) = 'object'
        and app_secret_enc ?& array['version', 'algorithm', 'iv', 'ciphertext', 'authTag']`,
    )
    .execute();

  await db.schema
    .createTable('md_user_settings')
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('key', 'varchar', (col) => col.notNull())
    .addColumn('value', 'jsonb', (col) => col.notNull())
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint('md_user_settings_primary', ['user_id', 'key'])
    .execute();

  await db.schema
    .createTable('md_integration_tickets')
    .addColumn('ticket_hash', 'char(64)', (col) => col.primaryKey())
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('page_id', 'uuid', (col) => col.notNull())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('consumed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    create index md_integration_tickets_active_expiry_idx
    on md_integration_tickets (expires_at)
    where consumed_at is null
  `.execute(db);

  // mdSession is stateful so it can be revoked without rotating APP_SECRET.
  // The business endpoints and token lifecycle are intentionally deferred.
  await db.schema
    .createTable('md_integration_sessions')
    .addColumn('token_hash', 'char(64)', (col) => col.primaryKey())
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('page_id', 'uuid', (col) => col.notNull())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    create index md_integration_sessions_active_expiry_idx
    on md_integration_sessions (expires_at)
    where revoked_at is null
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('md_integration_sessions').ifExists().execute();
  await db.schema.dropTable('md_integration_tickets').ifExists().execute();
  await db.schema.dropTable('md_user_settings').ifExists().execute();
  await db.schema.dropTable('wechat_accounts').ifExists().execute();
}
