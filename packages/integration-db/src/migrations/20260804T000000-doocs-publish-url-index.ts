import { Kysely } from 'kysely';

/**
 * The doocs handoff rewrites image URLs to their publish URLs, so writing the
 * page back looks the mapping up by URL instead of by attachment. Without this
 * index that reverse lookup is a sequential scan on every save.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex('doocs_publish_assets_publish_url_idx')
    .on('doocs_publish_assets')
    .columns(['workspace_id', 'publish_url'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex('doocs_publish_assets_publish_url_idx')
    .ifExists()
    .execute();
}
