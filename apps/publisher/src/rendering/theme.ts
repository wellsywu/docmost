import { sha256 } from "../core/hash.js";

/**
 * Bump this whenever the rendered HTML shape changes in a way that should
 * invalidate previously created drafts. It feeds TEMPLATE_ID together with the
 * stylesheets below, so a pure CSS change also produces a new template id.
 */
const TEMPLATE_REVISION = "3";

const PRIMARY = "#0f766e";

/**
 * WeChat strips <style> blocks and class based rules from article bodies, so
 * every rule here must survive juice inlining. Only selectors that juice can
 * resolve to an element (no pseudo classes, no media queries) are useful.
 */
export const ARTICLE_CSS = `
  .wechat-article { color:#1f2937; font-size:16px; line-height:1.8; word-break:break-word; }
  .wechat-article h1 { margin:1.4em 0 .8em; color:${PRIMARY}; font-size:26px; line-height:1.35; }
  .wechat-article h2 { margin:1.35em 0 .7em; padding-left:10px; border-left:4px solid ${PRIMARY}; color:#111827; font-size:22px; }
  .wechat-article h3 { margin:1.2em 0 .6em; color:${PRIMARY}; font-size:19px; }
  .wechat-article h4,.wechat-article h5,.wechat-article h6 { margin:1.1em 0 .5em; color:#111827; font-size:17px; }
  .wechat-article p { margin:.8em 0; }
  .wechat-article a { color:${PRIMARY}; text-decoration:none; border-bottom:1px solid #99f6e4; }
  .wechat-article blockquote { margin:1em 0; padding:10px 14px; color:#475569; background:#f0fdfa; border-left:4px solid #5eead4; }
  .wechat-article pre { margin:1em 0; padding:14px; overflow:auto; color:#e5e7eb; background:#111827; border-radius:6px; }
  .wechat-article code { font-family:Consolas,Menlo,monospace; font-size:14px; }
  .wechat-article :not(pre)>code { padding:2px 5px; color:#c2410c; background:#fff7ed; border-radius:3px; }
  .wechat-article table { width:100%; margin:1em 0; border-collapse:collapse; font-size:14px; }
  .wechat-article th,.wechat-article td { padding:8px; border:1px solid #d1d5db; }
  .wechat-article th { background:#f0fdfa; }
  .wechat-article img { display:block; max-width:100%; height:auto; margin:16px auto; }
  .wechat-article ul,.wechat-article ol { margin:.7em 0; padding-left:1.5em; }
  .wechat-article hr { margin:1.6em 0; border:0; border-top:1px solid #d1d5db; }
  .wechat-article .callout { margin:1em 0; padding:12px 14px; border-radius:6px; border-left:4px solid #94a3b8; background:#f8fafc; }
  .wechat-article .callout-info { border-left-color:#0ea5e9; background:#f0f9ff; }
  .wechat-article .callout-note { border-left-color:#6366f1; background:#eef2ff; }
  .wechat-article .callout-success { border-left-color:#16a34a; background:#f0fdf4; }
  .wechat-article .callout-warning { border-left-color:#f59e0b; background:#fffbeb; }
  .wechat-article .callout-danger { border-left-color:#dc2626; background:#fef2f2; }
  .wechat-article .details { margin:1em 0; padding:12px 14px; border:1px solid #d1d5db; border-radius:6px; background:#f9fafb; }
  .wechat-article .details-summary { margin:0 0 .5em; color:#111827; font-weight:700; }
  .wechat-article .math { color:#334155; background:#f8fafc; }
  .wechat-article .math-inline { padding:2px 5px; color:#334155; background:#f1f5f9; border-radius:3px; }
  .wechat-article .footnote-ref { color:${PRIMARY}; font-size:12px; }
  .wechat-article .footnotes { margin:2em 0 0; padding-top:12px; border-top:1px solid #d1d5db; }
  .wechat-article .footnotes-title { margin:0 0 .6em; color:#111827; font-size:15px; font-weight:700; }
  .wechat-article .footnote-item { margin:.35em 0; color:#64748b; font-size:13px; line-height:1.6; word-break:break-all; }
  .wechat-article .footnote-url { color:#475569; }
`;

/**
 * Syntax colours must be inlined as well, otherwise highlight.js emits spans
 * that WeChat renders as plain monochrome text. Palette follows github-dark so
 * it reads well on the dark <pre> background above.
 */
export const HLJS_CSS = `
  .wechat-article .hljs-comment,.wechat-article .hljs-quote { color:#8b949e; font-style:italic; }
  .wechat-article .hljs-keyword,.wechat-article .hljs-selector-tag,.wechat-article .hljs-doctag,.wechat-article .hljs-tag,.wechat-article .hljs-name,.wechat-article .hljs-deletion { color:#ff7b72; }
  .wechat-article .hljs-string,.wechat-article .hljs-regexp,.wechat-article .hljs-addition,.wechat-article .hljs-meta-string { color:#a5d6ff; }
  .wechat-article .hljs-number,.wechat-article .hljs-literal,.wechat-article .hljs-built_in,.wechat-article .hljs-type,.wechat-article .hljs-symbol,.wechat-article .hljs-bullet { color:#79c0ff; }
  .wechat-article .hljs-title,.wechat-article .hljs-section,.wechat-article .hljs-class,.wechat-article .hljs-function { color:#d2a8ff; }
  .wechat-article .hljs-attr,.wechat-article .hljs-attribute,.wechat-article .hljs-variable,.wechat-article .hljs-template-variable,.wechat-article .hljs-params,.wechat-article .hljs-property { color:#ffa657; }
  .wechat-article .hljs-selector-class,.wechat-article .hljs-selector-id,.wechat-article .hljs-selector-attr,.wechat-article .hljs-selector-pseudo { color:#7ee787; }
  .wechat-article .hljs-meta,.wechat-article .hljs-subst,.wechat-article .hljs-punctuation,.wechat-article .hljs-operator { color:#c9d1d9; }
  .wechat-article .hljs-emphasis { font-style:italic; }
  .wechat-article .hljs-strong { font-weight:700; }
`;

export const TEMPLATE_STYLESHEET = `${ARTICLE_CSS}${HLJS_CSS}`;

/**
 * Participates in the publication idempotency key, so a template change makes
 * previously created drafts stale instead of silently reusing them.
 */
export const TEMPLATE_ID = `wechat-r${TEMPLATE_REVISION}-${sha256(
  TEMPLATE_STYLESHEET,
).slice(0, 12)}`;
