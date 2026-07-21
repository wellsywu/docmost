import zcoolKuaile from "./fonts/zcool-kuaile-400.woff2";

export type ReadingFontDef = {
  id: string;
  /** i18n key; add it to the locale files (en-US is the base). */
  label: string;
  /** CSS font-family value, applied through the --prose-font custom property. */
  stack: string;
  /** Optional self-hosted web font, emitted as an @font-face. woff2 only. */
  webFont?: {
    family: string;
    /** Bundled asset URL (import the .woff2 so Vite fingerprints it). */
    src: string;
    weight?: string;
    style?: string;
  };
};

const SANS = "var(--mantine-font-family)";

/**
 * Single source of truth for the reading fonts. To add a font:
 *   1. (web font only) drop a `.woff2` in `./fonts` and import it above.
 *   2. add an entry below — `{ id, label, stack, webFont? }`.
 *   3. add the `label` key to the locale files (`en-US` is the base).
 *
 * Everything else is derived from this list: the dropdown options and the
 * `ReadingFont` type (manifest.ts), and the `--prose-font` vars + `@font-face`
 * rules (reading-font-styles.ts). No CSS edits are needed per font.
 *
 * Ordering: system-available families first, web font last as the guaranteed
 * fallback. `sans` resolves to the app font, so it is a no-op default.
 */
export const readingFontDefs = [
  { id: "sans", label: "Sans", stack: SANS },
  {
    id: "serif",
    label: "Serif",
    stack: 'Georgia, "Noto Serif CJK SC", "Songti SC", SimSun, serif',
  },
  {
    id: "kaiti",
    label: "Kaiti",
    stack: '"Kaiti SC", KaiTi, STKaiti, "Kaiti TC", "Songti SC", serif',
  },
  {
    id: "rounded",
    label: "Rounded",
    // "ZCOOL KuaiLe" (站酷快乐体, SIL OFL) is bundled below so 圆体 renders
    // consistently, incl. CJK, even where no system rounded font exists.
    stack:
      '"ZCOOL KuaiLe", "Varela Round", "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Yuanti SC", ' +
      SANS,
    webFont: {
      family: "ZCOOL KuaiLe",
      src: zcoolKuaile,
      weight: "400",
      style: "normal",
    },
  },
  {
    id: "mono",
    label: "Mono",
    stack:
      'ui-monospace, "SF Mono", "Cascadia Code", Consolas, "Noto Sans Mono CJK SC", "Sarasa Mono SC", monospace',
  },
  {
    id: "system",
    label: "System",
    stack:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
] as const satisfies readonly ReadingFontDef[];

export type ReadingFont = (typeof readingFontDefs)[number]["id"];
