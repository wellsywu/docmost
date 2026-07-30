import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publicationKey, sha256 } from "../src/core/hash.js";
import { Rasterizer, isJpeg, isPng } from "../src/media/rasterizer.js";
import { DefaultCoverLoader } from "../src/media/default-cover.js";
import { assertPublishableImage } from "../src/media/wechat-media.js";
import { MockWeChatClient } from "../src/wechat/mock-client.js";
import {
  accountId,
  FakeDocmost,
  baseConfig,
  pageId,
  pngBytes,
  publicationHarness,
  publishInput,
  svgBytes,
  unreachableMermaid,
} from "./helpers.js";

test("SVG rasterization returns a bounded PNG with Chinese text input", async () => {
  const output = await new Rasterizer(1024 * 1024).rasterizeSvg({
    sourceUrl: "/diagram.svg",
    bytes: svgBytes,
    mime: "image/svg+xml",
    transform: "none",
  });

  assert.equal(output.mime, "image/png");
  assert.equal(output.transform, "svg_to_png");
  assert.ok(isPng(output.bytes));
  assert.ok(output.bytes.byteLength < 1024 * 1024);
});

test("oversized SVG output is rerendered at a smaller size", async () => {
  const fullSize = await new Rasterizer(1024 * 1024).rasterizeSvg({
    sourceUrl: "/diagram.svg",
    bytes: svgBytes,
    mime: "image/svg+xml",
    transform: "none",
  });
  const maxBytes = fullSize.bytes.byteLength - 1;
  const constrained = await new Rasterizer(maxBytes).rasterizeSvg({
    sourceUrl: "/diagram.svg",
    bytes: svgBytes,
    mime: "image/svg+xml",
    transform: "none",
  });

  assert.ok(constrained.bytes.byteLength <= maxBytes);
  assert.ok(constrained.bytes.byteLength < fullSize.bytes.byteLength);
});

test("invalid SVG produces an actionable blocking error", async () => {
  await assert.rejects(
    () =>
      new Rasterizer(1024 * 1024).rasterizeSvg({
        sourceUrl: "/api/files/a/broken.drawio.svg",
        bytes: new TextEncoder().encode("<svg><broken>"),
        mime: "image/svg+xml",
        transform: "none",
      }),
    (error: Error) => {
      assert.equal(error.name, "RasterizationError");
      assert.match(error.message, /broken\.drawio\.svg/);
      assert.match(error.message, /栅格化失败/);
      return true;
    },
  );
});

test("drawio and Excalidraw SVGs reach the draft as WeChat image URLs", async () => {
  const markdown = [
    "# Diagrams",
    "",
    "![drawio](/api/files/a/diagram.drawio.svg)",
    "",
    "![excalidraw](/api/files/b/diagram.excalidraw.svg)",
  ].join("\n");
  const document = {
    type: "doc",
    content: [
      {
        type: "drawio",
        attrs: { src: "/api/files/a/diagram.drawio.svg" },
      },
      {
        type: "excalidraw",
        attrs: { src: "/api/files/b/diagram.excalidraw.svg" },
      },
    ],
  };
  const wechat = new MockWeChatClient();
  const { service } = publicationHarness(
    new FakeDocmost([markdown], { document }),
    { wechat, mermaid: unreachableMermaid },
  );

  const job = await service.publish(publishInput);

  assert.equal(job.status, "draft_created");
  assert.equal(
    wechat.calls.filter((call) => call === "media/uploadimg").length,
    1,
  );
  assert.equal(wechat.draftArticles.length, 1);
  const content = wechat.draftArticles[0].content;
  assert.equal(
    [...content.matchAll(/https:\/\/mmbiz\.qpic\.cn\/mock\//g)].length,
    2,
  );
  assert.doesNotMatch(content, /\.drawio\.svg|\.excalidraw\.svg/);
});

test("SVG rasterization failures persist a warning and block all uploads", async () => {
  const markdown = "# Broken\n\n![drawio](/api/files/a/broken.drawio.svg)";
  const wechat = new MockWeChatClient();
  const { service, store } = publicationHarness(
    new FakeDocmost([markdown], {
      document: {
        type: "doc",
        content: [
          {
            type: "drawio",
            attrs: { src: "/api/files/a/broken.drawio.svg" },
          },
        ],
      },
      asset: {
        sourceUrl: "/api/files/a/broken.drawio.svg",
        bytes: new TextEncoder().encode("<svg><broken>"),
        mime: "image/svg+xml",
        transform: "none",
      },
    }),
    { wechat, mermaid: unreachableMermaid },
  );

  await assert.rejects(
    () => service.publish(publishInput),
    (error: Error) => {
      assert.equal(error.name, "RasterizationError");
      return true;
    },
  );

  const key = publicationKey({
    pageId,
    sourceHash: sha256(markdown),
    channel: "wechat",
    accountId,
    templateVersion: baseConfig.PUBLISHER_TEMPLATE_VERSION,
  });
  const job = await store.findJobByKey(key);
  assert.equal(job?.status, "blocked");
  assert.equal(job?.errorCode, "IMAGE_RASTERIZATION_FAILED");
  assert.match(job?.warnings[0] ?? "", /栅格化失败/);
  assert.deepEqual(wechat.calls, []);
});

test("image signature detection distinguishes PNG from JPEG", () => {
  assert.ok(isPng(pngBytes));
  assert.equal(isJpeg(pngBytes), false);
  assert.ok(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])));
});

