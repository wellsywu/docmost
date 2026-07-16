import { afterEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { usePageShortcuts } from "./use-page-shortcuts";
import { currentPageEditModeAtom } from "@/features/editor/atoms/editor-atoms";
import { searchAndReplaceStateAtom } from "@/features/editor/components/search-and-replace/atoms/search-and-replace-state-atom";
import { PageEditMode } from "@/features/user/types/user.types";

function Harness() {
  usePageShortcuts({ canEdit: true, isDeleted: false, isBase: false });
  return null;
}

function mount(store: ReturnType<typeof createStore>) {
  return render(
    <Provider store={store}>
      <Harness />
    </Provider>,
  );
}

function pressEscape(target: EventTarget = document.body) {
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    keyCode: 27,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "target", { value: target });
  act(() => {
    (target as EventTarget).dispatchEvent(event);
  });
  return event;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("usePageShortcuts – Escape exits edit mode", () => {
  it("exits to read even when the editor preventDefaults Escape", () => {
    const store = createStore();
    store.set(currentPageEditModeAtom, PageEditMode.Edit);
    mount(store);

    // Mimic ProseMirror: a bubble-phase handler on the editor that captures
    // Escape and calls preventDefault. Our capture-phase handler runs first.
    const editor = document.createElement("div");
    editor.className = "ProseMirror";
    editor.setAttribute("contenteditable", "true");
    document.body.appendChild(editor);
    editor.addEventListener("keydown", (e) => {
      if (e.key === "Escape") e.preventDefault();
    });

    pressEscape(editor);

    expect(store.get(currentPageEditModeAtom)).toBe(PageEditMode.Read);
  });

  it("yields (stays in edit mode) when a Mantine overlay is open", () => {
    const store = createStore();
    store.set(currentPageEditModeAtom, PageEditMode.Edit);
    mount(store);

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);

    pressEscape(dialog);

    expect(store.get(currentPageEditModeAtom)).toBe(PageEditMode.Edit);
  });

  it("closes the find dialog first instead of exiting", () => {
    const store = createStore();
    store.set(currentPageEditModeAtom, PageEditMode.Edit);
    store.set(searchAndReplaceStateAtom, { isOpen: true });
    mount(store);

    let closed = false;
    document.addEventListener("closeFindDialogFromEditor", () => {
      closed = true;
    });

    pressEscape();

    expect(closed).toBe(true);
    expect(store.get(currentPageEditModeAtom)).toBe(PageEditMode.Edit);
  });
});
