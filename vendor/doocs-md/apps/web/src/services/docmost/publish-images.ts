import type { DocmostImageSync } from './types'
import { t } from '@/i18n/translate'
import { toast } from '@/lib/toast'
import { store } from '@/storage'
import { addPrefix } from '@/storage/prefix'
import { publishDocmostAttachment } from './client'

export type PublishAttachment = (attachmentId: string) => Promise<string | null>

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, `\\$&`)
}

/**
 * Swaps `/api/files/{attachmentId}/...` for the image host URL. The server does
 * this for every image it can resolve on its own; this covers the ones only the
 * browser can publish, because it knows which WeChat account is selected.
 */
export function replaceAttachmentUrls(markdown: string, urls: Map<string, string>): string {
  let result = markdown
  for (const [attachmentId, url] of urls) {
    const pattern = new RegExp(
      `(?:https?://[^\\s)"'\\]]*)?/api/files/${escapeRegExp(attachmentId)}/[^\\s)"'\\]]*`,
      `g`,
    )
    result = result.replace(pattern, url)
  }
  return result
}

async function defaultPublish(attachmentId: string): Promise<string | null> {
  const accountId = await store.get(addPrefix(`mp-current-account-id`))
  const asset = await publishDocmostAttachment(accountId, attachmentId)
  return asset.status === `ready` && asset.url ? asset.url : null
}

/**
 * Finishes the handoff rewrite the server could not complete. Returns the
 * markdown the editor should hold; the Docmost page itself is unaffected either
 * way, since saving maps every publish URL back to its attachment.
 */
export async function syncDocmostImageUrls(
  markdown: string,
  imageSync: DocmostImageSync | undefined,
  publish: PublishAttachment = defaultPublish,
): Promise<string> {
  if (!imageSync)
    return markdown

  const urls = new Map<string, string>()
  let unresolved = imageSync.failed.length

  for (const attachmentId of imageSync.pending) {
    try {
      const url = await publish(attachmentId)
      if (url)
        urls.set(attachmentId, url)
      else
        unresolved += 1
    }
    catch {
      unresolved += 1
    }
  }

  if (unresolved > 0)
    toast.warning(t(`docmost.imagesNotPublished`, { count: unresolved }))

  return urls.size > 0 ? replaceAttachmentUrls(markdown, urls) : markdown
}
