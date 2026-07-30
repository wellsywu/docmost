import type { DraftArticle } from "../core/types.js";
import type { WeChatPort } from "./port.js";

interface WeChatError {
  errcode?: number;
}

export interface LiveWeChatCredentials {
  apiBaseUrl: string;
  appId: string;
  appSecret: string;
}

export class LiveWeChatClient implements WeChatPort {
  private token?: { value: string; expiresAt: number };

  constructor(
    private readonly credentials: LiveWeChatCredentials,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async uploadBodyImage(
    bytes: Uint8Array,
    mime: string,
  ): Promise<{ url: string }> {
    const result = await this.multipart<{ url: string }>(
      "/cgi-bin/media/uploadimg",
      bytes,
      mime,
      "body-image",
    );
    return { url: result.url };
  }

  async uploadCover(
    bytes: Uint8Array,
    mime: string,
  ): Promise<{ mediaId: string }> {
    const result = await this.multipart<{ media_id: string }>(
      "/cgi-bin/material/add_material",
      bytes,
      mime,
      "cover",
      { type: "image" },
    );
    return { mediaId: result.media_id };
  }

  async createDraft(article: DraftArticle): Promise<{ mediaId: string }> {
    const result = await this.json<{ media_id: string }>("/cgi-bin/draft/add", {
      articles: [
        {
          title: article.title,
          author: article.author,
          digest: article.digest,
          content: article.content,
          content_source_url: article.contentSourceUrl ?? "",
          thumb_media_id: article.thumbMediaId,
          show_cover_pic: 0,
          need_open_comment: article.needOpenComment,
          only_fans_can_comment: article.onlyFansCanComment,
        },
      ],
    });
    return { mediaId: result.media_id };
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 120_000) {
      return this.token.value;
    }
    const response = await this.fetchImpl(
      new URL("/cgi-bin/stable_token", this.credentials.apiBaseUrl),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credential",
          appid: this.credentials.appId,
          secret: this.credentials.appSecret,
          force_refresh: false,
        }),
      },
    );
    const result = (await response.json()) as WeChatError & {
      access_token?: string;
      expires_in?: number;
    };
    this.assertSuccess(response, result);
    if (!result.access_token)
      throw new Error("WeChat returned no access token");
    this.token = {
      value: result.access_token,
      expiresAt: Date.now() + (result.expires_in ?? 7200) * 1000,
    };
    return result.access_token;
  }

  private async json<T>(path: string, body: unknown): Promise<T> {
    const url = await this.authorizedUrl(path);
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as WeChatError & T;
    this.assertSuccess(response, result);
    return result;
  }

  private async multipart<T>(
    path: string,
    bytes: Uint8Array,
    mime: string,
    filename: string,
    query: Record<string, string> = {},
  ): Promise<T> {
    const url = await this.authorizedUrl(path);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    const form = new FormData();
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    form.append("media", new Blob([body], { type: mime }), filename);
    const response = await this.fetchImpl(url, { method: "POST", body: form });
    const result = (await response.json()) as WeChatError & T;
    this.assertSuccess(response, result);
    return result;
  }

  private async authorizedUrl(path: string): Promise<URL> {
    const url = new URL(path, this.credentials.apiBaseUrl);
    // WeChat's official material and draft APIs require this query parameter.
    // The URL is never logged, persisted, returned to the browser, or accepted
    // from user input.
    url.searchParams.set("access_token", await this.accessToken());
    return url;
  }

  /** Only the numeric errcode is surfaced; upstream errmsg can echo secrets. */
  private assertSuccess(response: Response, result: WeChatError): void {
    if (!response.ok || (result.errcode && result.errcode !== 0)) {
      throw new Error(
        `WeChat request failed (${result.errcode ?? response.status})`,
      );
    }
  }
}
