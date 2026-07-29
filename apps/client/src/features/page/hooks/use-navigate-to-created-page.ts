import { useCallback } from "react";
import { useSetAtom } from "jotai";
import { type To, useNavigate } from "react-router-dom";

import { currentPageEditModeAtom } from "@/features/editor/atoms/editor-atoms.ts";
import { PageEditMode } from "@/features/user/types/user.types.ts";

export const createdPageNavigationState = {
  openInEditMode: true,
} as const;

export function isCreatedPageNavigationState(
  state: unknown,
): state is typeof createdPageNavigationState {
  return (
    typeof state === "object" &&
    state !== null &&
    "openInEditMode" in state &&
    state.openInEditMode === true
  );
}

export function useNavigateToCreatedPage() {
  const navigate = useNavigate();
  const setPageEditMode = useSetAtom(currentPageEditModeAtom);

  return useCallback(
    (to: To) => {
      setPageEditMode(PageEditMode.Edit);
      navigate(to, { state: createdPageNavigationState });
    },
    [navigate, setPageEditMode],
  );
}
