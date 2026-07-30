import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { EncryptedSecretEnvelope } from "@docmost/integration-db";
import type {
  BinaryAsset,
  PublicationJob,
  PublicationStatus,
  PublishConfig,
} from "../core/types.js";
import type { DB, PublicationJobRow } from "../database/types/db.js";

export interface StoredAsset {
  accountId: string;
  sourceHash: string;
  wechatUrl?: string;
  wechatMediaId?: string;
  sourceUrl: string;
  mime: string;
  bytes: number;
  transform: BinaryAsset["transform"];
}

export interface StoredWechatAccount {
  id: string;
  workspaceId: string;
  name: string;
  appId: string;
  appSecretEnvelope: EncryptedSecretEnvelope;
  mpId?: string;
  serviceType?: string;
  verify: boolean;
}

export type SanitizedWechatAccount = Omit<
  StoredWechatAccount,
  "appId" | "appSecretEnvelope"
>;

export interface PublicationStore {
  findWechatAccount(id: string): Promise<StoredWechatAccount | undefined>;
  listWechatAccounts(): Promise<SanitizedWechatAccount[]>;
  findJobByKey(key: string): Promise<PublicationJob | undefined>;
  createJob(
    input: Omit<PublicationJob, "id" | "createdAt">,
  ): Promise<{ job: PublicationJob; created: boolean }>;
  updateJob(
    id: string,
    patch: Partial<
      Pick<
        PublicationJob,
        | "status"
        | "warnings"
        | "remoteDraftId"
        | "renderedHtmlHash"
        | "errorCode"
        | "errorMessage"
      >
    >,
  ): Promise<void>;
  findAsset(
    accountId: string,
    sourceHash: string,
  ): Promise<StoredAsset | undefined>;
  saveAsset(jobId: string, asset: StoredAsset): Promise<void>;
  getConfig(pageId: string): Promise<PublishConfig | undefined>;
  saveConfig(config: PublishConfig): Promise<void>;
  recordAudit(
    event: string,
    resourceType: string,
    resourceId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
}

export class MemoryPublicationStore implements PublicationStore {
  private readonly jobs = new Map<string, PublicationJob>();
  private readonly jobKeys = new Map<string, string>();
  private readonly assets = new Map<string, StoredAsset>();
  private readonly configs = new Map<string, PublishConfig>();
  private readonly accounts = new Map<string, StoredWechatAccount>();
  readonly audits: Array<{
    event: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }> = [];

  constructor(accounts: StoredWechatAccount[] = []) {
    for (const account of accounts) this.accounts.set(account.id, account);
  }

  async findWechatAccount(
    id: string,
  ): Promise<StoredWechatAccount | undefined> {
    return this.accounts.get(id);
  }

  async listWechatAccounts(): Promise<SanitizedWechatAccount[]> {
    return [...this.accounts.values()].map((account) => ({
      id: account.id,
      workspaceId: account.workspaceId,
      name: account.name,
      mpId: account.mpId,
      serviceType: account.serviceType,
      verify: account.verify,
    }));
  }

  async findJobByKey(key: string): Promise<PublicationJob | undefined> {
    const id = this.jobKeys.get(key);
    return id ? this.jobs.get(id) : undefined;
  }

  async createJob(
    input: Omit<PublicationJob, "id" | "createdAt">,
  ): Promise<{ job: PublicationJob; created: boolean }> {
    const existingId = this.jobKeys.get(input.idempotencyKey);
    const existing = existingId ? this.jobs.get(existingId) : undefined;
    if (existing) return { job: existing, created: false };
    const job: PublicationJob = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    this.jobKeys.set(job.idempotencyKey, job.id);
    return { job, created: true };
  }

  async updateJob(id: string, patch: Partial<PublicationJob>): Promise<void> {
    const current = this.jobs.get(id);
    if (!current) throw new Error(`Publication job ${id} not found`);
    this.jobs.set(id, { ...current, ...patch });
  }

  async findAsset(
    accountId: string,
    sourceHash: string,
  ): Promise<StoredAsset | undefined> {
    return this.assets.get(`${accountId}:${sourceHash}`);
  }

