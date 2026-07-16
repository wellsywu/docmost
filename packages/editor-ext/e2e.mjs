import { marked } from "marked";
// mirror the renderer overrides
marked.use({ renderer: {
  tablecell({ tokens, header }) {
    const content = this.parser.parseInline(tokens);
    return `<${header ? "th" : "td"}>${content}</${header ? "th" : "td"}>\n`;
  },
}});
marked.setOptions({ breaks: true });
const md = `| 方案 | 性能 | 定位 |
| :--- | ---: | :---: |
| **A** | 中文__加粗__ | 左 |
`;
const out = marked.parse(md);
console.log(out);
console.log("has align attr:", /align=/.test(out));
