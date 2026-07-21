import { useEffect } from "react";
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

/**
 * Mirror the reading preferences onto <html> so the whole app UI — sidebar,
 * top bar, menus and portaled overlays (modals/dropdowns render under <body>) —
 * follows the chosen reading theme and font, not just the article. The reading
 * theme repaints the app-level Mantine tokens and the font is applied to <body>
 * via CSS keyed on these root attributes (see reading-themes.css). The `default`
 * theme/`sans` font resolve to the stock tokens, so they are a no-op.
 */
export function useApplyReadingPreferencesToRoot(user: IUser | null) {
  const { theme, font, size, codeTheme } = getReadingPreferences(user);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-reading-theme", theme);
    root.setAttribute("data-reading-font", font);
    root.setAttribute("data-reading-size", size);
    root.setAttribute("data-reading-code-theme", codeTheme);
  }, [theme, font, size, codeTheme]);
}
