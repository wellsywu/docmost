import { describe, expect, it } from "vitest";
import { platformModifierLabel } from "@/lib";
import { matchesShortcut, SHORTCUTS } from "./shortcuts";
import {
  hasOpenShortcutOverlay,
  isShortcutOverlayTarget,
} from "./shortcut-overlays";
import {
  isComposing,
  isInteractiveTarget,
  isTreeTarget,
  isTypingTarget,
} from "./is-typing-target";

describe("shortcut guards", () => {
  it.each(["input", "textarea", "select"])(
    "treats %s as a typing target",
    (tag) => {
      const element = document.createElement(tag);
      expect(isTypingTarget({ target: element })).toBe(true);
    },
  );

  it("detects descendants of contenteditable and role=textbox", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    editable.append(child);
    document.body.append(editable);

    const textbox = document.createElement("div");
    textbox.setAttribute("role", "textbox");

    expect(isTypingTarget({ target: child })).toBe(true);
    expect(isTypingTarget({ target: textbox })).toBe(true);
  });

  it("detects interactive and tree targets", () => {
    const tree = document.createElement("ul");
    tree.setAttribute("role", "tree");
    const button = document.createElement("button");
    tree.append(button);

    expect(isInteractiveTarget({ target: button })).toBe(true);
    expect(isTreeTarget({ target: button })).toBe(true);
  });

  it("detects native and Safari-style IME composition", () => {
    expect(
      isComposing(new KeyboardEvent("keydown", { isComposing: true })),
    ).toBe(true);
    const event = new KeyboardEvent("keydown");
    Object.defineProperty(event, "keyCode", { value: 229 });
    expect(isComposing(event)).toBe(true);
  });

  it("can exclude the page find dialog from other open overlays", () => {
    const findDialog = document.createElement("div");
    findDialog.setAttribute("role", "dialog");
    findDialog.setAttribute("data-page-find-dialog", "true");
    document.body.append(findDialog);

    expect(hasOpenShortcutOverlay()).toBe(true);
    expect(hasOpenShortcutOverlay({ excludePageFind: true })).toBe(false);

    findDialog.remove();
  });

  it("ignores overlays hidden by an ancestor", () => {
    const hiddenContainer = document.createElement("div");
    hiddenContainer.style.display = "none";
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    hiddenContainer.append(dialog);
    document.body.append(hiddenContainer);

    expect(hasOpenShortcutOverlay()).toBe(false);
    expect(isShortcutOverlayTarget({ target: document.body })).toBe(false);
    expect(isShortcutOverlayTarget({ target: dialog })).toBe(true);

    hiddenContainer.remove();
  });
});

describe("matchesShortcut", () => {
  it("matches physical slash and letter chords", () => {
    const modifier =
      platformModifierLabel === "Ctrl" ? { ctrlKey: true } : { metaKey: true };
    expect(
      matchesShortcut(
        new KeyboardEvent("keydown", { code: "Slash", ...modifier }),
        SHORTCUTS.help.chords[0],
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        new KeyboardEvent("keydown", {
          code: "KeyN",
          altKey: true,
          ...modifier,
        }),
        SHORTCUTS.createPage.chords[1],
      ),
    ).toBe(true);
  });

  it("requires exact modifiers", () => {
    const modifier =
      platformModifierLabel === "Ctrl" ? { ctrlKey: true } : { metaKey: true };
    const otherModifier =
      platformModifierLabel === "Ctrl" ? { metaKey: true } : { ctrlKey: true };
    expect(
      matchesShortcut(
        new KeyboardEvent("keydown", {
          code: "KeyS",
          shiftKey: true,
          ...modifier,
        }),
        SHORTCUTS.save.chords[0],
      ),
    ).toBe(false);
    expect(
      matchesShortcut(
        new KeyboardEvent("keydown", { code: "KeyE", ...otherModifier }),
        SHORTCUTS.editPage.chords[0],
      ),
    ).toBe(false);
    expect(
      matchesShortcut(
        new KeyboardEvent("keydown", {
          code: "KeyS",
          ...modifier,
          ...otherModifier,
        }),
        SHORTCUTS.save.chords[0],
      ),
    ).toBe(false);
  });
});
