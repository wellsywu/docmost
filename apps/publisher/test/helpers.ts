import type { PublisherConfig } from "../src/config.js";
import type {
  BinaryAsset,
  DocmostPage,
  ProseMirrorNode,
} from "../src/core/types.js";
import type { DocmostPort } from "../src/docmost/client.js";
import { AssetPublisher } from "../src/media/asset-publisher.js";
import { DefaultCoverLoader } from "../src/media/default-cover.js";
import { Rasterizer } from "../src/media/rasterizer.js";
import { MermaidRenderer } from "../src/rendering/mermaid.js";
import {
  WeChatArticleRenderer,
  type MermaidPort,
} from "../src/rendering/renderer.js";
import { MockWeChatClient } from "../src/wechat/mock-client.js";
import type { WeChatPort } from "../src/wechat/port.js";
import type { WeChatClientFactory } from "../src/wechat/factory.js";
import { MemoryPublicationStore } from "../src/publication/store.js";
import type { StoredWechatAccount } from "../src/publication/store.js";
import { PublicationService } from "../src/publication/service.js";

export const pageId = "019fabe2-2a4d-7ee9-b9de-1c4dfbedcacd";
export const accountId = "00000000-0000-7000-8000-000000000001";

export const testAccount: StoredWechatAccount = {
  id: accountId,
  workspaceId: "00000000-0000-7000-8000-000000000002",
  name: "Test account",
  appId: "wx_test_placeholder",
  appSecretEnvelope: {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: "test",
    ciphertext: "test",
    authTag: "test",
  },
  verify: true,
};

export const baseConfig: PublisherConfig = {
  PUBLISHER_HOST: "127.0.0.1",
  PUBLISHER_PORT: 3050,
  PUBLISHER_DATABASE_URL:
    "postgres://publisher:publisher@127.0.0.1:5432/publisher",
  PUBLISHER_USE_MEMORY_STORE: true,
  PUBLISHER_AUTH_ENABLED: false,
  PUBLISHER_ACCESS_TOKEN: "publisher_placeholder_test_token",
  PUBLISHER_DEFAULT_COVER_PATH: undefined,
  DOCMOST_BASE_URL: "https://127.0.0.1:8443/api",
  DOCMOST_API_KEY: "dm_test_not_a_secret",
  DOCMOST_VERIFY_TLS: true,
  DOCMOST_MAX_ASSET_BYTES: 1024 * 1024,
  WECHAT_MODE: "mock",
  INTEGRATION_ENCRYPTION_SECRET: undefined,
  APP_SECRET: undefined,
  WECHAT_API_BASE_URL: "https://api.weixin.qq.com",
  WECHAT_MAX_IMAGE_BYTES: 1024 * 1024,
  PUBLISHER_TEMPLATE_VERSION: "wechat-test-template",
};

export function asEnv(config: PublisherConfig): Record<string, string> {
  return Object.fromEntries(
    Object.entries(config)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        typeof value === "boolean" ? (value ? "1" : "0") : String(value),
      ]),
  );
}

export const svgBytes = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200"><rect width="640" height="200" fill="#ecfeff"/><text x="30" y="110" font-size="42">中文架构图</text></svg>',
);

export const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export const svgAsset: BinaryAsset = {
  sourceUrl: "https://127.0.0.1:8443/api/files/a/cover.svg",
  bytes: svgBytes,
  mime: "image/svg+xml",
  transform: "none",
};

export const pngAsset: BinaryAsset = {
  sourceUrl: "https://127.0.0.1:8443/api/files/a/cover.png",
  bytes: pngBytes,
  mime: "image/png",
  transform: "none",
};

export const imageDocument: ProseMirrorNode = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Title" }],
    },
    { type: "image", attrs: { src: "/api/files/a/cover.svg" } },
  ],
};

export const unreachableMermaid: MermaidPort = {
  async render(): Promise<BinaryAsset> {
    throw new Error("Mermaid rendering should not be reached");
  },
};

export interface FakeDocmostOptions {
  document?: ProseMirrorNode;
  asset?: BinaryAsset;
  title?: string;
}

/** Serves a scripted sequence of Markdown bodies, one per read. */
export class FakeDocmost implements DocmostPort {
  markdownReads = 0;
  downloads: string[] = [];

  private readonly document: ProseMirrorNode;
  private readonly asset: BinaryAsset;
  private readonly title: string;

  constructor(
    private readonly markdown: string[],
    options: FakeDocmostOptions = {},
  ) {
    this.document = options.document ?? imageDocument;
    this.asset = options.asset ?? svgAsset;
    this.title = options.title ?? "Test article";
  }

  async readJson(): Promise<DocmostPage<ProseMirrorNode>> {
    return {
      id: pageId,
      title: this.title,
      updatedAt: new Date(this.markdownReads).toISOString(),
      content: this.document,
    };
  }

  async readMarkdown(): Promise<DocmostPage<string>> {
    const index = Math.min(this.markdownReads, this.markdown.length - 1);
    this.markdownReads += 1;
    return {
      id: pageId,
      title: this.title,
      updatedAt: new Date(this.markdownReads).toISOString(),
      content: this.markdown[index],
    };
  }

  async downloadAsset(source: string): Promise<BinaryAsset> {
    this.downloads.push(source);
    return { ...this.asset, sourceUrl: `https://127.0.0.1:8443${source}` };
  }
}

export interface HarnessOptions {
  wechat?: WeChatPort;
  wechatFactory?: WeChatClientFactory;
  accounts?: StoredWechatAccount[];
  mermaid?: MermaidPort;
  defaultCoverPath?: string;
  config?: PublisherConfig;
}

export function publicationHarness(
  docmost: DocmostPort,
  options: HarnessOptions = {},
) {
  const config = options.config ?? baseConfig;
  const store = new MemoryPublicationStore(options.accounts ?? [testAccount]);
  const wechat = options.wechat ?? new MockWeChatClient();
  const rasterizer = new Rasterizer(config.WECHAT_MAX_IMAGE_BYTES);
  const renderer = new WeChatArticleRenderer(
    options.mermaid ?? new MermaidRenderer(rasterizer),
  );
  const assets = new AssetPublisher(
    docmost,
    store,
    rasterizer,
    new DefaultCoverLoader(options.defaultCoverPath),
  );
  const service = new PublicationService(
    docmost,
    renderer,
    assets,
    store,
    options.wechatFactory ?? (() => wechat),
    {
      templateVersion: config.PUBLISHER_TEMPLATE_VERSION,
    },
  );
  return { service, store, wechat, assets, renderer };
}

export const publishInput = {
  pageId,
  accountId,
  author: "Docmost",
  digest: "A deterministic test",
  needOpenComment: false,
  onlyFansCanComment: false,
};
