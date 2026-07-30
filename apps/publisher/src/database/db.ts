import { FileMigrationProvider, Kysely, Migrator } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { DB } from "./types/db.js";

export function createDatabase(connectionString: string): Kysely<DB> {
  const client = postgres(connectionString, {
    max: 10,
    onnotice: () => undefined,
  });
  return new Kysely<DB>({
    dialect: new PostgresJSDialect({ postgres: client }),
  });
}

export function createMigrator(db: Kysely<DB>): Migrator {
  const directory = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "migrations",
  );
  return new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path: {
        join: (...parts) => pathToFileURL(path.join(...parts)).href,
      },
      migrationFolder: directory,
    }),
  });
}
