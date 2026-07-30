import { Agent, type Dispatcher } from "undici";
import type {
  BinaryAsset,
  DocmostPage,
  ProseMirrorNode,
} from "../core/types.js";
import type { PublisherConfig } from "../config.js";

type Fetch = typeof fetch;

export interface DocmostPort {
  readJson(pageId: string): Promise<DocmostPage<ProseMirrorNode>>;
  readMarkdown(pageId: string): Promise<DocmostPage<string>>;
  downloadAsset(source: string): Promise<BinaryAsset>;
}

export class DocmostClient implements DocmostPort {
  private readonly apiBase: URL;
  private readonly origin: string;
  private readonly dispatcher?: Dispatcher;

  constructor(
    private readonly config: PublisherConfig,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    this.apiBase = new URL(config.DOCMOST_BASE_URL.replace(/\/?$/, "/"));
    this.origin = this.apiBase.origin;
    this.dispatcher = config.DOCMOST_VERIFY_TLS
      ? undefined
      : new Agent({ connect: { rejectUnauthorized: false } });
  }

  async readJson(pageId: string): Promise<DocmostPage<ProseMirrorNode>> {
    return this.readPage<ProseMirrorNode>(pageId, "json");
  }

  async readMarkdown(pageId: string): Promise<DocmostPage<string>> {
    return this.readPage<string>(pageId, "markdown");
  }

  normalizeAssetUrl(source: string): URL {
    if (/^https?:\/\//i.test(source)) return new URL(source);
    if (source.startsWith("/api/")) return new URL(source, this.origin);
    if (source.startsWith("/files/")) return new URL(source, this.origin);
    throw new Error(`Unsupported image URL: ${source}`);
  }

  async downloadAsset(source: string): Promise<BinaryAsset> {
    const url = this.normalizeAssetUrl(source);
    await this.assertAllowedAssetUrl(url);
    const response = await this.fetchImpl(url, {
      headers:
        url.origin === this.origin
          ? { authorization: `Bearer ${this.config.DOCMOST_API_KEY}` }
          : undefined,
      redirect: "manual",
      // Undici's dispatcher is intentionally server-only and never exposed.
      dispatcher: this.dispatcher,
    } as RequestInit);
    if (response.status >= 300 && response.status < 400) {
      throw new Error("Asset redirects are blocked");
    }
    if (!response.ok) {
      throw new Error(
        `Docmost asset request failed with HTTP ${response.status}`,
      );
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > this.config.DOCMOST_MAX_ASSET_BYTES) {
      throw new Error("Docmost asset exceeds configured size limit");
    }
    const mime = (response.headers.get("content-type") ?? "")
      .split(";", 1)[0]
      .toLowerCase();
    if (
      ![
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "image/svg+xml",
      ].includes(mime)
    ) {
      throw new Error(
        `Unsupported Docmost asset MIME type: ${mime || "missing"}`,
      );
    }
    const bytes = await this.readBoundedBody(response);
    return { sourceUrl: url.href, bytes, mime, transform: "none" };
  }

  private async readPage<T>(
    pageId: string,
    format: "json" | "markdown",
  ): Promise<DocmostPage<T>> {
    const response = await this.fetchImpl(new URL("pages/info", this.apiBase), {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.DOCMOST_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ pageId, format }),
      dispatcher: this.dispatcher,
    } as RequestInit);
    if (!response.ok) {
      throw new Error(
        `Docmost page request failed with HTTP ${response.status}`,
      );
    }
    return (await response.json()) as DocmostPage<T>;
  }

  private async assertAllowedAssetUrl(url: URL): Promise<void> {
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Only HTTP(S) assets are supported");
    }
    if (url.username || url.password) {
      throw new Error("Credentials in asset URLs are blocked");
    }
    if (url.origin !== this.origin) {
      throw new Error("Asset origin is not the configured Docmost origin");
    }
  }

  private async readBoundedBody(response: Response): Promise<Uint8Array> {
    if (!response.body) return new Uint8Array();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > this.config.DOCMOST_MAX_ASSET_BYTES) {
          await reader.cancel();
          throw new Error("Docmost asset exceeds configured size limit");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
}
