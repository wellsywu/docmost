import type { Ref } from 'vue'
import type { Post } from '@/types/post'
import { watch } from 'vue'

const COMMIT_DELAY = 300

export interface EditorPostBindingOptions {
  posts: Ref<Post[]>
  currentPostId: Ref<string>
  /** Current editor buffer text, or null when the editor is not ready yet. */
  readBuffer: () => string | null
  /** Load the given content into the editor buffer (no-op when unchanged). */
  writeBuffer: (content: string) => void
}

export interface EditorPostBinding {
  /** Post the editor buffer currently belongs to. */
  boundPostId: () => string
  /** Bind the buffer to the current post without touching it (initial mount). */
  bindCurrentPost: () => void
  /** Write the buffer back into the post that owns it. */
  commit: () => void
  scheduleCommit: () => void
  cancelScheduledCommit: () => void
}

/**
 * Binds the editor buffer to a post by id.
 *
 * Position in `posts` is not a stable identity: deleting a document shifts every
 * later index, so an index-based binding writes the buffer into an unrelated post
 * and that post then renders someone else's content.
 */
export function useEditorPostBinding(options: EditorPostBindingOptions): EditorPostBinding {
  const { posts, currentPostId, readBuffer, writeBuffer } = options

  let boundPostId = ``
  let commitTimer: ReturnType<typeof setTimeout> | undefined

  const findPostById = (id: string) => (id ? posts.value.find(p => p.id === id) : undefined)

  function cancelScheduledCommit() {
    clearTimeout(commitTimer)
    commitTimer = undefined
  }

  /** Deleted posts are simply dropped here, so a pending buffer never resurrects one. */
  function commit() {
    cancelScheduledCommit()
    const post = findPostById(boundPostId)
    if (!post)
      return

    const value = readBuffer()
    if (value == null || value === post.content)
      return

    post.updateDatetime = new Date()
    post.content = value
  }

  function scheduleCommit() {
    cancelScheduledCommit()
    commitTimer = setTimeout(commit, COMMIT_DELAY)
  }

  function bindCurrentPost() {
    boundPostId = currentPostId.value
  }

  watch(currentPostId, (nextId) => {
    commit()

    const post = findPostById(nextId)
    if (!post)
      return

    boundPostId = nextId
    writeBuffer(post.content)
  })

  /** Keep the buffer in sync when the current post changes externally (cloud sync, Docmost pull). */
  watch(
    () => findPostById(currentPostId.value)?.content,
    (content) => {
      if (content == null)
        return
      writeBuffer(content)
    },
  )

  return {
    boundPostId: () => boundPostId,
    bindCurrentPost,
    commit,
    scheduleCommit,
    cancelScheduledCommit,
  }
}
