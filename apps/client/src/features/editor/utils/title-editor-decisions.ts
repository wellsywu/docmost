import type { Editor } from "@tiptap/core";

/**
 * Two guards that decide whether the title editor may be written to from the
 * outside. Both exist because the title editor is the one editor in the app
 * that gets driven by React props and timers as well as by the user, and both
 * of those paths used to move the caret out from under whoever was typing.
 *
 * Kept as pure predicates (see `features/shortcuts/lib/*-decisions.ts`) so the
 * policy can be tested without standing up the whole component.
 */

/** The slice of a Tiptap editor these decisions read. */
export interface TitleEditorState {
  isInitialized: boolean;
  isDestroyed: boolean;
  isEditable: boolean;
  isFocused: boolean;
  /** `editor.view.composing` — an IME composition is open. */
  isComposing: boolean;
  /** `editor.getText()`. */
  text: string;
}

/**
 * Whether nothing in the document has claimed focus yet.
 *
 * `document.activeElement` is `<body>` (or, in some engines, `<html>`) while no
 * element is focused; anything else means the user — or another component —
 * already put the caret somewhere.
 */
function isFocusUnclaimed(activeElement: Element | null): boolean {
  if (!activeElement) return true;
  const doc = activeElement.ownerDocument;
  return activeElement === doc.body || activeElement === doc.documentElement;
}

/**
 * Whether the "focus the title after mount" timer may still take the caret.
 *
 * The timer fires 300ms after mount so the editor has settled, but by then the
 * user may have clicked into the body, clicked a specific spot in the title, or
 * started typing through an IME. Focusing anyway yanks the caret to the end of
 * the title mid-keystroke — and an interrupted IME composition loses the
 * characters outright.
 */
export function shouldAutoFocusTitle(
  editor: TitleEditorState,
  activeElement: Element | null,
): boolean {
  if (!editor.isInitialized || editor.isDestroyed) return false;
  if (!editor.isEditable) return false;
  if (editor.isComposing) return false;
  return isFocusUnclaimed(activeElement);
}

/**
 * Whether an incoming `title` prop may be written into the editor.
 *
 * The prop comes from the page query cache, which is also written by websocket
 * echoes from other tabs and other users — so it can be *behind* what is being
 * typed right now. Writing it back means `setContent`, which replaces the whole
 * document (`tr.replaceWith(0, doc.content.size, …)`): the caret resets and the
 * in-flight characters are dropped. A title the user is actively editing is
 * therefore left alone; their own debounced save pushes the local value out.
 *
 * An untitled page arrives as `null` while the editor reports `""`; treating
 * them as equal keeps the effect from rewriting the document on every mount.
 */
export function shouldSyncTitleFromProp(
  editor: TitleEditorState,
  title: string | null | undefined,
): boolean {
  if (!editor.isInitialized || editor.isDestroyed) return false;
  if ((title ?? "") === editor.text) return false;
  return !editor.isFocused && !editor.isComposing;
}

/**
 * Snapshot the live editor into the shape the decisions above read.
 *
 * Everything past `isInitialized` goes through `editor.view`, which throws
 * before the view exists ("Cannot access view['hasFocus']"), so an editor that
 * is not ready reports a state both decisions reject.
 */
export function readTitleEditorState(editor: Editor): TitleEditorState {
  const ready = editor.isInitialized === true && !editor.isDestroyed;
  return {
    isInitialized: ready,
    isDestroyed: editor.isDestroyed,
    isEditable: ready ? editor.isEditable : false,
    isFocused: ready ? editor.isFocused : false,
    isComposing: ready ? editor.view.composing === true : false,
    text: ready ? editor.getText() : "",
  };
}
