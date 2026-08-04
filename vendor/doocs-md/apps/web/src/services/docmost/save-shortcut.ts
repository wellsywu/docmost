export interface DocmostSaveShortcutOptions {
  canSave: () => boolean
  save: () => void
}

function isSaveShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey)
    && !event.shiftKey
    && !event.altKey
    && event.key.toLowerCase() === `s`
}

export function registerDocmostSaveShortcut(options: DocmostSaveShortcutOptions): () => void {
  function onKeydown(event: KeyboardEvent) {
    if (!options.canSave() || !isSaveShortcut(event))
      return

    event.preventDefault()
    options.save()
  }

  document.addEventListener(`keydown`, onKeydown, { capture: true })

  return () => document.removeEventListener(`keydown`, onKeydown, { capture: true })
}
