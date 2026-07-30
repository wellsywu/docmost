export type PublicationStatus =
  | "queued"
  | "scanning"
  | "blocked"
  | "rendering"
  | "uploading"
  | "draft_created"
  | "failed";

export interface ProseMirrorNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

export interface DocmostPage<T> {
  id: string;
  title: string;
  slugId?: string;
  updatedAt?: string;
  content: T;
}

export interface PublishInput {
  pageId: string;
  accountId: string;
  author: string;
  digest?: string;
  contentSourceUrl?: string;
  needOpenComment: boolean;
  onlyFansCanComment: boolean;
}

export interface PublishConfig extends PublishInput {
  channel: "wechat";
  accountId: string;
  templateVersion: string;
}

export interface PublicationJob {
  id: string;
  pageId: string;
  sourceHash: string;
  renderedHtmlHash?: string;
  idempotencyKey: string;
  status: PublicationStatus;
  accountId: string;
  templateVersion: string;
  remoteDraftId?: string;
  warnings: string[];
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface BinaryAsset {
  sourceUrl: string;
  bytes: Uint8Array;
  mime: string;
  transform: "none" | "svg_to_png" | "mermaid_to_png";
}

export interface RenderedArticle {
  html: string;
  generatedAssets: Map<string, BinaryAsset>;
}

export interface DraftArticle {
  title: string;
  author: string;
  digest?: string;
  content: string;
  contentSourceUrl?: string;
  thumbMediaId: string;
  needOpenComment: 0 | 1;
  onlyFansCanComment: 0 | 1;
}
