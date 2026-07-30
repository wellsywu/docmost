import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { Rasterizer } from "../src/media/rasterizer.js";
import { MermaidRenderer } from "../src/rendering/mermaid.js";
import {
  baseConfig,
  FakeDocmost,
  pageId,
  publicationHarness,
  publishInput,
  unreachableMermaid,
} from "./helpers.js";

const withCover = "# Stable\n\n![cover](/api/files/a/cover.svg)";

function service(markdown: string[] = [withCover], options = {}) {
  return publicationHarness(new FakeDocmost(markdown, options), {
    mermaid: unreachableMermaid,
  }).service;
}

test("the console and health endpoint expose no credentials", async () => {
  const app = await buildApp(baseConfig, { publication: service() });
  try {
    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), {
      ok: true,
      wechatMode: "mock",
      persistence: "memory",
      templateVersion: baseConfig.PUBLISHER_TEMPLATE_VERSION,
    });

    const page = await app.inject({ method: "GET", url: "/" });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /发布到微信公众号草稿/);
    assert.match(page.body, /\/api\/config\//);
    assert.doesNotMatch(page.body, /dm_test_not_a_secret/);
    assert.doesNotMatch(page.body, /replace_with_real_secret_for_test/);
  } finally {
    await app.close();
  }
});

test("the console prefills from the Docmost header entry point", async () => {
  const app = await buildApp(baseConfig, { publication: service() });
  try {
    const page = await app.inject({ method: "GET", url: "/" });
    assert.match(page.body, /new URLSearchParams\(location\.search\)/);
    assert.match(page.body, /params\.get\('pageId'\)/);
    // The escaping must survive the TypeScript template literal.
    assert.ok(page.body.includes("/^https?:\\/\\//i"));
  } finally {
    await app.close();
  }
});

test("the accounts API returns only sanitized selector metadata", async () => {
  const app = await buildApp(baseConfig, { publication: service() });
  try {
    const response = await app.inject({ method: "GET", url: "/api/accounts" });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().accounts, [
      {
        id: "00000000-0000-7000-8000-000000000001",
        workspaceId: "00000000-0000-7000-8000-000000000002",
        name: "Test account",
        verify: true,
      },
    ]);
    assert.doesNotMatch(
      response.body,
      /appId|appSecret|app_secret|ciphertext|access_token/,
    );
  } finally {
    await app.close();
  }
});

test("saved configuration is returned for console refill", async () => {
  const publication = service();
  await publication.publish({ ...publishInput, author: "Saved author" });
  const app = await buildApp(baseConfig, { publication });
  try {
    const response = await app.inject({
      method: "GET",
      url: `/api/config/${pageId}`,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().config.author, "Saved author");
  } finally {
    await app.close();
  }
});

test("a missing required author is a client error", async () => {
  const app = await buildApp(baseConfig, { publication: service() });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/publications",
      payload: { pageId },
    });
    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("an unknown account is a sanitized not-found response", async () => {
  const app = await buildApp(baseConfig, { publication: service() });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/publications",
      payload: {
        ...publishInput,
        accountId: "00000000-0000-7000-8000-000000000099",
      },
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), {
      error: "WeChatAccountNotFoundError",
      message: "WeChat account is not available",
    });
    assert.doesNotMatch(response.body, /appId|appSecret|ciphertext|access_token/);
  } finally {
    await app.close();
  }
});

test("the access token protects every API route when auth is enabled", async () => {
  const config = {
    ...baseConfig,
    PUBLISHER_AUTH_ENABLED: true,
    PUBLISHER_ACCESS_TOKEN: "publisher-real-access-token-value",
  };
  const app = await buildApp(config, { publication: service() });
  try {
    const denied = await app.inject({
      method: "POST",
      url: "/api/publications",
      payload: publishInput,
    });
    assert.equal(denied.statusCode, 401);

    const wrong = await app.inject({
      method: "GET",
      url: `/api/config/${pageId}`,
      headers: { authorization: "Bearer wrong-edge-token" },
    });
    assert.equal(wrong.statusCode, 401);
    assert.doesNotMatch(wrong.body, /wrong-edge-token/);
    assert.doesNotMatch(wrong.body, /publisher-real-access-token-value/);

    const accepted = await app.inject({
      method: "GET",
      url: `/api/config/${pageId}`,
      headers: { authorization: `Bearer ${config.PUBLISHER_ACCESS_TOKEN}` },
    });
    assert.equal(accepted.statusCode, 200);
  } finally {
    await app.close();
  }
});

test("auth is driven by the flag, not by how the token looks", async () => {
  // A real-looking token with auth switched off must not start rejecting calls.
  const app = await buildApp(
    {
      ...baseConfig,
      PUBLISHER_AUTH_ENABLED: false,
      PUBLISHER_ACCESS_TOKEN: "publisher-real-access-token-value",
    },
    { publication: service() },
  );
  try {
    const response = await app.inject({
      method: "GET",
      url: `/api/config/${pageId}`,
    });
    assert.equal(response.statusCode, 200);
  } finally {
    await app.close();
  }
});

test("blocked publications map to actionable status codes", async () => {
  const unsupported = await buildApp(baseConfig, {
    publication: service(["# Not reached"], {
      document: { type: "doc", content: [{ type: "excalidraw" }] },
    }),
  });
  try {
    const response = await unsupported.inject({
      method: "POST",
      url: "/api/publications",
      payload: publishInput,
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error, "UnsupportedNodeError");
  } finally {
    await unsupported.close();
  }

  const longTitle = await buildApp(baseConfig, {
    publication: service([withCover], { title: "标".repeat(65) }),
  });
  try {
    const response = await longTitle.inject({
      method: "POST",
      url: "/api/publications",
      payload: publishInput,
    });
    assert.equal(response.statusCode, 422);
    assert.equal(response.json().error, "InvalidArticleError");
  } finally {
    await longTitle.close();
  }

  const mermaid = await buildApp(baseConfig, {
    publication: publicationHarness(
      new FakeDocmost(["# Broken\n\n```mermaid\nflowchart TD\nA -->\n```"], {
        document: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 1 } },
            { type: "codeBlock", attrs: { language: "mermaid" } },
          ],
        },
      }),
      {
        mermaid: new MermaidRenderer(new Rasterizer(1024 * 1024)),
      },
    ).service,
  });
  try {
    const response = await mermaid.inject({
      method: "POST",
      url: "/api/publications",
      payload: publishInput,
    });
    assert.equal(response.statusCode, 422);
    assert.equal(response.json().error, "MermaidRenderError");
  } finally {
    await mermaid.close();
  }
});
