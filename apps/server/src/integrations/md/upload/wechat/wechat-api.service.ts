import { BadGatewayException, Inject, Injectable } from '@nestjs/common';

const WECHAT_API_BASE_URL = 'https://api.weixin.qq.com';
const TOKEN_REFRESH_SKEW_MS = 120_000;

export const WECHAT_FETCH = Symbol('WECHAT_FETCH');
export type WechatFetch = typeof fetch;

interface CachedToken {
  appId: string;
  value: string;
  expiresAt: number;
}

interface WechatErrorResponse {
  errcode?: number;
}

export interface WechatCredentials {
  accountId: string;
  appId: string;
  appSecret: string;
}

@Injectable()
export class WechatApiService {
  private readonly tokens = new Map<string, CachedToken>();
  private readonly tokenRequests = new Map<string, Promise<string>>();

  constructor(@Inject(WECHAT_FETCH) private readonly fetchImpl: WechatFetch) {}

  async uploadImage(
    credentials: WechatCredentials,
    bytes: Buffer,
    mime: string,
    filename: string,
  ): Promise<{ url: string; mediaId?: string }> {
    const accessToken = await this.accessToken(credentials);
    const url = new URL('/cgi-bin/media/uploadimg', WECHAT_API_BASE_URL);
    url.searchParams.set('access_token', accessToken);

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
    >(url, { method: 'POST', body });
    this.assertSuccess(result.response, result.body);

    if (
      typeof result.body.url !== 'string' ||
      !result.body.url ||
      this.containsCredential(result.body.url, credentials, accessToken)
    ) {
      throw new BadGatewayException(
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
    const url = new URL('/cgi-bin/stable_token', WECHAT_API_BASE_URL);
    const result = await this.requestJson<
      WechatErrorResponse & { access_token?: string; expires_in?: number }
    >(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credential',
        appid: credentials.appId,
        secret: credentials.appSecret,
        force_refresh: false,
      }),
    });
    this.assertSuccess(result.response, result.body);

    if (
      typeof result.body.access_token !== 'string' ||
      !result.body.access_token
    ) {
      throw new BadGatewayException(
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

  private async requestJson<T>(
    url: URL,
    init: RequestInit,
  ): Promise<{ response: Response; body: T }> {
    try {
      const response = await this.fetchImpl(url, init);
      const body = (await response.json()) as T;
      return { response, body };
    } catch {
      throw new BadGatewayException('WeChat request failed (network)');
    }
  }

  private assertSuccess(response: Response, body: WechatErrorResponse): void {
    if (!response.ok || (body.errcode && body.errcode !== 0)) {
      throw new BadGatewayException(
        `WeChat request failed (${body.errcode ?? response.status})`,
      );
    }
  }

  private containsCredential(
    value: string,
    credentials: WechatCredentials,
    accessToken: string,
  ): boolean {
    return [credentials.appId, credentials.appSecret, accessToken].some(
      (secret) => secret && value.includes(secret),
    );
  }
}
