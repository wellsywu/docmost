import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';

const WECHAT_API_BASE_URL = 'https://api.weixin.qq.com';
const TOKEN_REFRESH_SKEW_MS = 120_000;

/** `media/uploadimg` accepts JPEG and PNG below 1MB and nothing else. */
const INLINE_IMAGE_MAX_BYTES = 1024 * 1024;
const INLINE_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

export const WECHAT_FETCH = Symbol('WECHAT_FETCH');
export type WechatFetch = typeof fetch;

interface CachedToken {
  appId: string;
  value: string;
  expiresAt: number;
}

interface WechatErrorResponse {
  errcode?: number;
  errmsg?: string;
}

/**
 * Carries the WeChat errcode next to the message. The code is the only part of
 * a failure that is both actionable (40164 → egress IP not whitelisted, 48001 →
 * account not authorized for the API) and structurally incapable of holding a
 * credential, so callers may pass it to a non-admin while the errmsg — which is
 * echoed input in some cases — stays in the log.
 */
export class WechatApiException extends BadGatewayException {
  constructor(
    readonly errcode: number | string,
    message: string,
  ) {
    super(message);
  }
}

export interface WechatCredentials {
  accountId: string;
  appId: string;
  appSecret: string;
  /**
   * OpenAPI proxy that forwards to api.weixin.qq.com. Set when the server's own
   * egress IP is not in the MP platform IP whitelist. Null means direct.
   */
  proxyOrigin?: string | null;
}

@Injectable()
export class WechatApiService {
  private readonly logger = new Logger(WechatApiService.name);
  private readonly tokens = new Map<string, CachedToken>();
  private readonly tokenRequests = new Map<string, Promise<string>>();

  constructor(@Inject(WECHAT_FETCH) private readonly fetchImpl: WechatFetch) {}

  /**
   * Fetches a token bypassing the cache, so a settings test reflects the config
   * as it stands right now instead of a token taken before the last edit.
   */
  async verifyCredentials(credentials: WechatCredentials): Promise<void> {
    await this.fetchAccessToken(credentials);
  }

  /**
   * Article body images belong on `media/uploadimg`: it returns an mmbiz URL
   * without consuming the account's permanent material quota. That endpoint
   * only takes JPEG/PNG below 1MB, so anything else — a large photo, a GIF —
   * falls back to `material/add_material`, which allows 10MB and more formats
   * but does occupy a material slot.
   */
  async uploadImage(
    credentials: WechatCredentials,
    bytes: Buffer,
    mime: string,
    filename: string,
  ): Promise<{ url: string; mediaId?: string }> {
    const accessToken = await this.accessToken(credentials);
    const inline = this.fitsInlineUpload(bytes, mime);
    const url = this.apiUrl(
      credentials,
      inline ? '/cgi-bin/media/uploadimg' : '/cgi-bin/material/add_material',
    );
    url.searchParams.set('access_token', accessToken);
    if (!inline) {
      url.searchParams.set('type', 'image');
      this.logger.log(
        `Image of ${bytes.byteLength} bytes (${mime}) exceeds the inline limit for account ${credentials.accountId}; storing it as permanent material`,
      );
    }

    const body = new FormData();
    const content = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    body.append(
      'media',
      new Blob([content], { type: mime }),
      filename || 'image',
    );

    const result = await this.requestJson<
      WechatErrorResponse & { url?: string; media_id?: string }
    >(url, { method: 'POST', body }, credentials);
    this.assertSuccess(result.response, result.body, credentials, accessToken);

    if (
      typeof result.body.url !== 'string' ||
      !result.body.url ||
      this.containsCredential(result.body.url, credentials, accessToken)
    ) {
      throw new WechatApiException(
        'invalid-image-response',
        'WeChat returned an invalid image response',
      );
    }

    const mediaId =
      typeof result.body.media_id === 'string' &&
      result.body.media_id &&
      !this.containsCredential(result.body.media_id, credentials, accessToken)
        ? result.body.media_id
        : undefined;

    return mediaId
      ? { url: result.body.url, mediaId }
      : { url: result.body.url };
  }

  private async accessToken(credentials: WechatCredentials): Promise<string> {
    const cached = this.tokens.get(credentials.accountId);
    if (
      cached?.appId === credentials.appId &&
      cached.expiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS
    ) {
      return cached.value;
    }

    const pending = this.tokenRequests.get(credentials.accountId);
    if (pending) {
      return pending;
    }

    const request = this.fetchAccessToken(credentials);
    this.tokenRequests.set(credentials.accountId, request);
    try {
      return await request;
    } finally {
      this.tokenRequests.delete(credentials.accountId);
    }
  }

