import type { DocmostSetting } from './types'
import type { SyncSetting } from '@/services/sync/types'
import { hydrateSyncedSettings } from '@/services/sync/hydrate'
import {
  applyRemoteSettings,
  collectChangedSettings,
} from '@/services/sync/settings'
import { updateDocmostSettings } from './client'
import { normalizeDocmostSettings } from './normalize-settings'
import { getDocmostSession } from './session'

const SETTINGS_SCAN_MS = 500
const SETTINGS_PUSH_DEBOUNCE_MS = 800

let scanTimer: ReturnType<typeof setInterval> | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let pending = new Map<string, SyncSetting>()
let pushInFlight = false

export async function applyDocmostSettings(settings: readonly DocmostSetting[]): Promise<void> {
  const normalized = normalizeDocmostSettings(settings)
  const { keys } = await applyRemoteSettings(normalized)
  if (keys.length)
    await hydrateSyncedSettings(keys)
}

async function flushSettings(): Promise<void> {
  if (pushInFlight || !pending.size || !getDocmostSession())
    return

  pushInFlight = true
  const batch = [...pending.values()]
  pending = new Map()
  try {
    const remote = await updateDocmostSettings(batch)
    await applyDocmostSettings(remote)
  }
  catch {
    for (const setting of batch) {
      const current = pending.get(setting.key)
      if (!current || current.updatedAt < setting.updatedAt)
        pending.set(setting.key, setting)
    }
  }
  finally {
    pushInFlight = false
    if (pending.size)
      scheduleFlush()
  }
}

function scheduleFlush(): void {
  if (pushTimer)
    clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void flushSettings()
  }, SETTINGS_PUSH_DEBOUNCE_MS)
}

function scanSettings(): void {
  for (const setting of collectChangedSettings()) {
    const current = pending.get(setting.key)
    if (!current || current.updatedAt <= setting.updatedAt)
      pending.set(setting.key, setting)
  }
  if (pending.size)
    scheduleFlush()
}

export function startDocmostSettingsSync(): void {
  if (scanTimer)
    return
  scanSettings()
  scanTimer = setInterval(scanSettings, SETTINGS_SCAN_MS)
}

export function stopDocmostSettingsSync(): void {
  if (scanTimer)
    clearInterval(scanTimer)
  if (pushTimer)
    clearTimeout(pushTimer)
  scanTimer = null
  pushTimer = null
  pending.clear()
  pushInFlight = false
}
