import { type Kysely, sql } from "kysely";

const timestamps = (table: any): any =>
  table
    .addColumn("created_at", "timestamptz", (col: any) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col: any) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("deleted_at", "timestamptz");

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("publish_templates")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("channel", "varchar", (col) => col.notNull())
    .addColumn("name", "varchar", (col) => col.notNull())
    .addColumn("version", "varchar", (col) => col.notNull())
    .addColumn("git_ref", "varchar")
    .addColumn("options", "jsonb")
    .addColumn("custom_css", "text")
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .$call(timestamps)
    .addUniqueConstraint("uq_publish_templates_identity", [
      "channel",
      "name",
      "version",
    ])
    .execute();

  await db.schema
    .createTable("publish_configs")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("docmost_page_id", "uuid", (col) => col.notNull())
    .addColumn("channel", "varchar", (col) => col.notNull())
    .addColumn("account_id", "uuid", (col) =>
      col.notNull().references("wechat_accounts.id").onDelete("restrict"),
    )
    .addColumn("template_id", "uuid", (col) =>
      col.references("publish_templates.id").onDelete("set null"),
    )
    .addColumn("author", "varchar")
    .addColumn("digest", "text")
    .addColumn("cover_source", "varchar")
    .addColumn("content_source_url", "varchar")
    .addColumn("need_open_comment", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("only_fans_can_comment", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("created_by", "uuid")
    .addColumn("updated_by", "uuid")
    .$call(timestamps)
    .execute();

  await sql`
    CREATE UNIQUE INDEX idx_publish_configs_page_channel
    ON publish_configs (docmost_page_id, channel) WHERE deleted_at IS NULL
  `.execute(db);

  await db.schema
    .createTable("publication_jobs")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("docmost_page_id", "uuid", (col) => col.notNull())
    .addColumn("docmost_slug_id", "varchar")
    .addColumn("docmost_updated_at", "timestamptz")
    .addColumn("source_hash", "varchar", (col) => col.notNull())
    .addColumn("rendered_html_hash", "varchar")
    .addColumn("channel", "varchar", (col) => col.notNull())
    .addColumn("account_id", "uuid", (col) =>
      col.notNull().references("wechat_accounts.id").onDelete("restrict"),
    )
    .addColumn("template_id", "uuid", (col) =>
      col.references("publish_templates.id").onDelete("set null"),
    )
    .addColumn("template_version", "varchar", (col) => col.notNull())
    .addColumn("idempotency_key", "varchar", (col) => col.notNull())
    // queued | scanning | blocked | rendering | uploading | draft_created | failed
    .addColumn("status", "varchar", (col) => col.notNull().defaultTo("queued"))
    .addColumn("remote_draft_id", "varchar")
    .addColumn("warnings", "jsonb")
    .addColumn("error_code", "varchar")
    .addColumn("error_message", "varchar")
    .addColumn("attempt_count", "bigint", (col) => col.notNull().defaultTo(0))
    .addColumn("created_by", "uuid")
    .$call(timestamps)
    .execute();

  await sql`
    CREATE UNIQUE INDEX idx_publication_jobs_idempotency
    ON publication_jobs (idempotency_key) WHERE deleted_at IS NULL
  `.execute(db);
  await sql`
    CREATE INDEX idx_publication_jobs_page_channel
    ON publication_jobs (docmost_page_id, channel, id DESC)
  `.execute(db);
  await db.schema
    .createIndex("idx_publication_jobs_status")
    .on("publication_jobs")
    .column("status")
    .execute();

  await db.schema
    .createTable("publication_assets")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("job_id", "uuid", (col) =>
      col.notNull().references("publication_jobs.id").onDelete("cascade"),
    )
    .addColumn("account_id", "uuid", (col) =>
      col.notNull().references("wechat_accounts.id").onDelete("restrict"),
    )
    // body | cover
    .addColumn("kind", "varchar", (col) => col.notNull())
    .addColumn("source_url", "varchar", (col) => col.notNull())
    .addColumn("source_hash", "varchar", (col) => col.notNull())
    .addColumn("mime", "varchar")
    .addColumn("bytes", "bigint")
    // none | svg_to_png | mermaid_to_png
    .addColumn("transform", "varchar")
    .addColumn("wechat_url", "varchar")
    .addColumn("wechat_media_id", "varchar")
    .$call(timestamps)
    .execute();

  await db.schema
    .createIndex("idx_publication_assets_account_source")
    .on("publication_assets")
    .columns(["account_id", "source_hash"])
    .execute();

  await db.schema
    .createTable("publication_audit")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("actor_id", "uuid")
    .addColumn("actor_type", "varchar", (col) =>
      col.notNull().defaultTo("user"),
    )
    .addColumn("event", "varchar", (col) => col.notNull())
    .addColumn("resource_type", "varchar", (col) => col.notNull())
    .addColumn("resource_id", "uuid")
    .addColumn("changes", "jsonb")
    .addColumn("metadata", "jsonb")
    .addColumn("ip_address", sql`inet`)
    .$call(timestamps)
    .execute();

  await sql`
    CREATE INDEX idx_publication_audit_resource
    ON publication_audit (resource_id, id DESC)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("publication_audit").ifExists().execute();
  await db.schema.dropTable("publication_assets").ifExists().execute();
  await db.schema.dropTable("publication_jobs").ifExists().execute();
  await db.schema.dropTable("publish_configs").ifExists().execute();
  await db.schema.dropTable("publish_templates").ifExists().execute();
}
