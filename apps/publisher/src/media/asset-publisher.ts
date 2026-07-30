import { JSDOM } from "jsdom";
import type { BinaryAsset, RenderedArticle } from "../core/types.js";
import { sha256 } from "../core/hash.js";
import type { DocmostPort } from "../docmost/client.js";
import type { PublicationStore, StoredAsset } from "../publication/store.js";
import type { WeChatPort } from "../wechat/port.js";
import { DefaultCoverLoader } from "./default-cover.js";
import { Rasterizer } from "./rasterizer.js";
import { assertPublishableImage, isSvg } from "./wechat-media.js";

export interface PublishedAssets {
  html: string;
  cover: BinaryAsset;
}

export class AssetPublisher {
  constructor(
    private readonly docmost: DocmostPort,
    private readonly store: PublicationStore,
    private readonly rasterizer: Rasterizer,
    private readonly defaultCover: DefaultCoverLoader = new DefaultCoverLoader(),
  ) {}

  async publishBody(
    jobId: string,
    accountId: string,
    article: RenderedArticle,
    wechat: WeChatPort,
  ): Promise<PublishedAssets> {
    const dom = new JSDOM(article.html);
    const images = [...dom.window.document.querySelectorAll("img[src]")];
    // The same image can appear several times; download and upload it once.
    const resolved = new Map<string, string>();
    let cover: BinaryAsset | undefined;

    for (const image of images) {
      const source = image.getAttribute("src");
      if (!source) continue;
      const known = resolved.get(source);
      if (known) {
        image.setAttribute("src", known);
        continue;
      }

      let asset =
        article.generatedAssets.get(source) ??
        (await this.docmost.downloadAsset(source));
      if (isSvg(asset, source)) {
        asset = await this.rasterizer.rasterizeSvg(asset);
      }
      assertPublishableImage(asset);
      cover ??= asset;

      const sourceHash = sha256(asset.bytes);
      const cached = await this.store.findAsset(accountId, sourceHash);
      let wechatUrl = cached?.wechatUrl;
      if (!wechatUrl) {
        wechatUrl = (await wechat.uploadBodyImage(asset.bytes, asset.mime))
          .url;
        const stored: StoredAsset = {
          accountId,
          sourceHash,
          sourceUrl: asset.sourceUrl,
          mime: asset.mime,
          bytes: asset.bytes.byteLength,
          transform: asset.transform,
          wechatUrl,
        };
        await this.store.saveAsset(jobId, stored);
      }
      resolved.set(source, wechatUrl);
      image.setAttribute("src", wechatUrl);
    }

    return {
      html: dom.window.document.body.innerHTML,
      // Throws MissingCoverError when no fallback cover is configured.
      cover: cover ?? (await this.defaultCover.load()),
    };
  }

  async publishCover(
    jobId: string,
    accountId: string,
    cover: BinaryAsset,
    wechat: WeChatPort,
  ): Promise<string> {
    assertPublishableImage(cover);
    const sourceHash = sha256(cover.bytes);
    const cached = await this.store.findAsset(accountId, sourceHash);
    if (cached?.wechatMediaId) return cached.wechatMediaId;
    const result = await wechat.uploadCover(cover.bytes, cover.mime);
    await this.store.saveAsset(jobId, {
      accountId,
      sourceHash,
      sourceUrl: cover.sourceUrl,
      mime: cover.mime,
      bytes: cover.bytes.byteLength,
      transform: cover.transform,
      wechatMediaId: result.mediaId,
    });
    return result.mediaId;
  }
}
