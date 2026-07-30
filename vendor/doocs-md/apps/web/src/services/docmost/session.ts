import type { DocmostSession } from './types'

const SESSION_KEY = `docmost-md-session`

let memorySession: DocmostSession | null = null
let expiryTimer: ReturnType<typeof setTimeout> | null = null

function canUseSessionStorage(): boolean {
  return typeof sessionStorage !== `undefined`
}

export function clearDocmostSession(): void {
  memorySession = null
  if (expiryTimer)
    clearTimeout(expiryTimer)
  expiryTimer = null
  if (canUseSessionStorage()) {
    try {
      sessionStorage.removeItem(SESSION_KEY)
    }
    catch {
      // Memory-only mode remains available when browser storage is blocked.
    }
  }
}

function scheduleExpiry(expiresAt: number): void {
  if (expiryTimer)
    clearTimeout(expiryTimer)
  expiryTimer = setTimeout(
    clearDocmostSession,
    Math.max(0, expiresAt - Date.now()),
  )
}

export function setDocmostSession(session: DocmostSession): void {
  if (!session.token || session.expiresAt <= Date.now()) {
    clearDocmostSession()
    return
  }

  memorySession = session
  scheduleExpiry(session.expiresAt)
  if (canUseSessionStorage()) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    }
    catch {
      // Keep the session in memory when browser storage is blocked.
    }
  }
}

export function getDocmostSession(): DocmostSession | null {
  if (!memorySession && canUseSessionStorage()) {
    try {
      memorySession = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? `null`) as DocmostSession | null
      if (memorySession)
        scheduleExpiry(memorySession.expiresAt)
    }
    catch {
      clearDocmostSession()
    }
  }

  if (!memorySession?.token || !Number.isFinite(memorySession.expiresAt) || memorySession.expiresAt <= Date.now()) {
    clearDocmostSession()
    return null
  }

  return memorySession
}

export function getDocmostSessionToken(): string | null {
  return getDocmostSession()?.token ?? null
}
