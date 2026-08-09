import type { DocmostBootstrapResponse, DocmostContentUpdateResponse, DocmostImageSync, DocmostRoundtripRisk } from './types'
import { ref } from 'vue'
import { store } from '@/storage'
import { useMpAccountsStore } from '@/stores/mpAccounts'
import { usePostStore } from '@/stores/post'
import { bootstrapDocmost, DocmostApiError, readDocmostSettings, readDocmostUploadConfig, updateDocmostContent } from './client'
import { syncDocmostImageUrls } from './publish-images'
import { getDocmostSession, setDocmostSession } from './session'
import { applyDocmostSettings, startDocmostSettingsSync } from './settings'

export type DocmostStatus = 'inactive' | 'loading' | 'ready' | 'error'
export type DocmostSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'expired' | 'readonly' | 'error'

interface DocmostBaseline {
  updatedAt: number
  contentHash: string
}

interface DocmostLoadedContent {
  title: string
  markdown: string
  updatedAt: number
  contentHash: string
}

const mode = ref(false)
const status = ref<DocmostStatus>(`inactive`)
const error = ref(``)
const saveStatus = ref<DocmostSaveStatus>(`idle`)
const saveError = ref(``)
const canEdit = ref(true)
const savedTitle = ref(``)
const savedMarkdown = ref(``)
const roundtripRisk = ref<DocmostRoundtripRisk>({
  hasUnsupportedNodes: false,
  unsupportedNodeTypes: [],
})
const conflictRemote = ref<DocmostContentUpdateResponse | null>(null)
const baseline = ref<DocmostBaseline | null>(null)
const pagePath = ref<string | null>(null)
/** Which images still need an image-host URL before content can leave the editor. */
const imageSync = ref<DocmostImageSync | null>(null)

export const docmostIntegration = {
  mode,
  status,
  error,
  saveStatus,
  saveError,
  canEdit,
  roundtripRisk,
  conflictRemote,
  pagePath,
}

export function isDocmostMode(): boolean {
  return mode.value
}

/**
 * Swaps Docmost image URLs for image-host URLs in content that is about to leave
 * the editor — clipboard HTML, a publish payload — uploading anything that has
 * not been published yet.
 *
 * Outside Docmost mode this is a no-op, so callers can apply it unconditionally.
 */
export async function resolveDocmostExportContent(html: string): Promise<string> {
  if (!mode.value)
    return html
  return await syncDocmostImageUrls(html, imageSync.value ?? undefined)
}

async function loadBootstrapContent(payload: DocmostBootstrapResponse): Promise<DocmostLoadedContent> {
  await applyDocmostSettings(payload.settings)
  await store.set(`docmostUploadProvider`, payload.uploadProvider ?? payload.uploadConfig?.provider ?? `wechat`)

  const accountStore = useMpAccountsStore()
  accountStore.replaceAccounts(payload.accounts)

  // The editor keeps Docmost's own image URLs. They render here, and WeChat's
  // image host — which blocks hotlinking — would not, so the swap happens only
  // when content leaves for the clipboard or a publish payload.
  imageSync.value = payload.imageSync ?? null
  const markdown = payload.markdown

  const postStore = usePostStore()
  const loaded = payload.pageId
    ? postStore.openDocmostPost({
        pageId: payload.pageId,
        title: payload.title,
        markdown,
        updatedAt: payload.updatedAt,
        contentHash: payload.contentHash,
      })
    : (() => {
        postStore.addPost(payload.title)
        postStore.updatePostContent(postStore.currentPostId, markdown)
        return {
          title: payload.title,
          markdown,
          updatedAt: payload.updatedAt,
          contentHash: payload.contentHash,
        }
      })()
  await postStore.persistImmediately()
  return loaded
}

function setBaseline(next: DocmostBaseline): void {
  baseline.value = next
  const session = getDocmostSession()
  if (session) {
    setDocmostSession({
      ...session,
      updatedAt: next.updatedAt,
      contentHash: next.contentHash,
      canEdit: canEdit.value,
      roundtripRisk: roundtripRisk.value,
    })
  }
}

function setSavedSnapshot(title: string, markdown: string): void {
  savedTitle.value = title
  savedMarkdown.value = markdown
  saveStatus.value = canEdit.value ? `saved` : `readonly`
  conflictRemote.value = null
  const session = getDocmostSession()
  if (session) {
    setDocmostSession({
      ...session,
      canEdit: canEdit.value,
      savedTitle: title,
      savedMarkdown: markdown,
    })
  }
}

function restoreBaselineFromSession(): void {
  const session = getDocmostSession()
  pagePath.value = normalizeDocmostPagePath(session?.docmostPagePath)
  canEdit.value = session?.canEdit ?? true
  savedTitle.value = session?.savedTitle ?? savedTitle.value
  savedMarkdown.value = session?.savedMarkdown ?? savedMarkdown.value
  roundtripRisk.value = session?.roundtripRisk ?? roundtripRisk.value
  if (Number.isFinite(session?.updatedAt) && session?.contentHash) {
    baseline.value = {
      updatedAt: session.updatedAt!,
      contentHash: session.contentHash,
    }
  }
}

function normalizeDocmostPagePath(value: string | undefined): string | null {
  if (!value)
    return null
  return /^\/p\/[a-z0-9-]+$/i.test(value) ? value : null
}

function classifySaveError(cause: unknown): DocmostSaveStatus {
  if (cause instanceof DocmostApiError) {
    if (cause.status === 409)
      return `conflict`
    if (cause.status === 401)
      return `expired`
    if (cause.status === 403)
      return `readonly`
  }
  return `error`
}

