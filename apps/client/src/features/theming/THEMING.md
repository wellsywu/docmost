# Reading theming

Reading preferences are applied only to the page editor container. They are
stored in the user's existing `settings.preferences` JSON object and therefore
do not require a database migration.

## Contract

`readingTheme`, `readingFont`, `readingSize`, and `readingCodeTheme` are
optional user preferences. Missing or invalid values resolve to the defaults in
`manifest.ts` so users with older preference payloads keep the existing visual
appearance.

## Rendering boundary

`FullEditor` adds `data-reading-*` attributes to its editor container. The
stylesheet maps those attributes to semantic `--prose-*` CSS variables. Editor
styles consume those variables with the prior Mantine values as fallbacks.

This keeps the global Mantine scheme, comments, navigation, and history views
unchanged while allowing the rendered page and the editor canvas to share a
reading treatment.

## Palette ownership

Each named theme in `reading-themes.css` carries its FULL palette — surface,
text, heading, link, border, quote, table, inline code, code block and `--hljs-*`
syntax colors — so code and headings follow the reading theme. The `default`
theme stays on the bare `[data-reading-theme]` selector and only sets the tokens
needed to reproduce the upstream Mantine look; everything else falls back to the
editor's original values.

`readingCodeTheme` defaults to `auto` (no overlay — code follows the reading
theme). `github` / `dracula` are optional overlays that override only the code
surface and syntax colors on top of the active theme. Both overlays are
scheme-aware through `light-dark()`, so a light app scheme always renders a
light code block and a dark scheme a dark one — Dracula's light branch is its
official Alucard palette. No code option forces a dark block onto a light page.

## Syntax variables

`code.css` maps highlight.js token classes to `--hljs-*` variables. Six base
variables are required per palette (`comment`, `keyword`, `variable`, `string`,
`number`, `title`); the finer-grained ones are optional with fallback chains:

- `--hljs-tag` → `--hljs-keyword` (HTML tags, CSS type selectors)
- `--hljs-attr` → `--hljs-variable` (HTML attrs, JSON keys, CSS ids/classes)
- `--hljs-builtin` → `--hljs-number` (built-ins and types)
- `--hljs-meta` → `--hljs-number` (preprocessor, shebang, decorators)
- `--hljs-function` / `--hljs-class` → `--hljs-title`

Palettes for themes named after real products track their official colors:
`github` ← highlight.js `github(-dark).css`, `dracula` ← draculatheme.com spec
(light = Alucard), `cursor` ← VS Code Dark+/Light+, `tokyo` ← Tokyo Night,
`copilot` ← GitHub Primer, `notion` ← Tomorrow (Night). The hljs values in a
`[data-reading-theme=x]` block and its `[data-reading-code-theme=x]` overlay
must stay identical — the duplication is deliberate (cascade order prevents
sharing one rule with the per-block `.codeBlock[data-code-theme=x]` selector).

## Upstream-friendly changes

- Add new themes in `manifest.ts` and `reading-themes.css`.
- Keep editor CSS changes limited to semantic variable substitution.
- Do not replace upstream class names or global color-scheme handling.
- Preserve fallback values whenever a semantic variable is introduced.
