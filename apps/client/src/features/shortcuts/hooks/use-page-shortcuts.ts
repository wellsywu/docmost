import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  currentPageEditModeAtom,
  pageEditorAtom,
  showAiMenuAtom,
  showLinkMenuAtom,
} from "@/features/editor/atoms/editor-atoms";
import { searchAndReplaceStateAtom } from "@/features/editor/components/search-and-replace/atoms/search-and-replace-state-atom";
import { PageEditMode } from "@/features/user/types/user.types";
import {
  hasOpenShortcutOverlay,
  isShortcutOverlayTarget,
} from "@/features/shortcuts/lib/shortcut-overlays";
import {
  isComposing,
  isInteractiveTarget,
} from "@/features/shortcuts/lib/is-typing-target";
import {
  getEscapeShortcutAction,
  shouldEnterPageEditMode,
} from "@/features/shortcuts/lib/page-shortcut-decisions";
import { matchesShortcut, SHORTCUTS } from "@/features/shortcuts/lib/shortcuts";

type UsePageShortcutsOptions = {
  canEdit: boolean;
  isDeleted: boolean;
  isBase: boolean;
};

export function usePageShortcuts({
  canEdit,
  isDeleted,
  isBase,
}: UsePageShortcutsOptions) {
  const mode = useAtomValue(currentPageEditModeAtom);
  const setMode = useSetAtom(currentPageEditModeAtom);
  const pageEditor = useAtomValue(pageEditorAtom);
  const findOpen = useAtomValue(searchAndReplaceStateAtom).isOpen;
  const aiMenuOpen = useAtomValue(showAiMenuAtom);
  const linkMenuOpen = useAtomValue(showLinkMenuAtom);

  // Mod+F and E ride the bubble phase: they either don't originate in the
  // editor (E only fires in read mode) or don't clash with ProseMirror.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (matchesShortcut(event, SHORTCUTS.findPage.chords[0])) {
        if (event.defaultPrevented) return;
        event.preventDefault();
        document.dispatchEvent(new CustomEvent("openFindDialogFromEditor"));
        return;
      }

      if (matchesShortcut(event, SHORTCUTS.editPage.chords[0])) {
        if (
          !shouldEnterPageEditMode(event, {
            canEdit,
            isDeleted,
            isBase,
            mode,
            overlayOpen: isShortcutOverlayTarget(event),
          })
        ) {
          return;
        }

        event.preventDefault();
        setMode(PageEditMode.Edit);
        requestAnimationFrame(() => {
          if (!pageEditor?.isDestroyed) pageEditor?.commands.focus();
        });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [canEdit, isBase, isDeleted, mode, pageEditor, setMode]);

  // Escape must be decided in the CAPTURE phase. ProseMirror's view captures
  // Escape and calls preventDefault on it (prosemirror-view captureKeyDown
  // returns true for keyCode 27), and its slash/emoji suggestion popups hide or
  // remove themselves synchronously while handling the same keydown. Running
  // before the editor lets us both read the real overlay state and exit edit
  // mode without being fooled by that always-set defaultPrevented flag.
  useEffect(() => {
    const handleEscapeCapture = (event: KeyboardEvent) => {
      if (!matchesShortcut(event, SHORTCUTS.readPage.chords[0])) return;
      if (isComposing(event)) return;

      const action = getEscapeShortcutAction({
        canEdit,
        isDeleted,
        isBase,
        mode,
        findOpen,
        aiMenuOpen,
        linkMenuOpen,
        overlayOpen: hasOpenShortcutOverlay({ excludePageFind: true }),
      });

      if (action === "close-find") {
        event.preventDefault();
        document.dispatchEvent(new CustomEvent("closeFindDialogFromEditor"));
        return;
      }
      // "yield": an overlay (Mantine modal/menu, slash/emoji popup, AI/link
      // menu) owns this Escape. Do nothing and let it bubble to that handler.
      if (action !== "read") return;

      event.preventDefault();
      setMode(PageEditMode.Read);
      pageEditor?.commands.blur();
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) activeElement.blur();
    };

    document.addEventListener("keydown", handleEscapeCapture, true);
    return () =>
      document.removeEventListener("keydown", handleEscapeCapture, true);
  }, [
    aiMenuOpen,
    canEdit,
    findOpen,
    isBase,
    isDeleted,
    linkMenuOpen,
    mode,
    pageEditor,
    setMode,
  ]);
}
