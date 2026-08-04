import { BadRequestException } from '@nestjs/common';

/**
 * Normalizes the WeChat OpenAPI proxy origin of an account, e.g. a Cloudflare
 * Worker that forwards to api.weixin.qq.com. Such a proxy exists so the request
 * leaves from an egress IP that the MP platform IP whitelist allows.
 *
 * The AppSecret travels to this host, so anything but a parseable HTTPS origin
 * is rejected. A path prefix is kept because proxies may mount the API below a
 * sub-path; the caller appends `/cgi-bin/...` to the returned value.
 */
export function normalizeProxyOrigin(
  value: string | undefined | null,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new BadRequestException('Proxy domain must be a valid URL');
  }

  if (url.protocol !== 'https:') {
    throw new BadRequestException('Proxy domain must use HTTPS');
  }
  if (url.search || url.hash) {
    throw new BadRequestException(
      'Proxy domain must not contain a query string or fragment',
    );
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}
