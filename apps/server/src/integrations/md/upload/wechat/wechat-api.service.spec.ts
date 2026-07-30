import { BadGatewayException } from '@nestjs/common';
import { WechatApiService } from './wechat-api.service';

const credentials = {
  accountId: 'account-1',
  appId: 'wx-app-id-secret-value',
  appSecret: 'app-secret-sensitive-value',
};
const accessToken = 'access-token-sensitive-value';
const jpeg = Buffer.from([255, 216, 255, 224]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('WechatApiService', () => {
  it('caches access tokens by account and returns only safe upload fields', async () => {
    const fetchMock = jest.fn(async (input: URL | RequestInfo) => {
      const url = new URL(input.toString());
      if (url.pathname === '/cgi-bin/stable_token') {
        return jsonResponse({ access_token: accessToken, expires_in: 7200 });
      }
      return jsonResponse({
        url: 'https://mmbiz.qpic.cn/safe-image',
        media_id: 'media-1',
      });
    });
    const service = new WechatApiService(fetchMock as never);

    const first = await service.uploadImage(
      credentials,
      jpeg,
      'image/jpeg',
      'one.jpg',
    );
    const second = await service.uploadImage(
      credentials,
      jpeg,
      'image/jpeg',
      'two.jpg',
    );

    expect(first).toEqual({
      url: 'https://mmbiz.qpic.cn/safe-image',
      mediaId: 'media-1',
    });
    expect(second).toEqual(first);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        input.toString().includes('/cgi-bin/stable_token'),
      ),
    ).toHaveLength(1);
    const serialized = JSON.stringify([first, second]);
    expect(serialized).not.toContain(credentials.appId);
    expect(serialized).not.toContain(credentials.appSecret);
    expect(serialized).not.toContain(accessToken);
  });

  it('refreshes a cached token before it reaches expiry', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    let tokenNumber = 0;
    const fetchMock = jest.fn(async (input: URL | RequestInfo) => {
      const url = new URL(input.toString());
      if (url.pathname === '/cgi-bin/stable_token') {
        tokenNumber += 1;
        return jsonResponse({
          access_token: `access-token-${tokenNumber}`,
          expires_in: 121,
        });
      }
      return jsonResponse({ url: 'https://mmbiz.qpic.cn/safe-image' });
    });
    const service = new WechatApiService(fetchMock as never);

    try {
      await service.uploadImage(credentials, jpeg, 'image/jpeg', 'one.jpg');
      now.mockReturnValue(1_002_000);
      await service.uploadImage(credentials, jpeg, 'image/jpeg', 'two.jpg');
    } finally {
      now.mockRestore();
    }

    expect(
      fetchMock.mock.calls.filter(([input]) =>
        input.toString().includes('/cgi-bin/stable_token'),
      ),
    ).toHaveLength(2);
  });

  it('does not cache a failed token request or expose upstream secrets', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        errcode: 40013,
        errmsg: `${credentials.appId} ${credentials.appSecret} ${accessToken}`,
      }),
    );
    const service = new WechatApiService(fetchMock as never);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const error = await service
        .uploadImage(credentials, jpeg, 'image/jpeg', 'image.jpg')
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(BadGatewayException);
      const serialized = JSON.stringify(error.getResponse());
      expect(serialized).toContain('40013');
      expect(serialized).not.toContain(credentials.appId);
      expect(serialized).not.toContain(credentials.appSecret);
      expect(serialized).not.toContain(accessToken);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sanitizes upload failures even when the upstream message leaks credentials', async () => {
    const fetchMock = jest.fn(async (input: URL | RequestInfo) => {
      const url = new URL(input.toString());
      if (url.pathname === '/cgi-bin/stable_token') {
        return jsonResponse({ access_token: accessToken, expires_in: 7200 });
      }
      return jsonResponse({
        errcode: 45009,
        errmsg: `${credentials.appId} ${credentials.appSecret} ${accessToken}`,
      });
    });
    const service = new WechatApiService(fetchMock as never);

    const error = await service
      .uploadImage(credentials, jpeg, 'image/jpeg', 'image.jpg')
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(BadGatewayException);
    const serialized = JSON.stringify(error.getResponse());
    expect(serialized).toContain('45009');
    expect(serialized).not.toContain(credentials.appId);
    expect(serialized).not.toContain(credentials.appSecret);
    expect(serialized).not.toContain(accessToken);
  });
});
