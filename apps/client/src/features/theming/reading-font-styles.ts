import { readingFontDefs, type ReadingFontDef } from "./reading-fonts";

// `as const` narrows each entry to a literal whose union drops the optional
// `webFont` key; widen back to the interface so it is uniformly accessible.
const fonts: readonly ReadingFontDef[] = readingFontDefs;

/**
 * CSS derived from the font registry: an `@font-face` per bundled web font plus
 * a `--prose-font` custom property per font, keyed on `[data-reading-font]`.
 * The consuming rules (`html[data-reading-font] body`, `.ProseMirror`) live in
 * the static stylesheets; only the per-font values are generated here so adding
 * a font stays a one-place change in reading-fonts.ts.
 */
export function buildReadingFontCss(): string {
  const faces = fonts
    .filter((font) => font.webFont)
    .map((font) => {
      const { family, src, weight = "400", style = "normal" } = font.webFont!;
      return `@font-face{font-family:"${family}";src:url("${src}") format("woff2");font-weight:${weight};font-style:${style};font-display:swap;}`;
    });

  const vars = fonts.map(
    (font) => `[data-reading-font="${font.id}"]{--prose-font:${font.stack};}`,
  );

  return [...faces, ...vars].join("\n");
}

let injected = false;

/**
 * Inject the generated font stylesheet once, at app start (before render), so
 * the `--prose-font` vars and web fonts are available app-wide — matching the
 * `data-reading-font` attribute carried on <html>.
 */
export function injectReadingFontStyles(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;

  const style = document.createElement("style");
  style.setAttribute("data-reading-fonts", "");
  style.textContent = buildReadingFontCss();
  document.head.appendChild(style);
}