  async saveAsset(_jobId: string, asset: StoredAsset): Promise<void> {
    const key = `${asset.accountId}:${asset.sourceHash}`;
    this.assets.set(key, { ...this.assets.get(key), ...asset });
  }

  async getConfig(pageId: string): Promise<PublishConfig | undefined> {
    return this.configs.get(`${pageId}:wechat`);
  }

  async saveConfig(config: PublishConfig): Promise<void> {
    this.configs.set(`${config.pageId}:${config.channel}`, config);
  }

  async recordAudit(
    event: string,
    resourceType: string,
    resourceId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    this.audits.push({ event, resourceType, resourceId, metadata });
  }
}

function mapJob(row: PublicationJobRow): PublicationJob {
  return {
    id: row.id,
    pageId: row.docmost_page_id,
    sourceHash: row.source_hash,
    renderedHtmlHash: row.rendered_html_hash ?? undefined,
    idempotencyKey: row.idempotency_key,
    status: row.status as PublicationStatus,
    accountId: row.account_id,
    templateVersion: row.template_version,
    remoteDraftId: row.remote_draft_id ?? undefined,
    warnings: Array.isArray(row.warnings) ? row.warnings.map(String) : [],
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export class KyselyPublicationStore implements PublicationStore {
  constructor(private readonly db: Kysely<DB>) {}

  async findWechatAccount(
    id: string,
  ): Promise<StoredWechatAccount | undefined> {
    const row = await this.db
      .selectFrom("wechat_accounts")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row
      ? {
          id: row.id,
          workspaceId: row.workspace_id,
          name: row.name,
          appId: row.app_id,
          appSecretEnvelope: row.app_secret_enc,
          mpId: row.mp_id ?? undefined,
          serviceType: row.service_type ?? undefined,
          verify: row.verify,
        }
      : undefined;
  }

  async listWechatAccounts(): Promise<SanitizedWechatAccount[]> {
    const rows = await this.db
      .selectFrom("wechat_accounts")
      .select([
        "id",
        "workspace_id",
        "name",
        "mp_id",
        "service_type",
        "verify",
      ])
      .orderBy("name")
      .execute();
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      mpId: row.mp_id ?? undefined,
      serviceType: row.service_type ?? undefined,
      verify: row.verify,
    }));
  }

  async initializeTemplate(templateVersion: string): Promise<void> {
    await this.db
      .insertInto("publish_templates")
      .values({
        channel: "wechat",
        name: "tech-default",
        version: templateVersion,
        git_ref: null,
        options: { primaryColor: "#0f766e" },
        custom_css: null,
        is_active: true,
      })
      .onConflict((conflict) =>
        conflict.columns(["channel", "name", "version"]).doNothing(),
      )
      .execute();
  }

  async findJobByKey(key: string): Promise<PublicationJob | undefined> {
    const row = await this.db
      .selectFrom("publication_jobs")
      .selectAll()
      .where("idempotency_key", "=", key)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    return row ? mapJob(row) : undefined;
  }

  async createJob(
    input: Omit<PublicationJob, "id" | "createdAt">,
  ): Promise<{ job: PublicationJob; created: boolean }> {
    const row = await this.db
      .insertInto("publication_jobs")
      .values({
        docmost_page_id: input.pageId,
        source_hash: input.sourceHash,
        channel: "wechat",
        account_id: input.accountId,
        template_version: input.templateVersion,
        idempotency_key: input.idempotencyKey,
        status: input.status,
        warnings: input.warnings,
        rendered_html_hash: input.renderedHtmlHash ?? null,
        remote_draft_id: input.remoteDraftId ?? null,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        docmost_slug_id: null,
        docmost_updated_at: null,
        template_id: null,
        created_by: null,
      })
      .onConflict((conflict) =>
        conflict
          .column("idempotency_key")
          .where("deleted_at", "is", null)
          .doNothing(),
      )
      .returningAll()
      .executeTakeFirst();
    if (row) return { job: mapJob(row), created: true };
    const existing = await this.findJobByKey(input.idempotencyKey);
    if (!existing) throw new Error("Idempotent publication insert failed");
    return { job: existing, created: false };
  }

