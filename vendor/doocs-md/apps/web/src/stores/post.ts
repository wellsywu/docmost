import type { Post } from '@/types/post'
import { uuidv4 } from '@md/shared/utils/uuid'
import { getDefaultContent } from '@/assets/example/default-content'
import { t } from '@/i18n/translate'
import { debounce } from '@/lib/debounce'
import { normalizePostHistory, toStoredDateTime } from '@/lib/format/datetime'
import { documentRepo, getLoadedDocuments, store } from '@/storage'
import { addPrefix } from '@/storage/prefix'
import { useEditorStore } from '@/stores/editor'

export type { Post } from '@/types/post'

function createDefaultPost(): Post {
  const content = getDefaultContent()
  return {
    id: uuidv4(),
    title: t('store.post.defaultTitle'),
    content,
    history: [
      { datetime: toStoredDateTime(), content },
    ],
    createDatetime: new Date(),
    updateDatetime: new Date(),
  }
}

function normalizePosts(raw: Post[]): Post[] {
  return raw.map((post, index) => {
    const now = Date.now()
    return {
      ...post,
      id: post.id ?? uuidv4(),
      createDatetime: new Date(post.createDatetime ?? now + index),
      updateDatetime: new Date(post.updateDatetime ?? now + index),
      history: normalizePostHistory(post.history),
    }
  })
}

function postSignature(post: Post): string {
  return [
    post.id,
    post.title,
    post.content.length,
    post.updateDatetime,
    post.parentId ?? ``,
    post.history?.length ?? 0,
    post.collapsed ? 1 : 0,
    post.docmostPageId ?? ``,
    post.docmostSavedTitle ?? ``,
    post.docmostSavedMarkdown?.length ?? 0,
    post.docmostUpdatedAt ?? ``,
    post.docmostContentHash ?? ``,
  ].join(`:`)
}

/**
 * Selection after a delete: deleting some other document must not move the user
 * to a different one, otherwise the editor buffer follows along and the list
 * stops matching what is on screen.
 */
export function resolveCurrentPostIdAfterDelete(
  remainingPosts: Pick<Post, 'id'>[],
  deletedIds: string[],
  currentPostId: string,
  deletedIndex: number,
): string {
  if (currentPostId && !deletedIds.includes(currentPostId))
    return currentPostId

  const fallbackIndex = Math.min(Math.max(deletedIndex, 0), remainingPosts.length - 1)
  return remainingPosts[fallbackIndex]?.id ?? ``
}

export interface DocmostPostOpenInput {
  pageId: string
  title: string
  markdown: string
  updatedAt: number
  contentHash: string
}

interface DocmostPostOpenResult {
  posts: Post[]
  post: Post
  loaded: {
    postId: string
    title: string
    markdown: string
    updatedAt: number
    contentHash: string
  }
}

function isCleanDocmostPost(post: Post) {
  return (
    post.docmostSavedTitle !== undefined
    && post.docmostSavedMarkdown !== undefined
    && post.title === post.docmostSavedTitle
    && post.content === post.docmostSavedMarkdown
  )
}

function setDocmostPostSnapshot(
  post: Post,
  title: string,
  markdown: string,
  updatedAt: number,
  contentHash: string,
) {
  post.docmostSavedTitle = title
  post.docmostSavedMarkdown = markdown
  post.docmostUpdatedAt = updatedAt
  post.docmostContentHash = contentHash
}