  private async fetchAccessToken(
    credentials: WechatCredentials,
  ): Promise<string> {
    const url = this.apiUrl(credentials, '/cgi-bin/stable_token');
    const result = await this.requestJson<
      WechatErrorResponse & { access_token?: string; expires_in?: number }
    >(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credential',
          appid: credentials.appId,
          secret: credentials.appSecret,
          force_refresh: false,
        }),
      },
      credentials,
    );
    this.assertSuccess(result.response, result.body, credentials);

    if (
      typeof result.body.access_token !== 'string' ||
      !result.body.access_token
    ) {
      throw new WechatApiException(
        'invalid-token-response',
        'WeChat returned an invalid token response',
      );
    }

    const expiresIn =
      typeof result.body.expires_in === 'number' &&
      Number.isFinite(result.body.expires_in)
        ? Math.max(0, result.body.expires_in)
        : 7200;
    this.tokens.set(credentials.accountId, {
      appId: credentials.appId,
      value: result.body.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    });
    return result.body.access_token;
  }

  private fitsInlineUpload(bytes: Buffer, mime: string): boolean {
    return (
      bytes.byteLength <= INLINE_IMAGE_MAX_BYTES &&
      INLINE_IMAGE_MIME_TYPES.has(mime.toLowerCase())
    );
  }

  /** Builds an API URL, keeping any path prefix the proxy origin carries. */
  private apiUrl(credentials: WechatCredentials, path: string): URL {
    return new URL(`${credentials.proxyOrigin || WECHAT_API_BASE_URL}${path}`);
  }

  private async requestJson<T>(
    url: URL,
    init: RequestInit,
    credentials: WechatCredentials,
  ): Promise<{ response: Response; body: T }> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (error) {
      // A proxy origin puts a third party on this path, so log where the
      // request actually went; "cannot reach WeChat" and "cannot reach the
      // proxy" need very different fixes.
      this.logger.warn(
        `WeChat request to ${url.origin}${url.pathname} failed for account ${credentials.accountId}: ${this.causeChain(error)}`,
      );
      const code = this.causeCode(error);
      throw new WechatApiException(
        code ? `network ${code}` : 'network',
        'WeChat request failed (network)',
      );
    }

    // Separate from the transport failure above: an origin that answers with an
    // HTML error page is reachable, and reporting that as a network problem
    // sends the reader looking at DNS and firewalls for nothing.
    try {
      return { response, body: (await response.json()) as T };
    } catch (error) {
      this.logger.warn(
        `WeChat request to ${url.origin}${url.pathname} returned HTTP ${response.status} with an unreadable body for account ${credentials.accountId}: ${this.causeChain(error)}`,
      );
      throw new WechatApiException(
        `invalid-body ${response.status}`,
        `WeChat request failed (invalid-body ${response.status})`,
      );
    }
  }

  /**
   * `fetch` reports every transport failure as the same opaque "fetch failed".
   * The actionable part — ENOTFOUND, ECONNREFUSED, UND_ERR_CONNECT_TIMEOUT, a
   * certificate code — only ever appears on a wrapped cause.
   */
  private causeCode(error: unknown): string | undefined {
    for (const link of this.causes(error)) {
      const code = (link as { code?: unknown }).code;
      if (typeof code === 'string' && code) {
        return code;
      }
    }
    return undefined;
  }

  private causeChain(error: unknown): string {
    const messages: string[] = [];
    for (const link of this.causes(error)) {
      const message = (link as Error)?.message;
      if (typeof message === 'string' && message && !messages.includes(message))
        messages.push(message);
    }
    return messages.join(' <- ') || 'Unknown error';
  }

  private *causes(error: unknown): Generator<unknown> {
    let current = error;
    // Bounded because a cause chain is allowed to be cyclic.
    for (let depth = 0; current && depth < 5; depth += 1) {
      yield current;
      current = (current as { cause?: unknown }).cause;
    }
  }

  private assertSuccess(
    response: Response,
    body: WechatErrorResponse,
    credentials: WechatCredentials,
    accessToken?: string,
  ): void {
    if (response.ok && (!body.errcode || body.errcode === 0)) {
      return;
    }

    const code = body.errcode ?? response.status;
    const detail = this.safeErrmsg(body.errmsg, credentials, accessToken);
    this.logger.warn(
      `WeChat request failed for account ${credentials.accountId}: [${code}]${detail}`,
    );
    throw new WechatApiException(
      code,
      `WeChat request failed (${code})${detail}`,
    );
  }

  /**
   * WeChat errmsg is what makes a failure diagnosable (40164 even names the
   * rejected IP), but it is echoed input in some cases, so drop it whenever it
   * would carry a credential back to the caller.
   */
  private safeErrmsg(
    errmsg: string | undefined,
    credentials: WechatCredentials,
    accessToken?: string,
  ): string {
    const trimmed = errmsg?.trim();
    if (
      !trimmed ||
      this.containsCredential(trimmed, credentials, accessToken)
    ) {
      return '';
    }
    return `: ${trimmed}`;
  }

  private containsCredential(
    value: string,
    credentials: WechatCredentials,
    accessToken?: string,
  ): boolean {
    return [credentials.appId, credentials.appSecret, accessToken].some(
      (secret) => secret && value.includes(secret),
    );
  }
}
