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

export interface DocmostBootstrapResponse {
  title: string
  markdown: string
  settings: DocmostSetting[]
  accounts: DocmostAccount[]
  mdSessionToken: string
  mdSessionExpiresAt: number
}

export interface DocmostUploadResponse {
  url: string
  mediaId?: string
}

export interface DocmostSession {
  token: string
  expiresAt: number
}