  async updateJob(id: string, patch: Partial<PublicationJob>): Promise<void> {
    await this.db
      .updateTable("publication_jobs")
      .set({
        status: patch.status,
        warnings: patch.warnings,
        remote_draft_id: patch.remoteDraftId,
        rendered_html_hash: patch.renderedHtmlHash,
        error_code: patch.errorCode,
        error_message: patch.errorMessage,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
  }

  async findAsset(
    accountId: string,
    sourceHash: string,
  ): Promise<StoredAsset | undefined> {
    const rows = await this.db
      .selectFrom("publication_assets")
      .selectAll()
      .where("account_id", "=", accountId)
      .where("source_hash", "=", sourceHash)
      .orderBy("created_at", "desc")
      .execute();
    const row = rows[0];
    return row
      ? {
          accountId,
          sourceHash,
          sourceUrl: row.source_url,
          mime: row.mime ?? "application/octet-stream",
          bytes: Number(row.bytes ?? 0),
          transform: (row.transform ?? "none") as BinaryAsset["transform"],
          wechatUrl:
            rows.find((candidate) => candidate.wechat_url)?.wechat_url ??
            undefined,
          wechatMediaId:
            rows.find((candidate) => candidate.wechat_media_id)
              ?.wechat_media_id ?? undefined,
        }
      : undefined;
  }

  async saveAsset(jobId: string, asset: StoredAsset): Promise<void> {
    await this.db
      .insertInto("publication_assets")
      .values({
        job_id: jobId,
        account_id: asset.accountId,
        kind: asset.wechatMediaId ? "cover" : "body",
        source_url: asset.sourceUrl,
        source_hash: asset.sourceHash,
        mime: asset.mime,
        bytes: String(asset.bytes),
        transform: asset.transform,
        wechat_url: asset.wechatUrl ?? null,
        wechat_media_id: asset.wechatMediaId ?? null,
      })
      .execute();
  }

  async getConfig(pageId: string): Promise<PublishConfig | undefined> {
    const row = await this.db
      .selectFrom("publish_configs")
      .selectAll()
      .where("docmost_page_id", "=", pageId)
      .where("channel", "=", "wechat")
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    return row
      ? {
          pageId,
          channel: "wechat",
          accountId: row.account_id,
          templateVersion: "configured",
          author: row.author ?? "",
          digest: row.digest ?? undefined,
          contentSourceUrl: row.content_source_url ?? undefined,
          needOpenComment: row.need_open_comment,
          onlyFansCanComment: row.only_fans_can_comment,
        }
      : undefined;
  }

  async saveConfig(config: PublishConfig): Promise<void> {
    await this.db
      .insertInto("publish_configs")
      .values({
        docmost_page_id: config.pageId,
        channel: config.channel,
        account_id: config.accountId,
        template_id: null,
        author: config.author,
        digest: config.digest ?? null,
        cover_source: "first-image",
        content_source_url: config.contentSourceUrl ?? null,
        need_open_comment: config.needOpenComment,
        only_fans_can_comment: config.onlyFansCanComment,
        created_by: null,
        updated_by: null,
      })
      .onConflict((conflict) =>
        conflict
          .columns(["docmost_page_id", "channel"])
          .where("deleted_at", "is", null)
          .doUpdateSet({
            account_id: config.accountId,
            author: config.author,
            digest: config.digest ?? null,
            content_source_url: config.contentSourceUrl ?? null,
            need_open_comment: config.needOpenComment,
            only_fans_can_comment: config.onlyFansCanComment,
            updated_at: new Date(),
          }),
      )
      .execute();
  }

  async recordAudit(
    event: string,
    resourceType: string,
    resourceId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.db
      .insertInto("publication_audit")
      .values({
        actor_id: null,
        actor_type: "system",
        event,
        resource_type: resourceType,
        resource_id: resourceId ?? null,
        changes: null,
        metadata: metadata ?? null,
        ip_address: null,
      })
      .execute();
  }
}
