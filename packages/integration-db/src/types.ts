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
  /** OpenAPI proxy that forwards to api.weixin.qq.com; null means direct. */
  proxy_origin: string | null;
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

export type DoocsUploadProvider = 'wechat' | 's3';

export interface DoocsS3UploadConfig {
  endpoint: string | null;
  region: string;
  bucket: string;
  accessKeyId: string;
  path: string | null;
  cdnHost: string | null;
  pathStyle: boolean;
}

export interface DoocsUploadConfigsTable {
  workspace_id: string;
  provider: DoocsUploadProvider;
  s3_config: DoocsS3UploadConfig | null;
  s3_access_key_secret_enc: EncryptedSecretEnvelope | null;
  updated_by: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type DoocsPublishAssetStatus = 'ready' | 'failed';

export interface DoocsPublishAssetsTable {
  id: Generated<string>;
  workspace_id: string;
  page_id: string;
  attachment_id: string;
  provider: DoocsUploadProvider;
  target_id: string;
  config_fingerprint: string;
  content_sha256: string;
  status: DoocsPublishAssetStatus;
  publish_url: string | null;
  media_id: string | null;
  error_message: string | null;
  attempt_count: Generated<number>;
  last_attempt_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface IntegrationDatabaseSchema {
  wechat_accounts: WechatAccountsTable;
  md_user_settings: MdUserSettingsTable;
  md_integration_tickets: MdIntegrationTicketsTable;
  md_integration_sessions: MdIntegrationSessionsTable;
  doocs_upload_configs: DoocsUploadConfigsTable;
  doocs_publish_assets: DoocsPublishAssetsTable;
}

export type IntegrationDatabase = Kysely<IntegrationDatabaseSchema>;
