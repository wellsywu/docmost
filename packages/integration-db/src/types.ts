import { ColumnType, Generated, Kysely } from 'kysely';

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface EncryptedSecretEnvelope {
  version: number;
  algorithm: string;
  iv: string;
  ciphertext: string;
  authTag: string;
}

export interface WechatAccountsTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  app_id: string;
  app_secret_enc: EncryptedSecretEnvelope;
  mp_id: string | null;
  service_type: string | null;
  verify: Generated<boolean>;
  created_by: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface MdUserSettingsTable {
  user_id: string;
  key: string;
  value: unknown;
  updated_at: Timestamp;
}

export interface MdIntegrationTicketsTable {
  ticket_hash: string;
  user_id: string;
  page_id: string;
  expires_at: Timestamp;
  consumed_at: Timestamp | null;
  created_at: Timestamp;
}

export interface MdIntegrationSessionsTable {
  token_hash: string;
  user_id: string;
  page_id: string;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  created_at: Timestamp;
}

export interface IntegrationDatabaseSchema {
  wechat_accounts: WechatAccountsTable;
  md_user_settings: MdUserSettingsTable;
  md_integration_tickets: MdIntegrationTicketsTable;
  md_integration_sessions: MdIntegrationSessionsTable;
}

export type IntegrationDatabase = Kysely<IntegrationDatabaseSchema>;
