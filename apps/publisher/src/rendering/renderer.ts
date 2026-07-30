import DOMPurify from "isomorphic-dompurify";
import hljs from "highlight.js";
import juice from "juice";
import { Marked } from "marked";
import type { BinaryAsset, RenderedArticle } from "../core/types.js";
import { escapeHtml } from "../core/html.js";
import { sha256 } from "../core/hash.js";
import { FootnoteCollector } from "./footnotes.js";
import {
  createMermaidFencePattern,
  markdownExtensions,
  stripLegacyPublishConfig,
} from "./markdown-blocks.js";
import { TEMPLATE_STYLESHEET } from "./theme.js";

export interface RendererPort {
  render(markdown: string): Promise<RenderedArticle>;
}

export interface MermaidPort {
  render(source: string): Promise<BinaryAsset>;
}

const ALLOWED_TAGS = [
  "section",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "strong",
  "em",
  "del",
  "a",
  "blockquote",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "img",
  "hr",
  "sup",
  "sub",
  "span",
];

const ALLOWED_ATTR = [
  "class",
  "href",
  "src",
  "alt",
  "title",
  "colspan",
  "rowspan",
];

/**
 * Markdown -> WeChat-ready HTML.
 *
 * Behaviour is modelled on doocs/md (footnote links, inlined syntax colours,
 * diagrams as images) but the implementation is our own; see
 * THIRD_PARTY_NOTICES.md.
 */
export class WeChatArticleRenderer implements RendererPort {
  constructor(private readonly mermaidRenderer: MermaidPort) {}

  async render(markdown: string): Promise<RenderedArticle> {
    const generatedAssets = new Map<string, BinaryAsset>();
    const prepared = await this.replaceMermaid(
      stripLegacyPublishConfig(markdown),
      generatedAssets,
    );
    const footnotes = new FootnoteCollector();
    const marked = new Marked({ gfm: true, breaks: false });
    marked.use({
      extensions: markdownExtensions,
      renderer: {
        code(token) {
          const language = token.lang?.trim().split(/\s+/, 1)[0] ?? "";
          const highlighted =
            language && hljs.getLanguage(language)
              ? hljs.highlight(token.text, { language }).value
              : escapeHtml(token.text);
          return `<pre><code class="hljs language-${escapeHtml(language || "text")}">${highlighted}</code></pre>`;
        },
        link(token) {
          const html = token.tokens?.length
            ? this.parser.parseInline(token.tokens)
            : escapeHtml(token.text ?? "");
          return footnotes.reference(token.href ?? "", html, token.text ?? "");
        },
      },
    });
    const body = await marked.parse(prepared);
    const sanitized = DOMPurify.sanitize(
      `<section class="wechat-article">${body}${footnotes.renderSection()}</section>`,
      { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false },
    );
    return {
      html: juice(`<style>${TEMPLATE_STYLESHEET}</style>${sanitized}`, {
        preserveImportant: true,
        inlinePseudoElements: true,
        removeStyleTags: true,
      }),
      generatedAssets,
    };
  }

  private async replaceMermaid(
    markdown: string,
    generatedAssets: Map<string, BinaryAsset>,
  ): Promise<string> {
    const pattern = createMermaidFencePattern();
    let output = "";
    let cursor = 0;
    for (const match of markdown.matchAll(pattern)) {
      const index = match.index ?? 0;
      output += markdown.slice(cursor, index);
      const source = match[1].trim();
      const asset = await this.mermaidRenderer.render(source);
      const url = `https://publisher.invalid/mermaid/${sha256(source)}.png`;
      generatedAssets.set(url, asset);
      output += `![Mermaid diagram](${url})`;
      cursor = index + match[0].length;
    }
    return output + markdown.slice(cursor);
  }
}
