import type { DraftArticle } from "../core/types.js";

export interface WeChatPort {
  uploadBodyImage(bytes: Uint8Array, mime: string): Promise<{ url: string }>;
  uploadCover(bytes: Uint8Array, mime: string): Promise<{ mediaId: string }>;
  createDraft(article: DraftArticle): Promise<{ mediaId: string }>;
}

/** WeChat rejects drafts whose title exceeds this length. */
export const WECHAT_TITLE_LIMIT = 64;
