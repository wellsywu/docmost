import type { Token, Tokens, TokenizerAndRendererExtension } from "marked";
import { escapeHtml } from "../core/html.js";

/**
 * Docmost's Markdown export shape drives every rule in this file:
 *   callout    -> `:::info\n…\n:::`            (turndown `callout` rule)
 *   details    -> `<details>\n<summary>…`      (turndown `preserveDetail` rule)
 *   mathBlock  -> `$$\n…\n$$`                  (turndown `mathBlock` rule)
 *   mathInline -> `$…$`                        (turndown `mathInline` rule)
 * Without these extensions the markers leak into the article as literal text.
 */

const CALLOUT_VARIANTS = new Set([
  "default",
  "info",
  "note",
  "success",
  "warning",
  "danger",
]);

function calloutVariant(value: string): string {
  const variant = value.trim().toLowerCase();
  return CALLOUT_VARIANTS.has(variant) ? variant : "info";
}

interface CalloutToken extends Tokens.Generic {
  variant: string;
  tokens: Token[];
}

export const calloutExtension: TokenizerAndRendererExtension = {
  name: "callout",
  level: "block",
  start(src: string) {
    return src.match(/^:::/m)?.index;
  },
  tokenizer(src: string) {
    const match =
      /^:::([a-zA-Z]*)[ \t]*\r?\n([\s\S]*?)\r?\n:::[ \t]*(?:\r?\n|$)/.exec(src);
    if (!match) return undefined;
    const token = {
      type: "callout",
      raw: match[0],
      variant: calloutVariant(match[1]),
      tokens: [] as Token[],
    };
    this.lexer.blockTokens(match[2], token.tokens);
    return token;
  },
  renderer(token) {
    const callout = token as CalloutToken;
    return `<section class="callout callout-${callout.variant}">${this.parser.parse(callout.tokens)}</section>`;
  },
};

interface DetailsToken extends Tokens.Generic {
  summaryTokens: Token[];
  tokens: Token[];
}

export const detailsExtension: TokenizerAndRendererExtension = {
  name: "details",
  level: "block",
  start(src: string) {
    return src.match(/^<details>/m)?.index;
  },
  tokenizer(src: string) {
    const match =
      /^<details>[ \t]*\r?\n([\s\S]*?)\r?\n<\/details>[ \t]*(?:\r?\n|$)/.exec(
        src,
      );
    if (!match) return undefined;
    const summaryMatch = /^\s*<summary>([\s\S]*?)<\/summary>[ \t]*\r?\n?/.exec(
      match[1],
    );
    const body = summaryMatch
      ? match[1].slice(summaryMatch[0].length)
      : match[1];
    const token = {
      type: "details",
      raw: match[0],
      summaryTokens: [] as Token[],
      tokens: [] as Token[],
    };
    this.lexer.inlineTokens(
      (summaryMatch?.[1] ?? "").trim(),
      token.summaryTokens,
    );
    this.lexer.blockTokens(body, token.tokens);
    return token;
  },
  renderer(token) {
    const details = token as DetailsToken;
    // WeChat has no collapsible element, so the summary becomes a heading-like
    // line and the body is always visible.
    const summary = this.parser.parseInline(details.summaryTokens) || "详情";
    return `<section class="details"><p class="details-summary">${summary}</p>${this.parser.parse(details.tokens)}</section>`;
  },
};

interface MathToken extends Tokens.Generic {
  formula: string;
}

export const mathBlockExtension: TokenizerAndRendererExtension = {
  name: "mathBlock",
  level: "block",
  start(src: string) {
    return src.match(/^\$\$/m)?.index;
  },
  tokenizer(src: string) {
    const match =
      /^\$\$[ \t]*(?:\r?\n([\s\S]*?)\r?\n|([^\n]*?))\$\$[ \t]*(?:\r?\n|$)/.exec(
        src,
      );
    if (!match) return undefined;
    return {
      type: "mathBlock",
      raw: match[0],
      formula: (match[1] ?? match[2] ?? "").trim(),
    };
  },
  renderer(token) {
    // WeChat cannot typeset formulas; keeping the source readable beats both
    // dropping the node and leaking bare `$$` markers.
    return `<pre class="math"><code>${escapeHtml((token as MathToken).formula)}</code></pre>`;
  },
};

export const mathInlineExtension: TokenizerAndRendererExtension = {
  name: "mathInline",
  level: "inline",
  start(src: string) {
    return src.indexOf("$") === -1 ? undefined : src.indexOf("$");
  },
  tokenizer(src: string) {
    // Requires non-space right after the opening `$` and right before the
    // closing one, so prose such as "$5 and $10" is not treated as a formula.
    const match = /^\$(?![\s$])([^\n$]*[^\s\\$])\$/.exec(src);
    if (!match) return undefined;
    return {
      type: "mathInline",
      raw: match[0],
      formula: match[1],
    };
  },
  renderer(token) {
    return `<code class="math-inline">${escapeHtml((token as MathToken).formula)}</code>`;
  },
};

export const markdownExtensions: TokenizerAndRendererExtension[] = [
  calloutExtension,
  detailsExtension,
  mathBlockExtension,
  mathInlineExtension,
];

/**
 * Fresh instance per call: these patterns are stateful (`g` flag) and are used
 * with both `matchAll` and `replace`.
 */
export function createMermaidFencePattern(): RegExp {
  return /^ {0,3}`{3,}[ \t]*mermaid[^\n]*\r?\n([\s\S]*?)^ {0,3}`{3,}[ \t]*\r?$/gm;
}

const LEGACY_CONFIG_NOTICE =
  "\n\n> publish-config 已废弃，请使用 Publisher 控制台表单。\n\n";

export function stripLegacyPublishConfig(markdown: string): string {
  return markdown.replace(
    /^ {0,3}`{3,}[ \t]*publish-config[^\n]*\r?\n[\s\S]*?^ {0,3}`{3,}[ \t]*\r?$/gim,
    LEGACY_CONFIG_NOTICE,
  );
}
