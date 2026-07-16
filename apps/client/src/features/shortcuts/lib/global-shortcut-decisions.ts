import { PageEditMode } from "@/features/user/types/user.types";
import {
  isComposing,
  isInteractiveTarget,
  isTreeTarget,
} from "./is-typing-target";
import { matchesShortcut, SHORTCUTS } from "./shortcuts";

type BareRootCreateState = {
  spaceId?: string;
  canCreatePage: boolean;
  isPageRoute: boolean;
  allowBareRootCreate: boolean;
  currentPageEditMode: PageEditMode;
  overlayOpen: boolean;
};

export function shouldCreateRootPageWithBareN(
  event: KeyboardEvent,
  state: BareRootCreateState,
): boolean {
  return (
    !event.defaultPrevented &&
    !event.repeat &&
    !isComposing(event) &&
    matchesShortcut(event, SHORTCUTS.createPage.chords[0]) &&
    !isInteractiveTarget(event) &&
    !isTreeTarget(event) &&
    !state.overlayOpen &&
    state.allowBareRootCreate &&
    Boolean(state.spaceId) &&
    state.canCreatePage &&
    (!state.isPageRoute || state.currentPageEditMode !== PageEditMode.Edit)
  );
}