function parseConflictRemote(cause: unknown): DocmostContentUpdateResponse | null {
  if (!(cause instanceof DocmostApiError) || cause.status !== 409)
    return null
  const detail = cause.details as Partial<DocmostContentUpdateResponse> | null | undefined
  if (
    typeof detail?.title === `string`
    && typeof detail.markdown === `string`
    && typeof detail.updatedAt === `number`
    && typeof detail.contentHash === `string`
  ) {
    return {
      title: detail.title,
      markdown: detail.markdown,
      canEdit: detail.canEdit ?? true,
      updatedAt: detail.updatedAt,
      contentHash: detail.contentHash,
      roundtripRisk: detail.roundtripRisk ?? {
        hasUnsupportedNodes: false,
        unsupportedNodeTypes: [],
      },
    }
  }
  return null
}

export async function saveDocmostContent(
  title: string,
  markdown: string,
  acknowledgeRoundtripRisk = false,
): Promise<void> {
  if (!mode.value)
    return

  restoreBaselineFromSession()
  if (!canEdit.value) {
    saveStatus.value = `readonly`
    saveError.value = `This Docmost page is read only.`
    throw new DocmostApiError(403, saveError.value)
  }

  if (!baseline.value) {
    saveStatus.value = `expired`
    saveError.value = `Open this page from Docmost again before saving back.`
    throw new DocmostApiError(401, saveError.value)
  }

  saveStatus.value = `saving`
  saveError.value = ``

  try {
    const result = await updateDocmostContent({
      title,
      markdown,
      expectedUpdatedAt: baseline.value.updatedAt,
      expectedContentHash: baseline.value.contentHash,
      acknowledgeRoundtripRisk,
    })
    canEdit.value = result.canEdit
    roundtripRisk.value = result.roundtripRisk
    // The echo comes back on Docmost URLs, exactly as the editor holds them.
    imageSync.value = result.imageSync ?? null
    const savedMarkdown = result.markdown
    const postStore = usePostStore()
    if (postStore.currentPostId) {
      postStore.updateDocmostPostSnapshot(postStore.currentPostId, {
        title: result.title,
        markdown: savedMarkdown,
        updatedAt: result.updatedAt,
        contentHash: result.contentHash,
      })
      await postStore.persistImmediately()
    }
    setBaseline({
      updatedAt: result.updatedAt,
      contentHash: result.contentHash,
    })
    setSavedSnapshot(result.title, savedMarkdown)
  }
  catch (cause) {
    saveStatus.value = classifySaveError(cause)
    conflictRemote.value = parseConflictRemote(cause)
    saveError.value = cause instanceof Error ? cause.message : String(cause)
    throw cause
  }
}

export async function reloadDocmostConflictVersion(): Promise<void> {
  const remote = conflictRemote.value
  if (!remote)
    return

  const postStore = usePostStore()
  if (postStore.currentPostId) {
    postStore.renamePost(postStore.currentPostId, remote.title)
    postStore.updatePostContent(postStore.currentPostId, remote.markdown)
    postStore.updateDocmostPostSnapshot(postStore.currentPostId, {
      title: remote.title,
      markdown: remote.markdown,
      updatedAt: remote.updatedAt,
      contentHash: remote.contentHash,
    })
    await postStore.persistImmediately()
  }
  canEdit.value = remote.canEdit
  roundtripRisk.value = remote.roundtripRisk
  setBaseline({
    updatedAt: remote.updatedAt,
    contentHash: remote.contentHash,
  })
  setSavedSnapshot(remote.title, remote.markdown)
}

export function downloadDocmostLocalDraft(title: string, markdown: string): void {
  const filename = `${(title || `docmost-draft`).replace(/[\\/:*?"<>|]+/g, `-`)}.md`
  const blob = new Blob([markdown], { type: `text/markdown;charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement(`a`)
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function markDocmostDirty(title: string, markdown: string): void {
  if (!mode.value || !canEdit.value)
    return
  if (title !== savedTitle.value || markdown !== savedMarkdown.value) {
    if (saveStatus.value !== `saving`)
      saveStatus.value = `dirty`
  }
  else if (saveStatus.value === `dirty`) {
    saveStatus.value = `saved`
  }
}

export function hasUnsavedDocmostChanges(): boolean {
  return (
    mode.value
    && canEdit.value
    && [`dirty`, `error`, `conflict`, `expired`].includes(saveStatus.value)
  )
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
  if (ticket)
    pagePath.value = null

  try {
    await store.set(`imgHost`, `docmost`)

    if (ticket) {
      const payload = await bootstrapDocmost(ticket)
      const loaded = await loadBootstrapContent(payload)
      setDocmostSession({
        token: payload.mdSessionToken,
        expiresAt: payload.mdSessionExpiresAt,
        pageId: payload.pageId,
        docmostPagePath: payload.docmostPagePath,
        canEdit: payload.canEdit,
        updatedAt: loaded.updatedAt,
        contentHash: loaded.contentHash,
        savedTitle: loaded.title,
        savedMarkdown: loaded.markdown,
        roundtripRisk: payload.roundtripRisk,
      })
      canEdit.value = payload.canEdit
      pagePath.value = normalizeDocmostPagePath(payload.docmostPagePath)
      roundtripRisk.value = payload.roundtripRisk
      setBaseline({
        updatedAt: loaded.updatedAt,
        contentHash: loaded.contentHash,
      })
      setSavedSnapshot(loaded.title, loaded.markdown)
    }
    else {
      restoreBaselineFromSession()
      await applyDocmostSettings(await readDocmostSettings())
      const uploadConfig = await readDocmostUploadConfig()
      await store.set(`docmostUploadProvider`, uploadConfig.provider)
    }

    startDocmostSettingsSync()
    status.value = `ready`
  }
  catch (cause) {
    status.value = `error`
    error.value = actionableError(cause)
  }
}
