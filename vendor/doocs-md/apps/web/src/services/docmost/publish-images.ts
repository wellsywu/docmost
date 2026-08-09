import type { DocmostImageSync } from './types'
import type { PendingAttachment } from './wechat-publish'
import { t } from '@/i18n/translate'
import { toast } from '@/lib/toast'
import { store } from '@/storage'
import { addPrefix } from '@/storage/prefix'
import { publishAttachmentsFromBrowser } from './wechat-publish'

export type PublishAttachments = (
  items: PendingAttachment[],
) => Promise<Map<string, string>>

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, `\\$&`)
}

/**
 * Matches both shapes an attachment URL takes in handed-off Markdown: the plain
 * `/api/files/{id}/...` a Docmost page stores, and the signed
 * `/api/files/public/{id}/...?jwt=` the editor is given so its `<img>` tags can
 * load the image from another origin.
 */
function attachmentUrlPattern(attachmentId: string): RegExp {
  return new RegExp(
    `(?:https?://[^\\s)"'\\]]*)?/api/files/(?:public/)?${escapeRegExp(attachmentId)}/[^\\s)"'\\]]*`,
    `g`,
  )
}

/** Swaps every Docmost URL for its image-host URL. */
export function replaceAttachmentUrls(markdown: string, urls: Map<string, string>): string {
  let result = markdown
  for (const [attachmentId, url] of urls)
    result = result.replace(attachmentUrlPattern(attachmentId), url)
  return result
}

/**
 * Where this browser can read an attachment's bytes. Taken from the Markdown
 * because that URL is signed and short-lived — it cannot be reconstructed from
 * the attachment id alone.
 */
export function findAttachmentUrl(markdown: string, attachmentId: string): string | null {
  const match = markdown.match(attachmentUrlPattern(attachmentId))
  return match?.[0] ?? null
}

async function defaultPublish(items: PendingAttachment[]): Promise<Map<string, string>> {
  const accountId = await store.get(addPrefix(`mp-current-account-id`))
  return await publishAttachmentsFromBrowser(accountId, items)
}

/**
 * Turns the Docmost image URLs in `markdown` into image-host URLs, uploading
 * whatever has not been published yet.
 *
 * Call this when producing something that leaves the editor — the clipboard HTML
 * or a publish payload — not on the editor's own content. WeChat's image host
 * blocks hotlinking, so rewriting the document in place would replace pictures
 * the author can see with ones they cannot.
 */
export async function syncDocmostImageUrls(
  markdown: string,
  imageSync: DocmostImageSync | undefined,
  publish: PublishAttachments = defaultPublish,
): Promise<string> {
  if (!imageSync)
    return markdown

  const candidates = [
    ...imageSync.pending,
    ...imageSync.failed.map(entry => entry.attachmentId),
  ]
  if (candidates.length === 0)
    return markdown

  // An attachment with no URL left in the Markdown was removed from the document
  // after the handoff, so there is nothing to publish for it.
  const items = candidates.flatMap((attachmentId) => {
    const sourceUrl = findAttachmentUrl(markdown, attachmentId)
    return sourceUrl ? [{ attachmentId, sourceUrl }] : []
  })

  let urls = new Map<string, string>()
  try {
    urls = await publish(items)
  }
  catch {
    // Everything stays unresolved below, which is exactly the right count.
  }
  const unresolved = items.filter(item => !urls.has(item.attachmentId)).length

  if (unresolved > 0)
    toast.warning(t(`docmost.imagesNotPublished`, { count: unresolved }))

  return urls.size > 0 ? replaceAttachmentUrls(markdown, urls) : markdown
}
