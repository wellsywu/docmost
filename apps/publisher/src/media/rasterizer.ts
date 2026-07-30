import { renderAsync } from "@resvg/resvg-js";
import { PublicationBlockedError } from "../core/errors.js";
import type { BinaryAsset } from "../core/types.js";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_SIGNATURE = new Uint8Array([255, 216, 255]);

function hasSignature(bytes: Uint8Array, signature: Uint8Array): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

export function isPng(bytes: Uint8Array): boolean {
  return hasSignature(bytes, PNG_SIGNATURE);
}

export function isJpeg(bytes: Uint8Array): boolean {
  return hasSignature(bytes, JPEG_SIGNATURE);
}

export class RasterizationError extends PublicationBlockedError {
  constructor(sourceUrl: string, reason: string) {
    super(
      "RasterizationError",
      "IMAGE_RASTERIZATION_FAILED",
      `SVG 图片栅格化失败（${sourceUrl}）：${reason}`,
    );
  }
}

export class Rasterizer {
  constructor(private readonly maxBytes: number) {}

  /**
   * Rasterisation is CPU bound; `renderAsync` runs it on the libuv thread pool
   * so a publish request cannot stall the whole HTTP server.
   */
  async rasterizeSvg(
    input: BinaryAsset,
    transform: "svg_to_png" | "mermaid_to_png" = "svg_to_png",
  ): Promise<BinaryAsset> {
    try {
      let width = 1354;
      let output = await this.render(input.bytes, width);
      while (output.byteLength > this.maxBytes && width >= 480) {
        width = Math.floor(width * 0.75);
        output = await this.render(input.bytes, width);
      }
      if (output.byteLength > this.maxBytes) {
        throw new Error("PNG 仍超过配置的微信图片体积上限");
      }
      return { ...input, bytes: output, mime: "image/png", transform };
    } catch (error) {
      if (error instanceof RasterizationError) throw error;
      throw new RasterizationError(
        input.sourceUrl,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async render(svg: Uint8Array, width: number): Promise<Uint8Array> {
    const rendered = await renderAsync(Buffer.from(svg), {
      fitTo: { mode: "width", value: width },
      font: {
        loadSystemFonts: true,
        defaultFontFamily: "Noto Sans CJK SC",
      },
    });
    return rendered.asPng();
  }
}
