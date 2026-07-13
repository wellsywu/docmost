import type { IUser } from "@/features/user/types/user.types.ts";
import {
  defaultReadingPreferences,
  readingCodeThemes,
  readingFonts,
  readingSizes,
  readingThemes,
  type ReadingCodeTheme,
  type ReadingFont,
  type ReadingSize,
  type ReadingTheme,
} from "@/features/theming/manifest.ts";

export type ReadingPreferences = {
  theme: ReadingTheme;
  font: ReadingFont;
  size: ReadingSize;
  codeTheme: ReadingCodeTheme;
};

function isSupportedOption<T extends string>(
  value: unknown,
  options: readonly { id: T }[],
): value is T {
  return (
    typeof value === "string" && options.some((option) => option.id === value)
  );
}

export function getReadingPreferences(user: IUser | null): ReadingPreferences {
  const preferences = user?.settings?.preferences;

  return {
    theme: isSupportedOption(preferences?.readingTheme, readingThemes)
      ? preferences.readingTheme
      : defaultReadingPreferences.theme,
    font: isSupportedOption(preferences?.readingFont, readingFonts)
      ? preferences.readingFont
      : defaultReadingPreferences.font,
    size: isSupportedOption(preferences?.readingSize, readingSizes)
      ? preferences.readingSize
      : defaultReadingPreferences.size,
    codeTheme: isSupportedOption(
      preferences?.readingCodeTheme,
      readingCodeThemes,
    )
      ? preferences.readingCodeTheme
      : defaultReadingPreferences.codeTheme,
  };
}

/**
 * The `data-reading-*` attributes that carry the reading theme. Put them on any
 * container whose subtree should share the reading surface — the editor, and
 * the page wrapper so the fixed breadcrumb header inherits `--prose-bg` too.
 */
export function getReadingThemeAttributes(user: IUser | null) {
  const preferences = getReadingPreferences(user);
  return {
    "data-reading-theme": preferences.theme,
    "data-reading-font": preferences.font,
    "data-reading-size": preferences.size,
    "data-reading-code-theme": preferences.codeTheme,
  };
}
