import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('api_keys')
    .addColumn('key_hash', 'text', (col) => col.unique())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('api_keys')
    .dropColumn('key_hash')
    .execute();
}
