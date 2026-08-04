// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerDocmostSaveShortcut } from './save-shortcut'

describe(`registerDocmostSaveShortcut`, () => {
  let unregister: (() => void) | undefined

  afterEach(() => {
    unregister?.()
    unregister = undefined
    document.body.innerHTML = ``
  })

  it.each([
    { modifier: `Ctrl`, init: { ctrlKey: true } },
    { modifier: `Command`, init: { metaKey: true } },
  ])(`handles $modifier+S before the editor can stop propagation`, ({ init }) => {
    const editor = document.createElement(`textarea`)
    editor.addEventListener(`keydown`, event => event.stopPropagation())
    document.body.appendChild(editor)

    const save = vi.fn()
    unregister = registerDocmostSaveShortcut({ canSave: () => true, save })
    const event = new KeyboardEvent(`keydown`, {
      ...init,
      bubbles: true,
      cancelable: true,
      key: `s`,
    })

    editor.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(save).toHaveBeenCalledOnce()
  })

  it.each([
    { key: `s` },
    { key: `s`, ctrlKey: true, shiftKey: true },
    { key: `s`, ctrlKey: true, altKey: true },
    { key: `p`, ctrlKey: true },
  ])(`ignores non-save keyboard input %#`, (init) => {
    const save = vi.fn()
    unregister = registerDocmostSaveShortcut({ canSave: () => true, save })
    const event = new KeyboardEvent(`keydown`, {
      ...init,
      bubbles: true,
      cancelable: true,
    })

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })

  it(`does not intercept the browser shortcut when saving is unavailable`, () => {
    const save = vi.fn()
    unregister = registerDocmostSaveShortcut({ canSave: () => false, save })
    const event = new KeyboardEvent(`keydown`, {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: `s`,
    })

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })
})
