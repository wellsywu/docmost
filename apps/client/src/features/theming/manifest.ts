export const readingThemes = [
  { id: "default", label: "Default" },
  { id: "sepia", label: "Sepia" },
  { id: "contrast", label: "High contrast" },
  { id: "notion", label: "Notion" },
  { id: "cursor", label: "Cursor" },
  { id: "copilot", label: "Copilot" },
  { id: "tokyo", label: "Tokyo Night" },
  { id: "feishu", label: "Feishu" },
] as const;

// Reading fonts are defined in reading-fonts.ts (their family stacks + bundled
// web fonts live alongside them). Re-exported here so the rest of the app keeps
// a single import surface for reading manifests.
import { readingFontDefs } from "./reading-fonts";
export { readingFontDefs as readingFonts };

export const readingSizes = [
  { id: "compact", label: "Compact" },
  { id: "standard", label: "Standard" },
  { id: "large", label: "Large" },
] as const;

export const readingCodeThemes = [
  { id: "auto", label: "Follow theme" },
  { id: "github", label: "GitHub" },
  { id: "dracula", label: "Dracula" },
  { id: "cursor", label: "Cursor" },
  { id: "copilot", label: "Copilot" },
  { id: "tokyo", label: "Tokyo Night" },
  { id: "notion", label: "Notion" },
  { id: "sepia", label: "Sepia" },
  { id: "contrast", label: "High contrast" },
  { id: "feishu", label: "Feishu" },
] as const;

export type ReadingTheme = (typeof readingThemes)[number]["id"];
export type ReadingFont = (typeof readingFontDefs)[number]["id"];
export type ReadingSize = (typeof readingSizes)[number]["id"];
export type ReadingCodeTheme = (typeof readingCodeThemes)[number]["id"];

export const defaultReadingPreferences = {
  theme: "default",
  font: "sans",
  size: "standard",
  codeTheme: "auto",
} as const satisfies {
  theme: ReadingTheme;
  font: ReadingFont;
  size: ReadingSize;
  codeTheme: ReadingCodeTheme;
};
