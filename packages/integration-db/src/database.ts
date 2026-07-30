import { Kysely } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import postgres from 'postgres';
import { IntegrationDatabase, IntegrationDatabaseSchema } from './types';

export interface IntegrationDatabaseOptions {
  maxConnections?: number;
}

export function createIntegrationDatabase(
  connectionString: string,
  options: IntegrationDatabaseOptions = {},
): IntegrationDatabase {
  const client = postgres(connectionString, {
    max: options.maxConnections ?? 5,
    onnotice: () => undefined,
  });

  return new Kysely<IntegrationDatabaseSchema>({
    dialect: new PostgresJSDialect({ postgres: client }),
  });
}
