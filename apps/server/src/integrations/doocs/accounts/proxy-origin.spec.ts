import { BadRequestException } from '@nestjs/common';
import { normalizeProxyOrigin } from './proxy-origin';

describe('normalizeProxyOrigin', () => {
  it('treats blank input as "no proxy"', () => {
    expect(normalizeProxyOrigin(undefined)).toBeNull();
    expect(normalizeProxyOrigin(null)).toBeNull();
    expect(normalizeProxyOrigin('   ')).toBeNull();
  });

  it('adds the HTTPS scheme and strips trailing slashes', () => {
    expect(normalizeProxyOrigin('wechat.example.workers.dev')).toBe(
      'https://wechat.example.workers.dev',
    );
    expect(normalizeProxyOrigin('https://wechat.example.workers.dev/')).toBe(
      'https://wechat.example.workers.dev',
    );
  });

  it('keeps a path prefix so proxies can mount the API below a sub-path', () => {
    expect(normalizeProxyOrigin('https://proxy.example.com/wechat/')).toBe(
      'https://proxy.example.com/wechat',
    );
  });

  it('rejects plain HTTP because the AppSecret travels to this host', () => {
    expect(() => normalizeProxyOrigin('http://proxy.example.com')).toThrow(
      BadRequestException,
    );
  });

  it('rejects values that are not a usable origin', () => {
    expect(() => normalizeProxyOrigin('https://')).toThrow(BadRequestException);
    expect(() => normalizeProxyOrigin('https://proxy.example.com?a=1')).toThrow(
      BadRequestException,
    );
    expect(() => normalizeProxyOrigin('https://proxy.example.com#x')).toThrow(
      BadRequestException,
    );
  });
});
