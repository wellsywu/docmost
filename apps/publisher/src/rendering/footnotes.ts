import { escapeHtml } from "../core/html.js";

/**
 * WeChat article bodies only keep anchors that point at WeChat's own domains.
 * Every other href is dropped, leaving readers with text and no way back to the
 * source, so those links become numbered references plus a list at the end.
 */
const WECHAT_NATIVE_HOSTS = new Set(["mp.weixin.qq.com", "weixin.qq.com"]);

export function isWeChatNativeLink(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === "https:" && WECHAT_NATIVE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

interface Footnote {
  index: number;
  label: string;
  href: string;
}

export class FootnoteCollector {
  private readonly byHref = new Map<string, Footnote>();

  /**
   * Returns the inline HTML for one link. `html` is the already rendered link
   * text, `plain` the same text without markup for the reference list.
   */
  reference(href: string, html: string, plain: string): string {
    const target = href.trim();
    if (!target || target.startsWith("#")) return html;
    if (isWeChatNativeLink(target)) {
      return `<a href="${escapeHtml(target)}">${html}</a>`;
    }
    // Autolinks already show their URL; a reference would only duplicate it.
    if (plain.trim() === target) return html;

    const existing = this.byHref.get(target);
    const footnote = existing ?? {
      index: this.byHref.size + 1,
      label: plain.trim() || target,
      href: target,
    };
    if (!existing) this.byHref.set(target, footnote);
    return `${html}<sup class="footnote-ref">[${footnote.index}]</sup>`;
  }

  get entries(): Footnote[] {
    return [...this.byHref.values()].sort((a, b) => a.index - b.index);
  }

  renderSection(): string {
    const entries = this.entries;
    if (entries.length === 0) return "";
    const items = entries
      .map(
        (entry) =>
          `<p class="footnote-item">[${entry.index}] ${escapeHtml(entry.label)}: <span class="footnote-url">${escapeHtml(entry.href)}</span></p>`,
      )
      .join("");
    return `<section class="footnotes"><p class="footnotes-title">参考资料</p>${items}</section>`;
  }
}
