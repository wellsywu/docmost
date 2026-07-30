import type {
  PublicationJob,
  PublishConfig,
  PublishInput,
} from "../core/types.js";
import {
  PublicationBlockedError,
  WeChatAccountNotFoundError,
} from "../core/errors.js";
import { publicationKey, sha256 } from "../core/hash.js";
import type { DocmostPort } from "../docmost/client.js";
import {
  scanProseMirror,
  UnsupportedNodeError,
} from "../docmost/node-scanner.js";
import type { RendererPort } from "../rendering/renderer.js";
import { WECHAT_TITLE_LIMIT } from "../wechat/port.js";
import type { WeChatClientFactory } from "../wechat/factory.js";
import { AssetPublisher } from "../media/asset-publisher.js";
import type { PublicationStore } from "./store.js";

export class SourceChangedError extends Error {
  constructor() {
    super("Docmost page body changed during publishing; render again");
    this.name = "SourceChangedError";
  }
}

export class InvalidArticleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidArticleError";
  }
}

export class PublicationService {
  constructor(
    private readonly docmost: DocmostPort,
    private readonly renderer: RendererPort,
    private readonly assets: AssetPublisher,
    private readonly store: PublicationStore,
    private readonly createWechat: WeChatClientFactory,
    private readonly defaults: {
      templateVersion: string;
    },
  ) {}

  async publish(input: PublishInput): Promise<PublicationJob> {
    const account = await this.store.findWechatAccount(input.accountId);
    if (!account) throw new WeChatAccountNotFoundError();
    const wechat = this.createWechat(account);
    const config: PublishConfig = {
      ...input,
      channel: "wechat",
      templateVersion: this.defaults.templateVersion,
    };
    await this.store.saveConfig(config);
    await this.store.recordAudit(
      "publish_config.saved",
      "docmost_page",
      input.pageId,
      {
        channel: config.channel,
        templateVersion: config.templateVersion,
      },
    );

    const jsonPage = await this.docmost.readJson(input.pageId);
    const warnings = scanProseMirror(jsonPage.content);
    if (warnings.length > 0) {
      const blocked = await this.store.createJob({
        pageId: input.pageId,
        sourceHash: sha256(JSON.stringify(jsonPage.content)),
        idempotencyKey: publicationKey({
          pageId: input.pageId,
          sourceHash: sha256(JSON.stringify(jsonPage.content)),
          channel: "wechat",
          accountId: config.accountId,
          templateVersion: config.templateVersion,
        }),
        status: "blocked",
        accountId: config.accountId,
        templateVersion: config.templateVersion,
        warnings,
      });
      await this.store.recordAudit(
        "publication.blocked_unsupported_nodes",
        "publication_job",
        blocked.job.id,
        { warningCount: warnings.length },
      );
      throw new UnsupportedNodeError(blocked.job.warnings);
    }

    const source = await this.docmost.readMarkdown(input.pageId);
    // Checked before claiming a job so an over-long title cannot leave a failed
    // job behind, and so the operator learns about it before any upload.
    const titleLength = [...source.title].length;
    if (titleLength > WECHAT_TITLE_LIMIT) {
      throw new InvalidArticleError(
        `微信标题最多 ${WECHAT_TITLE_LIMIT} 个字符，当前 ${titleLength} 个。请先缩短 Docmost 页面标题。`,
      );
    }
    const sourceHash = sha256(source.content);
    const idempotencyKey = publicationKey({
      pageId: input.pageId,
      sourceHash,
      channel: config.channel,
      accountId: config.accountId,
      templateVersion: config.templateVersion,
    });
    const prior = await this.store.findJobByKey(idempotencyKey);
    if (prior?.status === "draft_created") return prior;

    const claimed = await this.store.createJob({
      pageId: input.pageId,
      sourceHash,
      idempotencyKey,
      status: "rendering",
      accountId: config.accountId,
      templateVersion: config.templateVersion,
      warnings: [],
    });
    if (!claimed.created) return claimed.job;
    const job = claimed.job;
    await this.store.recordAudit(
      "publication.started",
      "publication_job",
      job.id,
      { sourceHash, templateVersion: config.templateVersion },
    );

    try {
      const rendered = await this.renderer.render(source.content);
      const renderedHtmlHash = sha256(rendered.html);
      await this.store.updateJob(job.id, {
        status: "uploading",
        renderedHtmlHash,
      });
      const published = await this.assets.publishBody(
        job.id,
        config.accountId,
        rendered,
        wechat,
      );
      const latest = await this.docmost.readMarkdown(input.pageId);
      if (sha256(latest.content) !== sourceHash) {
        await this.store.updateJob(job.id, {
          status: "blocked",
          errorCode: "SOURCE_CHANGED",
          errorMessage: "Docmost body hash changed before draft creation",
        });
        await this.store.recordAudit(
          "publication.blocked_source_changed",
          "publication_job",
          job.id,
        );
        throw new SourceChangedError();
      }
      const thumbMediaId = await this.assets.publishCover(
        job.id,
        config.accountId,
        published.cover,
        wechat,
      );
      const draft = await wechat.createDraft({
        title: source.title,
        author: config.author,
        digest: config.digest,
        content: published.html,
        contentSourceUrl: config.contentSourceUrl,
        thumbMediaId,
        needOpenComment: config.needOpenComment ? 1 : 0,
        onlyFansCanComment: config.onlyFansCanComment ? 1 : 0,
      });
      await this.store.updateJob(job.id, {
        status: "draft_created",
        remoteDraftId: draft.mediaId,
        renderedHtmlHash,
      });
      await this.store.recordAudit(
        "publication.draft_created",
        "publication_job",
        job.id,
        { remoteDraftId: draft.mediaId },
      );
      return {
        ...job,
        status: "draft_created",
        remoteDraftId: draft.mediaId,
        renderedHtmlHash,
      };
    } catch (error) {
      if (error instanceof PublicationBlockedError) {
        await this.store.updateJob(job.id, {
          status: "blocked",
          errorCode: error.code,
          errorMessage: error.message,
          warnings: [error.message],
        });
        await this.store.recordAudit(
          "publication.blocked_content",
          "publication_job",
          job.id,
          { errorName: error.name, errorCode: error.code },
        );
      } else if (!(error instanceof SourceChangedError)) {
        await this.store.updateJob(job.id, {
          status: "failed",
          errorCode: "PUBLISH_FAILED",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        await this.store.recordAudit(
          "publication.failed",
          "publication_job",
          job.id,
          { errorName: error instanceof Error ? error.name : "UnknownError" },
        );
      }
      throw error;
    }
  }

  getConfig(pageId: string): Promise<PublishConfig | undefined> {
    return this.store.getConfig(pageId);
  }

  listAccounts() {
    return this.store.listWechatAccounts();
  }
}
