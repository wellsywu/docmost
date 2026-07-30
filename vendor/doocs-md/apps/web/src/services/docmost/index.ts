import type { DocmostBootstrapResponse } from './types'
import { ref } from 'vue'
import { store } from '@/storage'
import { useMpAccountsStore } from '@/stores/mpAccounts'
import { usePostStore } from '@/stores/post'
import { bootstrapDocmost, readDocmostSettings } from './client'
import { getDocmostSession, setDocmostSession } from './session'
import { applyDocmostSettings, startDocmostSettingsSync } from './settings'

export type DocmostStatus = 'inactive' | 'loading' | 'ready' | 'error'

const mode = ref(false)
const status = ref<DocmostStatus>(`inactive`)
const error = ref(``)

export const docmostIntegration = {
  mode,
  status,
  error,
}

export function isDocmostMode(): boolean {
  return mode.value
}

async function loadBootstrapContent(payload: DocmostBootstrapResponse): Promise<void> {
  await applyDocmostSettings(payload.settings)

  const accountStore = useMpAccountsStore()
  accountStore.replaceAccounts(payload.accounts)

  const postStore = usePostStore()
  postStore.addPost(payload.title)
  postStore.updatePostContent(postStore.currentPostId, payload.markdown)
  await postStore.persistImmediately()
}

function actionableError(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause)
  return detail || `Unable to open the Docmost page. Return to Docmost and open the editor again.`
}

export async function initializeDocmostIntegration(ticket: string | null): Promise<void> {
  const restoredSession = getDocmostSession()
  if (!ticket && !restoredSession)
    return

  mode.value = true
  status.value = `loading`
  error.value = ``

  try {
    await store.set(`imgHost`, `docmost`)

    if (ticket) {
      const payload = await bootstrapDocmost(ticket)
      setDocmostSession({
        token: payload.mdSessionToken,
        expiresAt: payload.mdSessionExpiresAt,
      })
      await loadBootstrapContent(payload)
    }
    else {
      await applyDocmostSettings(await readDocmostSettings())
    }

    startDocmostSettingsSync()
    status.value = `ready`
  }
  catch (cause) {
    status.value = `error`
    error.value = actionableError(cause)
  }
}