export function openDocmostPostInList(
  currentPosts: Post[],
  input: DocmostPostOpenInput,
  createId: () => string = uuidv4,
  now: Date = new Date(),
): DocmostPostOpenResult {
  let nextPosts = currentPosts
  let post = nextPosts.find(p => p.docmostPageId === input.pageId)

  if (!post) {
    const exactLegacyMatches = nextPosts.filter(p =>
      !p.docmostPageId
      && p.title === input.title
      && p.content === input.markdown,
    )
    post = exactLegacyMatches[0]

    if (post) {
      post.docmostPageId = input.pageId
      post.updateDatetime = now
      setDocmostPostSnapshot(post, input.title, input.markdown, input.updatedAt, input.contentHash)
    }
    else {
      post = {
        id: createId(),
        title: input.title,
        content: input.markdown,
        history: [
          { datetime: toStoredDateTime(now), content: input.markdown },
        ],
        createDatetime: now,
        updateDatetime: now,
        docmostPageId: input.pageId,
      }
      setDocmostPostSnapshot(post, input.title, input.markdown, input.updatedAt, input.contentHash)
      nextPosts = [...nextPosts, post]
    }
  }
  else if (isCleanDocmostPost(post)) {
    post.title = input.title
    post.content = input.markdown
    post.updateDatetime = now
    setDocmostPostSnapshot(post, input.title, input.markdown, input.updatedAt, input.contentHash)
  }

  const legacyDuplicateIds = new Set(nextPosts
    .filter(p =>
      p.id !== post.id
      && !p.docmostPageId
      && p.title === input.title
      && p.content === input.markdown,
    )
    .map(p => p.id))
  if (legacyDuplicateIds.size)
    nextPosts = nextPosts.filter(p => !legacyDuplicateIds.has(p.id))

  return {
    posts: nextPosts,
    post,
    loaded: {
      postId: post.id,
      title: post.docmostSavedTitle ?? input.title,
      markdown: post.docmostSavedMarkdown ?? input.markdown,
      updatedAt: post.docmostUpdatedAt ?? input.updatedAt,
      contentHash: post.docmostContentHash ?? input.contentHash,
    },
  }
}

