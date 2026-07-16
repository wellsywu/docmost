import { marked } from "marked";
import { calloutExtension } from "./callout.marked";
import { mathBlockExtension } from "./math-block.marked";
import { mathInlineExtension } from "./math-inline.marked";

marked.use({
  renderer: {
    list({ ordered, start, items }) {
      let body = "";
      for (const item of items) {
        body += this.listitem(item);
      }

      if (ordered) {
        const startAttr = start !== 1 ? ` start="${start}"` : "";
        return `<ol${startAttr}>\n${body}</ol>\n`;
      }

      const isTaskList = items.some((item) => item.task);
      const dataType = isTaskList ? ' data-type="taskList"' : "";
      return `<ul${dataType}>\n${body}</ul>\n`;
    },
    listitem({ tokens, task: isTask, checked: isChecked }) {
      const text = this.parser.parse(tokens);
      if (!isTask) {
        return `<li>${text}</li>\n`;
      }
      const checkedAttr = isChecked
        ? 'data-checked="true"'
        : 'data-checked="false"';
      return `<li data-type="taskItem" ${checkedAttr}>${text}</li>\n`;
    },
    // Drop the markdown column alignment (:---: / ---:). The table cell schema
    // turns an `align` attr into `text-align`, so imported tables would render
    // with mixed left/right/center columns. Default every cell to left; users
    // can still set alignment per-cell via the editor's table menu.
    tablecell({ tokens, header }) {
      const content = this.parser.parseInline(tokens);
      const tag = header ? "th" : "td";
      return `<${tag}>${content}</${tag}>\n`;
    },
  },
});

marked.use({
  extensions: [calloutExtension, mathBlockExtension, mathInlineExtension],
});

marked.setOptions({ breaks: true });

// CommonMark treats CJK characters as "word" characters, so underscore
// emphasis flanked by them (中文__加粗__中文) fails the flanking rules and
// stays literal. Asterisk emphasis has no such limitation, so rewrite
// CJK-adjacent underscore emphasis to asterisks before parsing.
const CJK =
  "\\u2e80-\\u9fff\\u3000-\\u303f\\u3040-\\u30ff\\uac00-\\ud7af\\uff00-\\uffef";

// The content group `[^_]*?[^_\s]` forbids leading underscores, requires a
// non-space final char, and avoids lookbehind (unsupported in Safari < 16.4,
// where a lookbehind literal throws at construction and breaks the bundle).
const CONTENT = "([^_]*?[^_\\s])";

const CJK_EMPHASIS_RULES: [RegExp, string][] = [
  // bold, CJK before / after the delimiter run
  [new RegExp(`([${CJK}])__(?=\\S)${CONTENT}__`, "g"), "$1**$2**"],
  [new RegExp(`__(?=\\S)${CONTENT}__(?=[${CJK}])`, "g"), "**$1**"],
  // italic, CJK before / after
  [new RegExp(`([${CJK}])_(?=\\S)${CONTENT}_`, "g"), "$1*$2*"],
  [new RegExp(`_(?=\\S)${CONTENT}_(?=[${CJK}])`, "g"), "*$1*"],
];

// Fenced blocks and inline code must stay untouched, so `foo__bar` inside
// code is never rewritten. Splitting on a capturing regex keeps the code
// spans at odd indices while prose stays at even indices.
const CODE_SEGMENT = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

function cjkFriendlyEmphasis(markdown: string): string {
  return markdown
    .split(CODE_SEGMENT)
    .map((segment, index) => {
      if (index % 2 === 1) return segment; // code span, leave as-is
      let prose = segment;
      for (const [re, rep] of CJK_EMPHASIS_RULES) prose = prose.replace(re, rep);
      return prose;
    })
    .join("");
}

export function markdownToHtml(
  markdownInput: string,
): string | Promise<string> {
  const YAML_FONT_MATTER_REGEX = /^\s*---[\s\S]*?---\s*/;

  const markdown = cjkFriendlyEmphasis(
    markdownInput.replace(YAML_FONT_MATTER_REGEX, "").trimStart(),
  );

  return marked.parse(markdown).toString();
}
