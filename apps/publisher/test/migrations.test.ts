import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../src/database/migrations/20260730T010100-publisher-core.ts",
    import.meta.url,
  ),
  "utf8",
);

test("the Publisher migration creates and rolls back its five tables", () => {
  assert.equal([...migration.matchAll(/\.createTable\(/g)].length, 5);
  assert.equal([...migration.matchAll(/\.dropTable\(/g)].length, 5);
  assert.equal([...migration.matchAll(/\.\$call\(timestamps\)/g)].length, 5);
  assert.match(migration, /idx_publication_jobs_idempotency/);
  assert.match(migration, /idx_publication_assets_account_source/);
});

test("no table stores a plaintext secret or a rendered article body", () => {
  const columns = [
    ...migration.matchAll(/\.addColumn\(\s*["']([^"']+)["']/g),
  ].map((match) => match[1]);

  assert.ok(columns.length > 0);
  for (const forbidden of [
    "app_secret",
    "api_key",
    "access_token",
    "rendered_html",
  ]) {
    assert.equal(
      columns.includes(forbidden),
      false,
      `column ${forbidden} must not exist`,
    );
  }
});
