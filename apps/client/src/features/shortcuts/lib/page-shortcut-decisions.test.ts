import { describe, expect, it } from "vitest";
import { PageEditMode } from "@/features/user/types/user.types";
import {
  getEscapeShortcutAction,
  shouldEnterPageEditMode,
} from "./page-shortcut-decisions";

function keyboardEvent(
  init: KeyboardEventInit = {},
  target: Element = document.body,
) {
  const event = new KeyboardEvent("keydown", init);
  Object.defineProperty(event, "target", { value: target });
  return event;
}

describe("page shortcut decisions", () => {
  it("enters edit mode only from an unblocked read state", () => {
    const state = {
      canEdit: true,
      isDeleted: false,
      isBase: false,
      mode: PageEditMode.Read,
      overlayOpen: false,
    };

    expect(
      shouldEnterPageEditMode(keyboardEvent({ code: "KeyE" }), state),
    ).toBe(true);
    expect(
      shouldEnterPageEditMode(
        keyboardEvent({ code: "KeyE" }, document.createElement("button")),
        state,
      ),
    ).toBe(false);
    expect(
      shouldEnterPageEditMode(
        keyboardEvent({ code: "KeyE", repeat: true }),
        state,
      ),
    ).toBe(false);
    expect(
      shouldEnterPageEditMode(keyboardEvent({ code: "KeyE" }), {
        ...state,
        overlayOpen: true,
      }),
    ).toBe(false);
  });

  it("gives find the first Escape and yields to open UI layers", () => {
    const state = {
      canEdit: true,
      isDeleted: false,
      isBase: false,
      mode: PageEditMode.Edit,
      findOpen: false,
      aiMenuOpen: false,
      linkMenuOpen: false,
      overlayOpen: false,
    };

    expect(getEscapeShortcutAction({ ...state, findOpen: true })).toBe(
      "close-find",
    );
    expect(getEscapeShortcutAction({ ...state, aiMenuOpen: true })).toBe(
      "yield",
    );
    expect(getEscapeShortcutAction({ ...state, linkMenuOpen: true })).toBe(
      "yield",
    );
    // An open overlay (Mantine modal/menu, slash/emoji popup) wins over
    // everything else, including an also-open find dialog.
    expect(
      getEscapeShortcutAction({ ...state, findOpen: true, overlayOpen: true }),
    ).toBe("yield");
  });

  it("returns to read mode from a bare editable page regardless of defaultPrevented", () => {
    const state = {
      canEdit: true,
      isDeleted: false,
      isBase: false,
      mode: PageEditMode.Edit,
      findOpen: false,
      aiMenuOpen: false,
      linkMenuOpen: false,
      overlayOpen: false,
    };

    // The decision no longer consults event.defaultPrevented, which ProseMirror
    // sets on every Escape inside the editor. A bare editable page must exit.
    expect(getEscapeShortcutAction(state)).toBe("read");
    expect(getEscapeShortcutAction({ ...state, canEdit: false })).toBe("none");
    expect(getEscapeShortcutAction({ ...state, isDeleted: true })).toBe("none");
    expect(getEscapeShortcutAction({ ...state, isBase: true })).toBe("none");
    expect(getEscapeShortcutAction({ ...state, mode: PageEditMode.Read })).toBe(
      "none",
    );
  });
});
