import type { DocmostSetting } from './types'
import type { SyncSetting } from '@/services/sync/types'
import { SYNC_SETTING_KEYS } from '@/services/sync/settings'

export function normalizeDocmostSettings(settings: readonly DocmostSetting[]): SyncSetting[] {
  return settings.flatMap((setting) => {
    if (!SYNC_SETTING_KEYS.includes(setting.key) || !Number.isFinite(setting.updatedAt))
      return []

    let value: string | null
    if (setting.value === null || typeof setting.value === `string`) {
      value = setting.value
    }
    else {
      const serialized = JSON.stringify(setting.value)
      if (typeof serialized !== `string`)
        return []
      value = serialized
    }

    return [{ key: setting.key, value, updatedAt: setting.updatedAt }]
  })
}
