import type { ColumnType, Generated, Insertable, Selectable } from "kysely";
import type { IntegrationDatabaseSchema } from "@docmost/integration-db";

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type Json = Record<string, unknown> | string[] | null;

interface CommonTimestamps {
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
}

export interface PublishTemplatesTable extends CommonTimestamps {
  id: Generated<string>;
  channel: string;
  name: string;
  version: string;
  git_ref: string | null;
  options: Json;
  custom_css: string | null;
  is_active: Generated<boolean>;
}

export interface PublishConfigsTable extends CommonTimestamps {
  id: Generated<string>;
  docmost_page_id: string;
  channel: string;
  account_id: string;
  template_id: string | null;
  author: string | null;
  digest: string | null;
  cover_source: string | null;
  content_source_url: string | null;
  need_open_comment: boolean;
  only_fans_can_comment: boolean;
  created_by: string | null;
  updated_by: string | null;
}

export interface PublicationJobsTable extends CommonTimestamps {
  id: Generated<string>;
  docmost_page_id: string;
  docmost_slug_id: string | null;
  docmost_updated_at: Timestamp | null;
  source_hash: string;
  rendered_html_hash: string | null;
  channel: string;
  account_id: string;
  template_id: string | null;
  template_version: string;
  idempotency_key: string;
  status: string;
  remote_draft_id: string | null;
  warnings: Json;
  error_code: string | null;
  error_message: string | null;
  attempt_count: Generated<string>;
  created_by: string | null;
}

export interface PublicationAssetsTable extends CommonTimestamps {
  id: Generated<string>;
  job_id: string;
  account_id: string;
  kind: string;
  source_url: string;
  source_hash: string;
  mime: string | null;
  bytes: string | null;
  transform: string | null;
  wechat_url: string | null;
  wechat_media_id: string | null;
}

export interface PublicationAuditTable extends CommonTimestamps {
  id: Generated<string>;
  actor_id: string | null;
  actor_type: string;
  event: string;
  resource_type: string;
  resource_id: string | null;
  changes: Json;
  metadata: Json;
  ip_address: string | null;
}

export interface DB extends IntegrationDatabaseSchema {
  publish_templates: PublishTemplatesTable;
  publish_configs: PublishConfigsTable;
  publication_jobs: PublicationJobsTable;
  publication_assets: PublicationAssetsTable;
  publication_audit: PublicationAuditTable;
}

export type PublicationJobRow = Selectable<PublicationJobsTable>;
export type NewPublicationJobRow = Insertable<PublicationJobsTable>;
