import assert from "node:assert/strict";
import test from "node:test";
import { Rasterizer, isPng } from "../src/media/rasterizer.js";
import { MermaidRenderer } from "../src/rendering/mermaid.js";
import { WeChatArticleRenderer } from "../src/rendering/renderer.js";
import { TEMPLATE_ID } from "../src/rendering/theme.js";
import { unreachableMermaid } from "./helpers.js";

function renderer(mermaid = unreachableMermaid): WeChatArticleRenderer {
  return new WeChatArticleRenderer(mermaid);
}

test("external links become numbered references with a reference list", async () => {
  const { html } = await renderer().render(
    "看[官网](https://example.com/docs)说明。",
  );

  assert.doesNotMatch(html, /<a /);
  assert.match(html, /官网<sup[^>]*>\[1\]<\/sup>/);
  assert.match(html, /参考资料/);
  assert.match(html, /\[1\] 官网: <span[^>]*>https:\/\/example\.com\/docs/);
});

test("repeated links share one reference number", async () => {
  const { html } = await renderer().render(
    "[A](https://example.com/a) 与 [B](https://example.com/b) 与 [A 再次](https://example.com/a)",
  );

  assert.match(html, /\[1\] A:/);
  assert.match(html, /\[2\] B:/);
  assert.equal([...html.matchAll(/class="footnote-item"/g)].length, 2);
});

test("WeChat's own links stay clickable and bare URLs get no reference", async () => {
  const native = await renderer().render(
    "[往期](https://mp.weixin.qq.com/s/abc)",
  );
  assert.match(native.html, /<a href="https:\/\/mp\.weixin\.qq\.com\/s\/abc"/);
  assert.doesNotMatch(native.html, /参考资料/);

  const bare = await renderer().render("https://example.com/plain");
  assert.doesNotMatch(bare.html, /参考资料/);
});

test("syntax highlighting is inlined so WeChat keeps the colours", async () => {
  const { html } = await renderer().render("```ts\nconst a: number = 1;\n```");

  assert.match(html, /class="hljs-keyword"/);
  // Every highlight span must carry an inline colour; class rules are stripped
  // by WeChat.
  for (const span of html.matchAll(/<span class="hljs-[a-z_]+"[^>]*>/g)) {
    assert.match(span[0], /style="[^"]*color:/);
  }
});

test("Mermaid fences become images while other code blocks stay code", async () => {
  const mermaid = new MermaidRenderer(new Rasterizer(1024 * 1024));
  const result = await renderer(mermaid).render(
    "```mermaid\nsequenceDiagram\nA->>B: 你好\n```\n\n```ts\nconst value = 1\n```",
  );

  assert.equal(result.generatedAssets.size, 1);
  assert.ok(isPng([...result.generatedAssets.values()][0].bytes));
  assert.match(result.html, /<img/);
  assert.match(result.html, /language-ts/);
  assert.doesNotMatch(result.html, /sequenceDiagram/);
});

test("an inline mermaid mention is not treated as a diagram fence", async () => {
  const { html } = await renderer().render("语法见 ```mermaid``` 一节。");
  assert.match(html, /mermaid/);
});

test("callout markers render as styled blocks instead of literal text", async () => {
  const { html } = await renderer().render(
    ":::warning\n注意 **加粗**\n:::\n\n后续段落",
  );

  assert.match(html, /class="callout callout-warning"/);
  assert.match(html, /<strong/);
  assert.doesNotMatch(html, /:::/);
});

test("unknown callout variants fall back to info", async () => {
  const { html } = await renderer().render(":::mystery\n内容\n:::");
  assert.match(html, /callout-info/);
});

test("details blocks keep their summary and rendered body", async () => {
  const { html } = await renderer().render(
    "<details>\n<summary>展开标题</summary>\n\n折叠内的 **正文** 与 [链接](https://a.example)\n\n</details>",
  );

  assert.match(html, /class="details-summary"[^>]*>展开标题/);
  assert.match(html, /<strong/);
  assert.match(html, /参考资料/);
  assert.doesNotMatch(html, /&lt;details&gt;|<details>|<\/summary>/);
});

test("math nodes render as readable code instead of leaking $ markers", async () => {
  const block = await renderer().render("$$\nE = mc^2\n$$");
  assert.match(block.html, /class="math"/);
  assert.match(block.html, /E = mc\^2/);
  assert.doesNotMatch(block.html, /\$\$/);

  const inline = await renderer().render("质能方程 $E=mc^2$ 很有名。");
  assert.match(inline.html, /class="math-inline"/);
  assert.doesNotMatch(inline.html, /\$/);
});

test("currency amounts are not mistaken for inline math", async () => {
  const { html } = await renderer().render("价格 $5 和 $10 元。");
  assert.doesNotMatch(html, /math-inline/);
});

test("legacy publish-config fences are replaced without leaking their content", async () => {
  const lower = await renderer().render(
    "```publish-config\nauthor: should-not-leak\nsecret: should-not-leak\n```\n\n# Article",
  );
  assert.doesNotMatch(lower.html, /should-not-leak/);
  assert.match(lower.html, /publish-config/);
  assert.match(lower.html, /Article/);

  const upper = await renderer().render(
    "```PUBLISH-CONFIG yaml\r\nauthor: should-not-leak\r\nsecret: should-not-leak\r\n```\r\n\r\n# Article",
  );
  assert.doesNotMatch(upper.html, /should-not-leak/);
  assert.match(upper.html, /Article/);
});

test("raw HTML in the source cannot reach the draft", async () => {
  const { html } = await renderer().render(
    '<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">',
  );
  assert.doesNotMatch(html, /script|onerror/i);
});

test("template id changes with the stylesheet and is stable in shape", () => {
  assert.match(TEMPLATE_ID, /^wechat-r\d+-[0-9a-f]{12}$/);
});

test("Mermaid renders concurrently without corrupting global state", async () => {
  const mermaid = new MermaidRenderer(new Rasterizer(1024 * 1024));
  const [first, second] = await Promise.all([
    mermaid.render("flowchart TD\nA[开始] --> B[结束]"),
    mermaid.render("flowchart LR\nC[左] --> D[右]"),
  ]);

  assert.ok(isPng(first.bytes));
  assert.ok(isPng(second.bytes));
  // The JSDOM globals must not survive a render in a long-lived server.
  assert.equal(
    typeof (globalThis as Record<string, unknown>).document,
    "undefined",
  );
  assert.equal(
    typeof (globalThis as Record<string, unknown>).window,
    "undefined",
  );
});

test("Mermaid syntax errors block the publication", async () => {
  const mermaid = new MermaidRenderer(new Rasterizer(1024 * 1024));
  await assert.rejects(
    () => mermaid.render("flowchart TD\nA -->"),
    (error: Error) => {
      assert.equal(error.name, "MermaidRenderError");
      assert.match(
        error.message,
        /Check the syntax inside the fenced mermaid block/,
      );
      return true;
    },
  );
});
