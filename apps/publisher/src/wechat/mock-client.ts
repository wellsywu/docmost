import { randomUUID } from "node:crypto";
import type { DraftArticle } from "../core/types.js";
import type { WeChatPort } from "./port.js";

export class MockWeChatClient implements WeChatPort {
  readonly calls: string[] = [];
  readonly draftArticles: DraftArticle[] = [];

  async uploadBodyImage(): Promise<{ url: string }> {
    this.calls.push("media/uploadimg");
    return { url: `https://mmbiz.qpic.cn/mock/${randomUUID()}` };
  }

  async uploadCover(): Promise<{ mediaId: string }> {
    this.calls.push("material/add_material");
    return { mediaId: `mock-cover-${randomUUID()}` };
  }

  async createDraft(article: DraftArticle): Promise<{ mediaId: string }> {
    this.calls.push("draft/add");
    this.draftArticles.push({ ...article });
    return { mediaId: `mock-draft-${randomUUID()}` };
  }
}
