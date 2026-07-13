import { describe, expect, it } from "vitest";
import {
  defaultReadingPreferences,
  readingCodeThemes,
  readingFonts,
  readingSizes,
  readingThemes,
} from "./manifest";
import { getReadingPreferences } from "./reading-preferences";

describe("reading theme manifest", () => {
  it("exposes eight named reading themes", () => {
    expect(readingThemes).toHaveLength(8);
    expect(new Set(readingThemes.map((theme) => theme.id)).size).toBe(
      readingThemes.length,
    );
  });

  it("keeps every default in its supported option list", () => {
    expect(readingThemes.map((theme) => theme.id)).toContain(
      defaultReadingPreferences.theme,
    );
    expect(readingFonts.map((font) => font.id)).toContain(
      defaultReadingPreferences.font,
    );
    expect(readingSizes.map((size) => size.id)).toContain(
      defaultReadingPreferences.size,
    );
    expect(readingCodeThemes.map((theme) => theme.id)).toContain(
      defaultReadingPreferences.codeTheme,
    );
  });

  it("uses defaults when an older user has no reading preferences", () => {
    expect(getReadingPreferences(null)).toEqual(defaultReadingPreferences);
  });

  it("uses defaults when persisted preference values are no longer supported", () => {
    const userWithStalePreference = {
      settings: { preferences: { readingTheme: "retired-theme" } },
    } as never;

    expect(getReadingPreferences(userWithStalePreference)).toEqual(
      defaultReadingPreferences,
    );
  });
});
