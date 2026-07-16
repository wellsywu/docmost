import { platformModifierKey, platformModifierLabel } from "@/lib";

export type ShortcutKey =
  | "Mod"
  | "Alt"
  | "Shift"
  | "E"
  | "F"
  | "K"
  | "N"
  | "S"
  | "/"
  | "Escape"
  | "Delete"
  | "Backspace";

export type ShortcutChord = readonly ShortcutKey[];

export type ShortcutDefinition = {
  id: string;
  label: string;
  chords: readonly ShortcutChord[];
};

export const SHORTCUTS = {
  editPage: {
    id: "edit-page",
    label: "Enter edit mode",
    chords: [["E"]],
  },
  readPage: {
    id: "read-page",
    label: "Return to read mode",
    chords: [["Escape"]],
  },
  createPage: {
    id: "create-page",
    label: "Create a page",
    chords: [["N"], ["Mod", "Alt", "N"]],
  },
  createSubpage: {
    id: "create-subpage",
    label: "Create a subpage from the focused page",
    chords: [["N"]],
  },
  deletePage: {
    id: "delete-page",
    label: "Move the focused page to trash",
    chords: [["Delete"], ["Backspace"]],
  },
  search: {
    id: "search",
    label: "Search",
    chords: [["Mod", "K"]],
  },
  help: {
    id: "help",
    label: "Keyboard shortcuts",
    chords: [["Mod", "/"]],
  },
  findPage: {
    id: "find-page",
    label: "Find in page",
    chords: [["Mod", "F"]],
  },
  save: {
    id: "save",
    label: "Confirm auto-save",
    chords: [["Mod", "S"]],
  },
} as const satisfies Record<string, ShortcutDefinition>;

export const SHORTCUT_GROUPS = [
  {
    id: "page",
    label: "Page",
    shortcuts: [
      SHORTCUTS.editPage,
      SHORTCUTS.readPage,
      SHORTCUTS.createPage,
      SHORTCUTS.createSubpage,
      SHORTCUTS.deletePage,
    ],
  },
  {
    id: "navigation",
    label: "Navigation",
    shortcuts: [SHORTCUTS.search, SHORTCUTS.help],
  },
  {
    id: "editor",
    label: "Editor",
    shortcuts: [SHORTCUTS.findPage, SHORTCUTS.save],
  },
] as const;

function matchesKey(event: KeyboardEvent, key: ShortcutKey): boolean {
  if (key === "/") return event.code === "Slash";
  if (key === "Escape") return event.key === "Escape";
  if (key === "Delete" || key === "Backspace") return event.key === key;
  return event.code === `Key${key}`;
}

export function matchesShortcut(
  event: KeyboardEvent,
  chord: ShortcutChord,
): boolean {
  const requiresMod = chord.includes("Mod");
  const requiresAlt = chord.includes("Alt");
  const requiresShift = chord.includes("Shift");
  const key = chord.find(
    (value) => value !== "Mod" && value !== "Alt" && value !== "Shift",
  );

  if (!key) return false;
  if (platformModifierKey(event) !== requiresMod) return false;
  const hasUnexpectedPlatformModifier =
    platformModifierLabel === "⌘" ? event.ctrlKey : event.metaKey;
  if (hasUnexpectedPlatformModifier) return false;
  if (event.altKey !== requiresAlt || event.shiftKey !== requiresShift) {
    return false;
  }

  return matchesKey(event, key);
}
