import type { DocmostPublishAssetEntry, DocmostWechatCredentials } from './types'
import {
  fetchDocmostWechatCredentials,
  lookupDocmostPublishAssets,
  registerDocmostPublishAssets,
} from './client'

/** `media/uploadimg` takes JPEG and PNG below 1MB; everything else needs material. */
const INLINE_MAX_BYTES = 1024 * 1024
const INLINE_MIME_TYPES = new Set([`image/jpeg`, `image/jpg`, `image/png`])

/** Renew a little early so an upload never starts with a token about to lapse. */
const TOKEN_REFRESH_SKEW_MS = 120_000

/** WeChat's codes for a token that is invalid or has expired. */
const TOKEN_REJECTED_CODES = new Set([40001, 40014, 42001])

interface Session {
  credentials: DocmostWechatCredentials
  origin: string
  accessToken: string
  expiresAt: number
}

/**
 * Deliberately a module-level Map rather than the persistent store doocs uses
 * for its own `mpConfig` / `mpToken`. Inside Docmost the credentials arrive from
 * the server on demand, so they only need to live as long as the tab does —
 * closing it is enough to be rid of them, and nothing lands in IndexedDB.
 */
const sessions = new Map<string, Session>()

/** Test seam; production code has no reason to clear the cache. */
export function resetWechatTokenCache(): void {
  sessions.clear()
}

export interface PendingAttachment {
  attachmentId: string
  /** Where this browser can read the bytes — a signed Docmost URL. */
  sourceUrl: string
}

/**
 * Same exchange standalone doocs performs in `services/upload/providers.ts`,
 * except the AppID and AppSecret come from Docmost instead of local settings.
 */
async function openSession(accountId: string | null): Promise<Session> {
  const credentials = await fetchDocmostWechatCredentials(accountId)
  if (!credentials.proxyOrigin) {
    // api.weixin.qq.com sends no CORS headers, so without a proxy there is
    // nowhere for this page to send the image at all.
    throw new Error(`This WeChat account has no proxy domain configured`)
  }
  const origin = credentials.proxyOrigin.replace(/\/+$/, ``)

  const response = await fetch(`${origin}/cgi-bin/stable_token`, {
    method: `POST`,
    headers: { 'Content-Type': `application/json` },
    body: JSON.stringify({
      grant_type: `client_credential`,
      appid: credentials.appId,
      secret: credentials.appSecret,
      force_refresh: false,
    }),
  })

  const body = await response.json().catch(() => ({})) as {
    access_token?: string
    expires_in?: number
    errcode?: number
  }
  if (!body.access_token) {
    // The code is what makes this diagnosable — 40164 names an egress IP that
    // is not on the account's whitelist.
    const detail = body.errcode ? ` (${body.errcode})` : ``
    throw new Error(`Could not obtain a WeChat access token${detail}`)
  }

  return {
    credentials,
    origin,
    accessToken: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 7200) * 1000,
  }
}

async function session(accountId: string | null, forceRefresh = false): Promise<Session> {
  const key = accountId ?? ``
  const cached = sessions.get(key)
  if (!forceRefresh && cached && cached.expiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS)
    return cached

  const fresh = await openSession(accountId)
  sessions.set(key, fresh)
  return fresh
}

async function postImage(current: Session, file: File): Promise<{ url?: string, media_id?: string, errcode?: number }> {
  const inline = file.size < INLINE_MAX_BYTES && INLINE_MIME_TYPES.has(file.type.toLowerCase())
  const path = inline ? `/cgi-bin/media/uploadimg` : `/cgi-bin/material/add_material`
  const query = inline ? `` : `&type=image`

  const body = new FormData()
  body.append(`media`, file, file.name)

  const response = await fetch(
    `${current.origin}${path}?access_token=${encodeURIComponent(current.accessToken)}${query}`,
    { method: `POST`, body },
  )
  // WeChat answers uploadimg as text/plain, so never branch on content-type here.
  return await response.json().catch(() => ({})) as { url?: string, errcode?: number }
}

/**
 * Uploads one image to the account's WeChat image host, through its proxy.
 *
 * This runs in the browser rather than on the Docmost server because the account
 * whitelists the network the author is on, not the server's egress.
 */
export async function uploadImageToWechat(
  accountId: string | null,
  file: File,
): Promise<{ url: string, mediaId?: string }> {
  let current = await session(accountId)
  let result = await postImage(current, file)

  // A cached token can lapse mid-session; one silent retry beats surfacing a
  // failure the author can do nothing about.
  if (!result.url && result.errcode && TOKEN_REJECTED_CODES.has(result.errcode)) {
    current = await session(accountId, true)
    result = await postImage(current, file)
  }

  if (!result.url) {
    const detail = result.errcode ? ` (${result.errcode})` : ``
    throw new Error(`WeChat did not return an image url${detail}`)
  }
  return result.media_id ? { url: result.url, mediaId: result.media_id } : { url: result.url }
}

async function readAttachment(item: PendingAttachment): Promise<File> {
  const response = await fetch(item.sourceUrl)
  if (!response.ok)
    throw new Error(`Could not read the image from Docmost (${response.status})`)

  const blob = await response.blob()
  // The name is the last path segment; parsing with URL would drag in a base and
  // buy nothing, since the handoff always hands out an absolute URL.
  const name = decodeURIComponent(
    item.sourceUrl.split(`?`)[0].split(`/`).pop() || `image`,
  )
  return new File([blob], name, { type: blob.type || `image/png` })
}

/**
 * Resolves an image-host URL for every attachment, uploading only the ones that
 * do not have one yet. Failures are per image: one rejected upload never stops
 * the rest, and whatever succeeded is still recorded.
 */
export async function publishAttachmentsFromBrowser(
  accountId: string | null,
  items: PendingAttachment[],
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>()
  if (items.length === 0)
    return resolved

  const known = await lookupDocmostPublishAssets(
    accountId,
    items.map(item => item.attachmentId),
  ).catch(() => [])
  for (const asset of known) {
    if (asset.status === `ready` && asset.url)
      resolved.set(asset.attachmentId, asset.url)
  }

  const missing = items.filter(item => !resolved.has(item.attachmentId))
  if (missing.length === 0)
    return resolved

  const uploaded: DocmostPublishAssetEntry[] = []
  for (const item of missing) {
    try {
      const file = await readAttachment(item)
      const { url, mediaId } = await uploadImageToWechat(accountId, file)
      resolved.set(item.attachmentId, url)
      uploaded.push(mediaId
        ? { attachmentId: item.attachmentId, url, mediaId }
        : { attachmentId: item.attachmentId, url })
    }
    catch {
      // Left out of the map; the caller keeps the Docmost URL and reports a count.
    }
  }

  if (uploaded.length > 0) {
    // Losing the record only costs a re-upload next time, so a failure here must
    // not discard URLs the author can already use.
    await registerDocmostPublishAssets(accountId, uploaded).catch(() => undefined)
  }

  return resolved
}
