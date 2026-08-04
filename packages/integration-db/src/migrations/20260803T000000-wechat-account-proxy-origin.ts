import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('wechat_accounts')
    .addColumn('proxy_origin', 'varchar')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('wechat_accounts')
    .dropColumn('proxy_origin')
    .execute();
}
