import { PageEditMode } from "@/features/user/types/user.types";
import { isComposing, isInteractiveTarget } from "./is-typing-target";

type PageShortcutState = {
  canEdit: boolean;
  isDeleted: boolean;
  isBase: boolean;
  mode: PageEditMode;
};

type EscapeShortcutState = PageShortcutState & {
  findOpen: boolean;
  aiMenuOpen: boolean;
  linkMenuOpen: boolean;
  overlayOpen: boolean;
};

export type EscapeShortcutAction = "close-find" | "yield" | "read" | "none";

export function shouldEnterPageEditMode(
  event: KeyboardEvent,
  state: PageShortcutState & { overlayOpen: boolean },
): boolean {
  return (
    state.canEdit &&
    !state.isDeleted &&
    !state.isBase &&
    state.mode === PageEditMode.Read &&
    !event.defaultPrevented &&
    !event.repeat &&
    !isComposing(event) &&
    !isInteractiveTarget(event) &&
    !state.overlayOpen
  );
}

// Deliberately NOT keyed on `event.defaultPrevented`: ProseMirror's view
// captures Escape (prosemirror-view captureKeyDown returns true for keyCode 27)
// and calls preventDefault on every Escape while the editor is focused. So
// `defaultPrevented` is always true inside the editor and cannot be used to
// tell "an overlay handled Escape" apart from "plain Escape in the editor".
// Callers must instead run this in the capture phase (before ProseMirror hides
// its slash/emoji popups) and pass an authoritative `overlayOpen`.
export function getEscapeShortcutAction(
  state: EscapeShortcutState,
): EscapeShortcutAction {
  if (state.overlayOpen) return "yield";
  if (state.findOpen) return "close-find";
  if (state.aiMenuOpen || state.linkMenuOpen) return "yield";
  if (
    state.canEdit &&
    !state.isDeleted &&
    !state.isBase &&
    state.mode === PageEditMode.Edit
  ) {
    return "read";
  }
  return "none";
}
