import type {
  DocmostBootstrapResponse,
  DocmostSetting,
  DocmostUploadResponse,
} from './types'
import type { SyncSetting } from '@/services/sync/types'
import { clearDocmostSession, getDocmostSessionToken } from './session'

const DOCMOST_API_PREFIX = `/docmost-api/integrations/md`

export class DocmostApiError extends Error {
  constructor(
    public status: number,
    message: string,
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
  }
  catch {
    // Keep the HTTP status text when the response is not JSON.
  }
  return new DocmostApiError(response.status, message)
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
  return await response.json() as T
}

export async function bootstrapDocmost(ticket: string): Promise<DocmostBootstrapResponse> {
  const response = await fetch(`${DOCMOST_API_PREFIX}/bootstrap`, {
    method: `POST`,
    headers: { 'Content-Type': `application/json` },
    body: JSON.stringify({ ticket }),
  })
  if (!response.ok)
    throw await responseError(response)
  return await response.json() as DocmostBootstrapResponse
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

export async function uploadDocmostImage(accountId: string, file: File): Promise<DocmostUploadResponse> {
  const body = new FormData()
  body.append(`accountId`, accountId)
  body.append(`file`, file, file.name)
  return await authorizedRequest<DocmostUploadResponse>(`/upload`, {
    method: `POST`,
    body,
  })
}
