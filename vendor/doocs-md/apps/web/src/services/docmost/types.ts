export interface DocmostAccount {
  id: string
  name: string
  appId?: string
  mpId: string | null
  serviceType: string | null
  verify: boolean
  secretConfigured?: boolean
}

export interface DocmostSetting {
  key: string
  value: unknown
  updatedAt: number
}

export interface DocmostRoundtripRisk {
  hasUnsupportedNodes: boolean
  unsupportedNodeTypes: string[]
}

/**
 * How far the server got rewriting Docmost attachment URLs to publish URLs.
 * `pending` needs the account this browser has selected, so the editor finishes
 * those itself; `failed` images keep their Docmost URL and can be retried.
 */
export interface DocmostImageSync {
  total: number
  ready: number
  pending: string[]
  failed: { attachmentId: string, error: string }[]
}

export interface DocmostBootstrapResponse {
  pageId?: string
  docmostPagePath?: string
  title: string
  markdown: string
  imageSync?: DocmostImageSync
  canEdit: boolean
  updatedAt: number
  contentHash: string
  roundtripRisk: DocmostRoundtripRisk
  settings: DocmostSetting[]
  accounts: DocmostAccount[]
  uploadProvider?: DocmostUploadProvider
  uploadConfig?: DocmostUploadConfig
  mdSessionToken: string
  mdSessionExpiresAt: number
}

export interface DocmostContentUpdateResponse {
  title: string
  markdown: string
  imageSync?: DocmostImageSync
  canEdit: boolean
  updatedAt: number
  contentHash: string
  roundtripRisk: DocmostRoundtripRisk
}

export type DocmostUploadProvider = 'wechat' | 's3'

export interface DocmostAttachment {
  id: string
  fileName: string
  url: string
  mimeType: string | null
  fileSize: number
}

export interface DocmostPublishAsset {
  attachmentId: string
  provider: DocmostUploadProvider
  status: 'ready' | 'failed'
  url?: string
  mediaId?: string
  error?: string
  retryable: boolean
}

export interface DocmostUploadResponse {
  attachment: DocmostAttachment
  publishAsset: DocmostPublishAsset
}

export interface DocmostPublishFileResponse {
  url: string
  mediaId?: string
}

export interface DocmostS3UploadConfig {
  endpoint: string | null
  region: string
  bucket: string
  accessKeyId: string
  path: string | null
  cdnHost: string | null
  pathStyle: boolean
  secretConfigured: boolean
}

export interface DocmostUploadConfig {
  provider: DocmostUploadProvider
  s3?: DocmostS3UploadConfig
}

export interface DocmostSession {
  token: string
  expiresAt: number
  pageId?: string
  docmostPagePath?: string
  canEdit?: boolean
  updatedAt?: number
  contentHash?: string
  savedTitle?: string
  savedMarkdown?: string
  roundtripRisk?: DocmostRoundtripRisk
}
