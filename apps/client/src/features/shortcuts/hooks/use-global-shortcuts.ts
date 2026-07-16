import { useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useTreeMutation } from "@/features/page/tree/hooks/use-tree-mutation.ts";
import { currentPageEditModeAtom } from "@/features/editor/atoms/editor-atoms.ts";
import { searchSpotlight } from "@/features/search/constants.ts";
import { shortcutsModalOpenAtom } from "../atoms/shortcuts-atoms.ts";
import { isComposing } from "../lib/is-typing-target.ts";
import { hasOpenShortcutOverlay } from "../lib/shortcut-overlays.ts";
import { matchesShortcut, SHORTCUTS } from "../lib/shortcuts.ts";
import { shouldCreateRootPageWithBareN } from "../lib/global-shortcut-decisions.ts";

type UseGlobalShortcutsOptions = {
  spaceId?: string;
  canCreatePage: boolean;
  isPageRoute: boolean;
  allowBareRootCreate: boolean;
};

export function useGlobalShortcuts({
  spaceId,
  canCreatePage,
  isPageRoute,
  allowBareRootCreate,
}: UseGlobalShortcutsOptions) {
  const { t } = useTranslation();
  const setShortcutsModalOpen = useSetAtom(shortcutsModalOpenAtom);
  const currentPageEditMode = useAtomValue(currentPageEditModeAtom);
  const { handleCreate } = useTreeMutation(spaceId ?? "");
  const createInFlightRef = useRef(false);

  useEffect(() => {
    const createRootPage = async () => {
      if (!spaceId || !canCreatePage || createInFlightRef.current) return;
      createInFlightRef.current = true;
      try {
        await handleCreate(null);
      } catch {
        // The page mutation already presents its own error notification.
      } finally {
        createInFlightRef.current = false;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (matchesShortcut(event, SHORTCUTS.save.chords[0])) {
        event.preventDefault();
        if (!event.repeat) {
          notifications.show({ message: t("Changes are saved automatically") });
        }
        return;
      }

      if (matchesShortcut(event, SHORTCUTS.help.chords[0])) {
        event.preventDefault();
        if (!event.repeat) setShortcutsModalOpen(true);
        return;
      }

      if (matchesShortcut(event, SHORTCUTS.search.chords[0])) {
        if (event.defaultPrevented) return;
        event.preventDefault();
        if (!event.repeat) searchSpotlight.open();
        return;
      }

      if (matchesShortcut(event, SHORTCUTS.createPage.chords[1])) {
        if (!spaceId || !canCreatePage || event.repeat || isComposing(event)) {
          return;
        }
        event.preventDefault();
        void createRootPage();
        return;
      }

      if (
        !shouldCreateRootPageWithBareN(event, {
          spaceId,
          canCreatePage,
          isPageRoute,
          allowBareRootCreate,
          currentPageEditMode,
          overlayOpen: hasOpenShortcutOverlay(),
        })
      ) {
        return;
      }

      event.preventDefault();
      void createRootPage();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    canCreatePage,
    allowBareRootCreate,
    currentPageEditMode,
    handleCreate,
    isPageRoute,
    setShortcutsModalOpen,
    spaceId,
    t,
  ]);
}
