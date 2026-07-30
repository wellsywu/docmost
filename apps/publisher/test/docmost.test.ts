import assert from "node:assert/strict";
import test from "node:test";
import { DocmostClient } from "../src/docmost/client.js";
import { scanProseMirror } from "../src/docmost/node-scanner.js";
import { baseConfig, pngBytes, svgBytes } from "./helpers.js";

const respondWith = (response: Response) =>
  new DocmostClient(baseConfig, async () => response);

test("node scanner blocks transclusion and unknown nodes without silent loss", () => {
  const warnings = scanProseMirror({
    type: "doc",
    content: [{ type: "transclusion" }, { type: "futureWidget" }],
  });

  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /transclusion/);
  assert.match(warnings[1], /unknown node type/);
});

test("diagram nodes with SVG sources pass while missing sources are blocked", () => {
  const warnings = scanProseMirror({
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
  });

  assert.deepEqual(warnings, []);

  const missing = scanProseMirror({
    type: "doc",
    content: [{ type: "drawio" }, { type: "excalidraw", attrs: { src: " " } }],
  });
  assert.equal(missing.length, 2);
  assert.match(missing[0], /drawio.*no SVG source/);
  assert.match(missing[1], /excalidraw.*no SVG source/);
});

test("nodes the renderer supports are not blocked", () => {
  const warnings = scanProseMirror({
    type: "doc",
    content: [
      { type: "callout", content: [{ type: "paragraph" }] },
      {
        type: "details",
        content: [{ type: "detailsSummary" }, { type: "detailsContent" }],
      },
      { type: "mathBlock" },
      { type: "mathInline" },
    ],
  });

  assert.deepEqual(warnings, []);
});

test("asset normalization keeps credentials on the configured origin only", async () => {
  let observedAuthorization = "";
  const client = new DocmostClient(baseConfig, async (_url, init) => {
    observedAuthorization =
      new Headers(init?.headers).get("authorization") ?? "";
    return new Response(svgBytes, {
      status: 200,
      headers: { "content-type": "image/svg+xml" },
    });
  });

  assert.equal(
    client.normalizeAssetUrl("/api/files/a/diagram.svg").href,
    "https://127.0.0.1:8443/api/files/a/diagram.svg",
  );
  assert.equal(
    client.normalizeAssetUrl("/files/a/diagram.svg").href,
    "https://127.0.0.1:8443/files/a/diagram.svg",
  );

  await client.downloadAsset("/api/files/a/diagram.svg");
  assert.equal(observedAuthorization, `Bearer ${baseConfig.DOCMOST_API_KEY}`);
  await assert.rejects(
    () => client.downloadAsset("http://169.254.169.254/latest/meta-data"),
    /configured Docmost origin/,
  );
});

test("asset downloads reject redirects, invalid MIME, and oversized bodies", async () => {
  await assert.rejects(
    () =>
      respondWith(
        new Response(null, {
          status: 302,
          headers: { location: "https://example.com/image.png" },
        }),
      ).downloadAsset("/api/files/a/redirect.png"),
    /redirects are blocked/,
  );
  await assert.rejects(
    () =>
      respondWith(
        new Response("not an image", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ).downloadAsset("/api/files/a/not-image"),
    /Unsupported Docmost asset MIME type/,
  );
  await assert.rejects(
    () =>
      respondWith(
        new Response(new Uint8Array(baseConfig.DOCMOST_MAX_ASSET_BYTES + 1), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      ).downloadAsset("/api/files/a/large.png"),
    /exceeds configured size limit/,
  );
});

test("asset downloads reject URL credentials before fetching", async () => {
  let fetchCalled = false;
  const client = new DocmostClient(baseConfig, async () => {
    fetchCalled = true;
    return new Response(pngBytes, { headers: { "content-type": "image/png" } });
  });

  await assert.rejects(
    () =>
      client.downloadAsset(
        "https://user:pass@127.0.0.1:8443/api/files/a/cover.png",
      ),
    /Credentials in asset URLs are blocked/,
  );
  assert.equal(fetchCalled, false);
});

test("an oversized content-length is rejected before the body is read", async () => {
  let bodyRead = false;
  const client = new DocmostClient(
    { ...baseConfig, DOCMOST_MAX_ASSET_BYTES: 4 },
    async () =>
      ({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "image/png",
          "content-length": "5",
        }),
        async arrayBuffer() {
          bodyRead = true;
          return pngBytes.buffer;
        },
      }) as Response,
  );

  await assert.rejects(
    () => client.downloadAsset("/api/files/a/too-large.png"),
    /exceeds configured size limit/,
  );
  assert.equal(bodyRead, false);
});

test("a blocked redirect does not expose the redirect target", async () => {
  const target = "https://attacker.example.test/leak.png";
  await assert.rejects(
    () =>
      respondWith(
        new Response(null, { status: 307, headers: { location: target } }),
      ).downloadAsset("/api/files/a/redirect.png"),
    (error: Error) => {
      assert.match(error.message, /redirects are blocked/);
      assert.doesNotMatch(error.message, new RegExp(target));
      return true;
    },
  );
});
