import { validate as isValidUUID } from 'uuid';

interface ProsemirrorNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: ProsemirrorNode[];
}

export interface AttachmentIdentity {
  id: string;
  fileSize?: number | bigint | string | null;
}

export function collectDocmostAttachmentIds(content: unknown): string[] {
  const ids = new Set<string>();
  visit(content, (node) => {
    const id = attachmentIdFromImage(node);
    if (id) ids.add(id);
  });
  return [...ids];
}

export function restoreDocmostAttachmentIds(
  content: unknown,
  attachments: AttachmentIdentity[],
): void {
  const allowed = new Map(
    attachments.map((attachment) => [attachment.id, attachment]),
  );
  visit(content, (node) => {
    const id = attachmentIdFromImage(node);
    const attachment = id ? allowed.get(id) : undefined;
    if (!attachment || !node.attrs) return;

    node.attrs.attachmentId = attachment.id;
    if (attachment.fileSize !== null && attachment.fileSize !== undefined) {
      node.attrs.size = Number(attachment.fileSize);
    }
  });
}

function attachmentIdFromImage(node: ProsemirrorNode): string | undefined {
  if (node.type !== 'image' || typeof node.attrs?.src !== 'string') {
    return undefined;
  }
  return attachmentIdFromFileUrl(node.attrs.src);
}

export function attachmentIdFromFileUrl(src: string): string | undefined {
  let pathname: string;
  try {
    pathname = new URL(src, 'https://docmost.local').pathname;
  } catch {
    return undefined;
  }

  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'files') {
    const attachmentId = decodeURIComponent(parts[2] || '');
    return isValidUUID(attachmentId) ? attachmentId : undefined;
  }
  if (parts[0] === 'files') {
    const attachmentId = decodeURIComponent(parts[1] || '');
    return isValidUUID(attachmentId) ? attachmentId : undefined;
  }

  return undefined;
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
