import type { BinaryAsset } from "../core/types.js";

/**
 * `media/uploadimg` (body images) accepts JPG/PNG only, and `material/add_material`
 * with `type=image` accepts BMP/PNG/JPEG/GIF. The intersection is what a single
 * asset can safely be used for, since the first body image also becomes the
 * cover. SVG never qualifies and is rasterised before it gets here.
 */
export const WECHAT_IMAGE_MIME = new Set(["image/png", "image/jpeg"]);

export class UnsupportedImageError extends Error {
  constructor(asset: BinaryAsset) {
    super(
      `微信正文图片仅支持 JPG/PNG，当前为 ${asset.mime}：${asset.sourceUrl}。请在 Docmost 中替换为 PNG 或 JPEG 后重试。`,
    );
    this.name = "UnsupportedImageError";
  }
}

export function assertPublishableImage(asset: BinaryAsset): void {
  if (!WECHAT_IMAGE_MIME.has(asset.mime)) {
    throw new UnsupportedImageError(asset);
  }
}

export function isSvg(asset: BinaryAsset, source: string): boolean {
  return asset.mime === "image/svg+xml" || /\.svg(?:$|\?)/i.test(source);
}