/** Post list, current post, and CRUD operations. */
export const usePostStore = defineStore(`post`, () => {
  const loaded = getLoadedDocuments()
  const posts = ref<Post[]>(
    loaded?.length ? normalizePosts(loaded) : [createDefaultPost()],
  )

  const currentPostId = store.reactive(addPrefix(`current_post_id`), ``)
  const sortMode = store.reactive(addPrefix(`sort_mode`), `create-old-new`)

  let persistReady = false

  const persistAll = debounce(async (snapshot: Post[]) => {
    await documentRepo.saveAll(snapshot)
  }, 500)

  const persistOne = debounce(async (post: Post) => {
    await documentRepo.savePost(post)
  }, 500)

  /** Flush immediately on delete etc. so a refresh before debounce finishes does not restore stale data. */
  async function persistImmediately(): Promise<void> {
    persistAll.cancel()
    persistOne.cancel()
    await documentRepo.saveAll([...posts.value])
  }

  watch(
    posts,
    (value, oldValue) => {
      if (!persistReady)
        return

      if (!oldValue || value.length !== oldValue.length) {
        persistAll([...value])
        return
      }

      const changed: Post[] = []
      for (const post of value) {
        const prev = oldValue.find(p => p.id === post.id)
        if (!prev || postSignature(prev) !== postSignature(post))
          changed.push(post)
      }

      if (changed.length === 1)
        persistOne(changed[0])
      else if (changed.length > 0)
        persistAll([...value])
    },
    { deep: true },
  )

  onBeforeMount(() => {
    posts.value = normalizePosts(posts.value)

    if (!currentPostId.value || !posts.value.some(p => p.id === currentPostId.value))
      currentPostId.value = posts.value[0]?.id ?? ``

    if (!loaded?.length)
      void documentRepo.saveAll(posts.value)

    persistReady = true
  })

  onMounted(() => {
    const editorStore = useEditorStore()

    const flushToDisk = () => {
      editorStore.flushContentToPostStore()
      persistAll.flush()
      persistOne.flush()
      void persistImmediately()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === `hidden`)
        flushToDisk()
    }

    window.addEventListener(`pagehide`, flushToDisk)
    window.addEventListener(`beforeunload`, flushToDisk)
    document.addEventListener(`visibilitychange`, onVisibilityChange)
    onUnmounted(() => {
      window.removeEventListener(`pagehide`, flushToDisk)
      window.removeEventListener(`beforeunload`, flushToDisk)
      document.removeEventListener(`visibilitychange`, onVisibilityChange)
    })
  })

  function replacePosts(nextPosts: Post[]) {
    persistAll.cancel()
    persistOne.cancel()
    posts.value = normalizePosts(nextPosts)
    void documentRepo.saveAll(posts.value)
  }

  async function replacePostsAndPersist(nextPosts: Post[]): Promise<void> {
    persistAll.cancel()
    persistOne.cancel()
    posts.value = normalizePosts(nextPosts)
    await documentRepo.saveAll(posts.value)
  }

  const findIndexById = (id: string) => posts.value.findIndex(p => p.id === id)

  const currentPostIndex = computed<number>({
    get: () => findIndexById(currentPostId.value),
    set: (idx) => {
      if (idx >= 0 && idx < posts.value.length)
        currentPostId.value = posts.value[idx].id
    },
  })

  const getPostById = (id: string) => posts.value.find(p => p.id === id)
  const currentPost = computed(() => getPostById(currentPostId.value))

  const addPost = (title: string, parentId: string | null = null) => {
    const newPost: Post = {
      id: uuidv4(),
      title,
      content: `# ${title}`,
      history: [
        { datetime: toStoredDateTime(), content: `# ${title}` },
      ],
      createDatetime: new Date(),
      updateDatetime: new Date(),
      parentId,
    }
    posts.value.push(newPost)
    currentPostId.value = newPost.id
  }

  const openDocmostPost = (input: DocmostPostOpenInput) => {
    const result = openDocmostPostInList(posts.value, input)
    posts.value = result.posts
    currentPostId.value = result.post.id
    return result.loaded
  }

  const updateDocmostPostSnapshot = (postId: string, input: {
    title: string
    markdown: string
    updatedAt: number
    contentHash: string
  }) => {
    const post = getPostById(postId)
    if (post)
      setDocmostPostSnapshot(post, input.title, input.markdown, input.updatedAt, input.contentHash)
  }

  const renamePost = (id: string, title: string) => {
    const post = getPostById(id)
    if (post) {
      post.title = title
      post.updateDatetime = new Date()
    }
  }

  const delPost = (id: string, recursive: boolean = false) => {
    const post = getPostById(id)
    if (!post)
      return

    const deletedIndex = findIndexById(id)

    if (recursive) {
      const getChildIds = (parentId: string): string[] => {
        const children = posts.value.filter(p => p.parentId === parentId)
        return children.reduce((acc, child) => {
          return acc.concat(child.id, getChildIds(child.id))
        }, [] as string[])
      }

      const allIdsToDelete = [id, ...getChildIds(id)]
      allIdsToDelete.forEach((toDelId) => {
        const idx = findIndexById(toDelId)
        if (idx !== -1)
          posts.value.splice(idx, 1)
      })

      currentPostId.value = resolveCurrentPostIdAfterDelete(
        posts.value,
        allIdsToDelete,
        currentPostId.value,
        deletedIndex,
      )

      persistImmediately()
      return
    }

    const newParentId = post.parentId ?? null
    posts.value.forEach((p) => {
      if (p.parentId === id) {
        p.parentId = newParentId
        p.updateDatetime = new Date()
      }
    })

    if (deletedIndex === -1)
      return

    posts.value.splice(deletedIndex, 1)
    currentPostId.value = resolveCurrentPostIdAfterDelete(
      posts.value,
      [id],
      currentPostId.value,
      deletedIndex,
    )
    persistImmediately()
  }

  const updatePostParentId = (postId: string, parentId: string | null) => {
    const post = getPostById(postId)
    if (post) {
      post.parentId = parentId
      post.updateDatetime = new Date()
    }
  }

  const updatePostContent = (id: string, content: string) => {
    const post = getPostById(id)
    if (post) {
      post.content = content
      post.updateDatetime = new Date()
    }
  }

  const collapseAllPosts = () => {
    posts.value.forEach((post) => {
      post.collapsed = true
    })
  }

  const expandAllPosts = () => {
    posts.value.forEach((post) => {
      post.collapsed = false
    })
  }

  return {
    posts,
    currentPostId,
    sortMode,
    currentPostIndex,
    currentPost,
    getPostById,
    findIndexById,
    addPost,
    openDocmostPost,
    updateDocmostPostSnapshot,
    renamePost,
    delPost,
    updatePostParentId,
    updatePostContent,
    collapseAllPosts,
    expandAllPosts,
    replacePosts,
    replacePostsAndPersist,
    persistImmediately,
  }
})
