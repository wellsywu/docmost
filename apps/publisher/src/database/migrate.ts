import { createDatabase, createMigrator } from "./db.js";
import { migrateIntegrationDatabase } from "@docmost/integration-db";

const command = process.argv[2] ?? "latest";
if (command !== "latest" && command !== "down") {
  throw new Error(`Unknown migration command: ${command}`);
}
const connectionString =
  process.env.PUBLISHER_DATABASE_URL ??
  "postgres://publisher:publisher@127.0.0.1:5432/publisher";
const db = createDatabase(connectionString);
const migrator = createMigrator(db);

try {
  if (command === "latest") {
    await migrateIntegrationDatabase(db);
  }
  const result =
    command === "down"
      ? await migrator.migrateDown()
      : await migrator.migrateToLatest();
  for (const migration of result.results ?? []) {
    console.log(`${migration.status}: ${migration.migrationName}`);
  }
  if (result.error) throw result.error;
} finally {
  await db.destroy();
}
