import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import type { PublisherConfig } from "./config.js";
import { DocmostClient } from "./docmost/client.js";
import { registerAuth } from "./http/auth.js";
import { consoleHtml } from "./http/console.js";
import { AssetPublisher } from "./media/asset-publisher.js";
import { DefaultCoverLoader } from "./media/default-cover.js";
import { Rasterizer } from "./media/rasterizer.js";
import { MermaidRenderer } from "./rendering/mermaid.js";
import { WeChatArticleRenderer } from "./rendering/renderer.js";
import type { WeChatPort } from "./wechat/port.js";
import {
  createWeChatClientFactory,
  type WeChatClientFactory,
} from "./wechat/factory.js";
import {
  KyselyPublicationStore,
  MemoryPublicationStore,
  type PublicationStore,
} from "./publication/store.js";
import { PublicationService } from "./publication/service.js";
import { createDatabase, createMigrator } from "./database/db.js";
import { migrateIntegrationDatabase } from "@docmost/integration-db";

const publishSchema = z.object({
  pageId: z.string().uuid(),
  accountId: z.string().uuid(),
  author: z.string().trim().min(1).max(64),
  digest: z.string().trim().max(120).optional(),
  contentSourceUrl: z.string().url().optional().or(z.literal("")),
  needOpenComment: z.boolean().default(false),
  onlyFansCanComment: z.boolean().default(false),
});

/**
 * Errors the caller can act on. Anything else is an upstream failure (502).
 */
const STATUS_BY_ERROR_NAME: Record<string, number> = {
  UnsupportedNodeError: 409,
  SourceChangedError: 409,
  InvalidArticleError: 422,
  MermaidRenderError: 422,
  RasterizationError: 422,
  UnsupportedImageError: 422,
  MissingCoverError: 422,
  WeChatAccountNotFoundError: 404,
  WeChatAccountUnavailableError: 422,
};

export interface AppOverrides {
  publication?: PublicationService;
  store?: PublicationStore;
  wechatFactory?: WeChatClientFactory;
  /** Test-only compatibility hook for a fixed mock client. */
  wechat?: WeChatPort;
}

export async function buildApp(
  config: PublisherConfig,
  overrides: AppOverrides = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      redact: {
        paths: [
          "req.headers.authorization",
          "DOCMOST_API_KEY",
          "APP_SECRET",
          "INTEGRATION_ENCRYPTION_SECRET",
          "*.access_token",
          "*.appId",
          "*.appSecret",
          "*.app_secret_enc",
          "*.secret",
        ],
        censor: "[REDACTED]",
      },
    },
  });
  registerAuth(app, config);

  let store = overrides.store;
  let closeDatabase: (() => Promise<void>) | undefined;
  if (!store) {
    if (config.PUBLISHER_USE_MEMORY_STORE) {
      store = new MemoryPublicationStore();
    } else {
      const db = createDatabase(config.PUBLISHER_DATABASE_URL);
      await migrateIntegrationDatabase(db);
      const migration = await createMigrator(db).migrateToLatest();
      if (migration.error) throw migration.error;
      const databaseStore = new KyselyPublicationStore(db);
      await databaseStore.initializeTemplate(config.PUBLISHER_TEMPLATE_VERSION);
      store = databaseStore;
      closeDatabase = () => db.destroy();
    }
  }

  const createWechat =
    overrides.wechatFactory ??
    (overrides.wechat
      ? () => overrides.wechat as WeChatPort
      : createWeChatClientFactory(config));
  const publication =
    overrides.publication ??
    buildPublicationService(config, store, createWechat);

  app.addHook("onClose", async () => {
    await closeDatabase?.();
  });

  app.get("/health", async () => ({
    ok: true,
    wechatMode: config.WECHAT_MODE,
    persistence: config.PUBLISHER_USE_MEMORY_STORE ? "memory" : "postgres",
    templateVersion: config.PUBLISHER_TEMPLATE_VERSION,
  }));

  app.get("/", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(consoleHtml);
  });

  app.get("/api/config/:pageId", async (request) => {
    const { pageId } = z
      .object({ pageId: z.string().uuid() })
      .parse(request.params);
    return { config: await publication.getConfig(pageId) };
  });

  app.get("/api/accounts", async () => ({
    accounts: await publication.listAccounts(),
  }));

  app.post("/api/publications", async (request, reply) => {
    try {
      const input = publishSchema.parse(request.body);
      const job = await publication.publish({
        ...input,
        contentSourceUrl: input.contentSourceUrl || undefined,
      });
      return reply.code(200).send({ job });
    } catch (error) {
      const name = error instanceof Error ? error.name : "PublicationError";
      const status =
        error instanceof z.ZodError ? 400 : (STATUS_BY_ERROR_NAME[name] ?? 502);
      return reply.code(status).send({
        error: name,
        message: error instanceof Error ? error.message : "Publication failed",
      });
    }
  });

  return app;
}

function buildPublicationService(
  config: PublisherConfig,
  store: PublicationStore,
  createWechat: WeChatClientFactory,
): PublicationService {
  const docmost = new DocmostClient(config);
  const rasterizer = new Rasterizer(config.WECHAT_MAX_IMAGE_BYTES);
  return new PublicationService(
    docmost,
    new WeChatArticleRenderer(new MermaidRenderer(rasterizer)),
    new AssetPublisher(
      docmost,
      store,
      rasterizer,
      new DefaultCoverLoader(config.PUBLISHER_DEFAULT_COVER_PATH),
    ),
    store,
    createWechat,
    {
      templateVersion: config.PUBLISHER_TEMPLATE_VERSION,
    },
  );
}
