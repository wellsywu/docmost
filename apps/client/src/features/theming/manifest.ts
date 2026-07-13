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

export const readingFonts = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "grotesk", label: "Grotesk" },
] as const;

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
export type ReadingFont = (typeof readingFonts)[number]["id"];
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
