import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { BinaryAsset } from "../core/types.js";
import { isJpeg, isPng } from "./rasterizer.js";

export class MissingCoverError extends Error {
  constructor() {
    super(
      "文章中没有可用作微信封面的图片。请在正文中至少放置一张 PNG/JPEG 图片，或配置 PUBLISHER_DEFAULT_COVER_PATH。",
    );
    this.name = "MissingCoverError";
  }
}

/**
 * Optional fallback so text-only pages remain publishable: WeChat requires a
 * `thumb_media_id` on every draft.
 */
export class DefaultCoverLoader {
  private cached?: BinaryAsset;

  constructor(private readonly path?: string) {}

  get configured(): boolean {
    return Boolean(this.path);
  }

  async load(): Promise<BinaryAsset> {
    if (!this.path) throw new MissingCoverError();
    if (this.cached) return this.cached;
    const absolute = resolve(this.path);
    const bytes = new Uint8Array(await readFile(absolute));
    const mime = isPng(bytes)
      ? "image/png"
      : isJpeg(bytes)
        ? "image/jpeg"
        : undefined;
    if (!mime) {
      throw new Error(
        `PUBLISHER_DEFAULT_COVER_PATH 必须指向 PNG 或 JPEG 文件：${absolute}`,
      );
    }
    this.cached = {
      sourceUrl: `file://${absolute}`,
      bytes,
      mime,
      transform: "none",
    };
    return this.cached;
  }
}