test("formats WeChat cannot accept are rejected with an actionable message", () => {
  assert.throws(
    () =>
      assertPublishableImage({
        sourceUrl: "https://docmost.test/api/files/a/photo.webp",
        bytes: pngBytes,
        mime: "image/webp",
        transform: "none",
      }),
    (error: Error) => {
      assert.equal(error.name, "UnsupportedImageError");
      assert.match(error.message, /仅支持 JPG\/PNG/);
      assert.match(error.message, /photo\.webp/);
      return true;
    },
  );
});

test("a WebP body image fails before any upload happens", async () => {
  const wechat = new MockWeChatClient();
  const docmost = new FakeDocmost(["# A\n\n![x](/api/files/a/photo.webp)"], {
    asset: {
      sourceUrl: "https://127.0.0.1:8443/api/files/a/photo.webp",
      bytes: pngBytes,
      mime: "image/webp",
      transform: "none",
    },
  });
  const { service } = publicationHarness(docmost, {
    wechat,
    mermaid: unreachableMermaid,
  });

  await assert.rejects(() => service.publish(publishInput), /仅支持 JPG\/PNG/);
  assert.deepEqual(wechat.calls, []);
});

test("the same image is downloaded and uploaded once per article", async () => {
  const wechat = new MockWeChatClient();
  const docmost = new FakeDocmost([
    "# A\n\n![x](/api/files/a/cover.svg)\n\n![x again](/api/files/a/cover.svg)",
  ]);
  const { service } = publicationHarness(docmost, {
    wechat,
    mermaid: unreachableMermaid,
  });

  await service.publish(publishInput);

  assert.equal(docmost.downloads.length, 1);
  assert.equal(
    wechat.calls.filter((call) => call === "media/uploadimg").length,
    1,
  );
});

test("a text-only article fails with guidance when no default cover is set", async () => {
  const docmost = new FakeDocmost(["# 只有文字，没有图片"], {
    document: { type: "doc", content: [{ type: "paragraph" }] },
  });
  const { service } = publicationHarness(docmost, {
    mermaid: unreachableMermaid,
  });

  await assert.rejects(
    () => service.publish(publishInput),
    (error: Error) => {
      assert.equal(error.name, "MissingCoverError");
      assert.match(error.message, /PUBLISHER_DEFAULT_COVER_PATH/);
      return true;
    },
  );
});

test("a configured default cover makes text-only articles publishable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "publisher-cover-"));
  const coverPath = join(directory, "cover.png");
  await writeFile(coverPath, pngBytes);

  const wechat = new MockWeChatClient();
  const docmost = new FakeDocmost(["# 只有文字，没有图片"], {
    document: { type: "doc", content: [{ type: "paragraph" }] },
  });
  const { service } = publicationHarness(docmost, {
    wechat,
    mermaid: unreachableMermaid,
    defaultCoverPath: coverPath,
  });

  const job = await service.publish(publishInput);

  assert.equal(job.status, "draft_created");
  assert.equal(
    wechat.calls.filter((call) => call === "material/add_material").length,
    1,
  );
});

test("a default cover that is not PNG or JPEG is rejected", async () => {
  const directory = await mkdtemp(join(tmpdir(), "publisher-cover-"));
  const coverPath = join(directory, "cover.png");
  await writeFile(coverPath, "not an image");

  await assert.rejects(
    () => new DefaultCoverLoader(coverPath).load(),
    /必须指向 PNG 或 JPEG 文件/,
  );
});
