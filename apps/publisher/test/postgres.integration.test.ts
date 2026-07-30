import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createDatabase, createMigrator } from "../src/database/db.js";
import { KyselyPublicationStore } from "../src/publication/store.js";
import { migrateIntegrationDatabase } from "@docmost/integration-db";

const databaseUrl = process.env.PUBLISHER_TEST_DATABASE_URL;

test(
  "PostgreSQL store enforces idempotency and partial unique upserts",
  { skip: databaseUrl ? false : "PUBLISHER_TEST_DATABASE_URL is not set" },
  async () => {
    assert.ok(databaseUrl);
    const db = createDatabase(databaseUrl);
    const store = new KyselyPublicationStore(db);
    const accountId = randomUUID();
    const pageId = randomUUID();
    const templateVersion = `integration-${randomUUID()}`;
    const idempotencyKey = `integration-${randomUUID()}`;

    try {
      await migrateIntegrationDatabase(db);
      const migration = await createMigrator(db).migrateToLatest();
      assert.ifError(migration.error);

      await db
        .insertInto("wechat_accounts")
        .values({
          id: accountId,
          workspace_id: randomUUID(),
          name: "Test account",
          app_id: `wx-${randomUUID()}`,
          app_secret_enc: {
            version: 1,
            algorithm: "aes-256-gcm",
            iv: "test-iv",
            ciphertext: "test-ciphertext",
            authTag: "test-auth-tag",
          },
          mp_id: null,
          service_type: null,
          verify: false,
          created_by: randomUUID(),
        })
        .execute();
      await store.initializeTemplate(templateVersion);

      const attempts = await Promise.all(
        Array.from({ length: 12 }, () =>
          store.createJob({
            pageId,
            sourceHash: "source-hash",
            idempotencyKey,
            status: "queued",
            accountId,
            templateVersion,
            warnings: [],
          }),
        ),
      );

      assert.equal(attempts.filter((attempt) => attempt.created).length, 1);
      assert.equal(new Set(attempts.map((attempt) => attempt.job.id)).size, 1);

      await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          store.saveConfig({
            pageId,
            channel: "wechat",
            accountId,
            templateVersion,
            author: `author-${index}`,
            needOpenComment: false,
            onlyFansCanComment: false,
          }),
        ),
      );

      const activeBeforeDelete = await db
        .selectFrom("publish_configs")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .where("docmost_page_id", "=", pageId)
        .where("deleted_at", "is", null)
        .executeTakeFirstOrThrow();
      assert.equal(Number(activeBeforeDelete.count), 1);

      await db
        .updateTable("publish_configs")
        .set({ deleted_at: new Date() })
        .where("docmost_page_id", "=", pageId)
        .execute();
      await store.saveConfig({
        pageId,
        channel: "wechat",
        accountId,
        templateVersion,
        author: "replacement",
        needOpenComment: true,
        onlyFansCanComment: false,
      });

      const configRows = await db
        .selectFrom("publish_configs")
        .select(["deleted_at"])
        .where("docmost_page_id", "=", pageId)
        .execute();
      assert.equal(configRows.length, 2);
      assert.equal(
        configRows.filter((row) => row.deleted_at === null).length,
        1,
      );
    } finally {
      const jobIds = (
        await db
          .selectFrom("publication_jobs")
          .select("id")
          .where("docmost_page_id", "=", pageId)
          .execute()
      ).map((row) => row.id);
      if (jobIds.length > 0) {
        await db
          .deleteFrom("publication_audit")
          .where("resource_id", "in", jobIds)
          .execute();
      }
      await db
        .deleteFrom("publication_assets")
        .where("account_id", "=", accountId)
        .execute();
      await db
        .deleteFrom("publish_configs")
        .where("docmost_page_id", "=", pageId)
        .execute();
      await db
        .deleteFrom("publication_jobs")
        .where("docmost_page_id", "=", pageId)
        .execute();
      await db
        .deleteFrom("wechat_accounts")
        .where("id", "=", accountId)
        .execute();
      await db
        .deleteFrom("publish_templates")
        .where("version", "=", templateVersion)
        .execute();
      await db.destroy();
    }
  },
);
