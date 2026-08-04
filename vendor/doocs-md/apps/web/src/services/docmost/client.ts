import type {
  DocmostBootstrapResponse,
  DocmostContentUpdateResponse,
  DocmostPublishAsset,
  DocmostPublishFileResponse,
  DocmostSetting,
  DocmostUploadConfig,
  DocmostUploadResponse,
} from './types'
import type { SyncSetting } from '@/services/sync/types'
import { clearDocmostSession, getDocmostSessionToken } from './session'

const DOCMOST_API_PREFIX = `/docmost-api/integrations/doocs`

interface DocmostApiResponse<T> {
  data: T
  success: boolean
  status: number
}

export class DocmostApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = `DocmostApiError`
  }
}

async function responseError(response: Response): Promise<DocmostApiError> {
  let message = response.statusText || `Request failed`
  try {
    const body = await response.json() as { message?: string, error?: string }
    message = body.message || body.error || message
    return new DocmostApiError(response.status, message, body)
  }
  catch {
    // Keep the HTTP status text when the response is not JSON.
  }
  return new DocmostApiError(response.status, message)
}

async function responseData<T>(response: Response): Promise<T> {
  const body = await response.json() as T | DocmostApiResponse<T>
  if (
    typeof body === `object`
    && body !== null
    && `data` in body
    && `success` in body
    && `status` in body
  ) {
    return body.data
  }
  return body
}

async function authorizedRequest<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const token = getDocmostSessionToken()
  if (!token)
    throw new DocmostApiError(401, `Docmost session is missing or expired`)

  const headers = new Headers(init.headers)
  headers.set(`Authorization`, `Bearer ${token}`)
  const response = await fetch(`${DOCMOST_API_PREFIX}${path}`, {
    ...init,
    headers,
  })
  if (!response.ok) {
    if (response.status === 401)
      clearDocmostSession()
    throw await responseError(response)
  }
  return await responseData<T>(response)
}

export async function bootstrapDocmost(ticket: string): Promise<DocmostBootstrapResponse> {
  const response = await fetch(`${DOCMOST_API_PREFIX}/bootstrap`, {
    method: `POST`,
    headers: { 'Content-Type': `application/json` },
    body: JSON.stringify({ ticket }),
  })
  if (!response.ok)
    throw await responseError(response)
  return await responseData<DocmostBootstrapResponse>(response)
}

export async function readDocmostSettings(): Promise<DocmostSetting[]> {
  return await authorizedRequest<DocmostSetting[]>(`/settings`, {
    method: `POST`,
  })
}

export async function updateDocmostSettings(settings: SyncSetting[]): Promise<DocmostSetting[]> {
  return await authorizedRequest<DocmostSetting[]>(`/settings/update`, {
    method: `POST`,
    headers: { 'Content-Type': `application/json` },
    body: JSON.stringify({ settings }),
  })
}

export async function updateDocmostContent(payload: {
  title?: string
  markdown: string
  expectedUpdatedAt: number
  expectedContentHash: string
  acknowledgeRoundtripRisk?: boolean
}): Promise<DocmostContentUpdateResponse> {
  return await authorizedRequest<DocmostContentUpdateResponse>(`/content/update`, {
    method: `POST`,
    headers: { 'Content-Type': `application/json` },
    body: JSON.stringify(payload),
  })
}

export async function uploadDocmostImage(accountId: string, file: File): Promise<DocmostUploadResponse> {
  const body = new FormData()
  body.append(`accountId`, accountId)
  body.append(`file`, file, file.name)
  return await authorizedRequest<DocmostUploadResponse>(`/upload`, {
    method: `POST`,
    body,
  })
}

export async function uploadDocmostImageWithConfig(accountId: string | null, file: File): Promise<DocmostUploadResponse> {
  const body = new FormData()
  if (accountId)
    body.append(`accountId`, accountId)
  body.append(`file`, file, file.name)
  return await authorizedRequest<DocmostUploadResponse>(`/upload`, {
    method: `POST`,
    body,
  })
}

export async function publishDocmostAttachment(accountId: string | null, attachmentId: string): Promise<DocmostPublishAsset> {
  return await authorizedRequest<DocmostPublishAsset>(`/upload/publish`, {
    method: `POST`,
    headers: { 'Content-Type': `application/json` },
    body: JSON.stringify(accountId ? { attachmentId, accountId } : { attachmentId }),
  })
}

export async function uploadDocmostPublishFile(accountId: string | null, file: File): Promise<DocmostPublishFileResponse> {
  const body = new FormData()
  if (accountId)
    body.append(`accountId`, accountId)
  body.append(`file`, file, file.name)
  return await authorizedRequest<DocmostPublishFileResponse>(`/upload/publish-file`, {
    method: `POST`,
    body,
  })
}

export async function readDocmostUploadConfig(): Promise<DocmostUploadConfig> {
  return await authorizedRequest<DocmostUploadConfig>(`/upload/config`, {
    method: `POST`,
  })
}
