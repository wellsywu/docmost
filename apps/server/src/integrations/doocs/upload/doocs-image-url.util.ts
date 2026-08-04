import { attachmentIdFromFileUrl } from '../../../core/page/utils/attachment-identity.util';

interface ProsemirrorNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: ProsemirrorNode[];
}

export interface AttachmentIdentity {
  attachmentId: string;
  fileName: string;
}

export function buildAttachmentUrl(
  attachmentId: string,
  fileName: string,
): string {
  return `/api/files/${attachmentId}/${encodeURIComponent(fileName)}`;
}

/**
 * Publish URLs travel through a Markdown roundtrip and a browser, so the only
 * part that reliably survives is everything after the scheme — WeChat hands out
 * `http://mmbiz.qpic.cn/...` while the editor and mixed-content rules routinely
 * upgrade it to `https`. Keying on the scheme-less form keeps the reverse lookup
 * from silently missing those.
 */
export function publishUrlKey(url: string): string {
  return url.trim().replace(/^https?:\/\//i, '');
}

export function collectImageSrcs(content: unknown): string[] {
  const srcs = new Set<string>();
  visit(content, (node) => {
    const src = imageSrc(node);
    if (src) srcs.add(src);
  });
  return [...srcs];
}

/**
 * Returns a copy so the caller can keep the canonical content for the baseline
 * hash while handing the publish-facing copy to the doocs editor.
 */
export function applyPublishUrls(
  content: any,
  publishUrls: Map<string, string>,
): any {
  const copy = structuredClone(content);
  visit(copy, (node) => {
    const src = imageSrc(node);
    if (!src || !node.attrs) return;
    const attachmentId = attachmentIdFromFileUrl(src);
    const publishUrl = attachmentId ? publishUrls.get(attachmentId) : undefined;
    if (publishUrl) {
      node.attrs.src = publishUrl;
    }
  });
  return copy;
}

/**
 * Mutates image sources back to Docmost attachment URLs. URLs without a mapping
 * are left alone: they are either third-party images the page always had, or an
 * image whose publish upload never succeeded.
 */
export function restoreAttachmentUrls(
  content: unknown,
  attachments: Map<string, AttachmentIdentity>,
): void {
  visit(content, (node) => {
    const src = imageSrc(node);
    if (!src || !node.attrs) return;
    const attachment = attachments.get(publishUrlKey(src));
    if (attachment) {
      node.attrs.src = buildAttachmentUrl(
        attachment.attachmentId,
        attachment.fileName,
      );
    }
  });
}

function imageSrc(node: ProsemirrorNode): string | undefined {
  if (node.type !== 'image' || typeof node.attrs?.src !== 'string') {
    return undefined;
  }
  return node.attrs.src;
}

function visit(
  value: unknown,
  callback: (node: ProsemirrorNode) => void,
): void {
  if (!value || typeof value !== 'object') return;
  const node = value as ProsemirrorNode;
  callback(node);
  if (Array.isArray(node.content)) {
    for (const child of node.content) visit(child, callback);
  }
}
