import assert from "node:assert/strict";
import test from "node:test";
import { publicationKey, sha256 } from "../src/core/hash.js";
import { UnsupportedNodeError } from "../src/docmost/node-scanner.js";
import { Rasterizer } from "../src/media/rasterizer.js";
import { SourceChangedError } from "../src/publication/service.js";
import { WeChatAccountNotFoundError } from "../src/core/errors.js";
import { MermaidRenderer } from "../src/rendering/mermaid.js";
import { MockWeChatClient } from "../src/wechat/mock-client.js";
import {
  accountId,
  baseConfig,
  FakeDocmost,
  pageId,
  publicationHarness,
  publishInput,
  testAccount,
  unreachableMermaid,
} from "./helpers.js";

const withCover = "# Article\n\n![cover](/api/files/a/cover.svg)";

function harness(markdown: string[], options = {}) {
  const wechat = new MockWeChatClient();
  return {
    ...publicationHarness(new FakeDocmost(markdown, options), {
      wechat,
      mermaid: unreachableMermaid,
    }),
    wechat,
  };
}

test("idempotency key depends on body hash and excludes updatedAt", () => {
  const base = {
    pageId,
    sourceHash: sha256("body"),
    channel: "wechat",
    accountId,
    templateVersion: "v1",
  };

  assert.equal(publicationKey(base), publicationKey({ ...base }));
  assert.notEqual(
    publicationKey(base),
    publicationKey({ ...base, sourceHash: sha256("changed") }),
  );
  assert.notEqual(
    publicationKey(base),
    publicationKey({ ...base, templateVersion: "v2" }),
  );
  assert.notEqual(
    publicationKey(base),
    publicationKey({
      ...base,
      accountId: "00000000-0000-7000-8000-000000000003",
    }),
  );
});

test("different accounts publish concurrently through request-scoped clients", async () => {
  const secondAccount = {
    ...testAccount,
    id: "00000000-0000-7000-8000-000000000003",
    name: "Second account",
    appId: "wx_second_account",
  };
  const clients = new Map([
    [testAccount.id, new MockWeChatClient()],
    [secondAccount.id, new MockWeChatClient()],
  ]);
  const { service } = publicationHarness(
    new FakeDocmost([withCover, withCover, withCover, withCover]),
    {
      accounts: [testAccount, secondAccount],
      mermaid: unreachableMermaid,
      wechatFactory: (account) => {
        const client = clients.get(account.id);
        assert.ok(client);
        return client;
      },
    },
  );

  const [first, second] = await Promise.all([
    service.publish(publishInput),
    service.publish({
      ...publishInput,
      accountId: secondAccount.id,
      pageId: "019fabe2-2a4d-7ee9-b9de-1c4dfbedcace",
    }),
  ]);

  assert.equal(first.accountId, testAccount.id);
  assert.equal(second.accountId, secondAccount.id);
  assert.deepEqual(clients.get(testAccount.id)?.calls, [
    "media/uploadimg",
    "material/add_material",
    "draft/add",
  ]);
  assert.deepEqual(clients.get(secondAccount.id)?.calls, [
    "media/uploadimg",
    "material/add_material",
    "draft/add",
  ]);
});

test("an unknown account fails safely before Docmost is read", async () => {
  const docmost = new FakeDocmost([withCover]);
  const { service } = publicationHarness(docmost);

  await assert.rejects(
    () =>
      service.publish({
        ...publishInput,
        accountId: "00000000-0000-7000-8000-000000000099",
      }),
    WeChatAccountNotFoundError,
  );
  assert.equal(docmost.markdownReads, 0);
});

test("the same body creates one draft and returns it on repeated publish", async () => {
  const { service, wechat } = harness([withCover]);

  const first = await service.publish(publishInput);
  const second = await service.publish(publishInput);

  assert.equal(first.remoteDraftId, second.remoteDraftId);
  assert.equal(wechat.calls.filter((call) => call === "draft/add").length, 1);
  assert.ok(wechat.calls.every((call) => !call.includes("freepublish")));
});

test("concurrent identical requests claim one job and create one draft", async () => {
  const { service, wechat } = harness([withCover]);

  const results = await Promise.all([
    service.publish(publishInput),
    service.publish(publishInput),
  ]);

  assert.equal(results[0].id, results[1].id);
  assert.equal(wechat.calls.filter((call) => call === "draft/add").length, 1);
});

test("a body that changes mid-flight blocks draft creation", async () => {
  const { service, wechat } = harness([
    "# Before\n\n![cover](/api/files/a/cover.svg)",
    "# After\n\n![cover](/api/files/a/cover.svg)",
  ]);

  await assert.rejects(() => service.publish(publishInput), SourceChangedError);
  assert.equal(wechat.calls.includes("draft/add"), false);
});

test("an updatedAt change with identical Markdown is not a conflict", async () => {
  const { service } = harness([withCover, withCover]);
  const result = await service.publish(publishInput);
  assert.equal(result.status, "draft_created");
});

test("an unsupported node prevents rendering and persists the warning", async () => {
  const docmost = new FakeDocmost(["# Not reached"], {
    document: { type: "doc", content: [{ type: "transclusion" }] },
  });
  const { service, store } = publicationHarness(docmost, {
    mermaid: unreachableMermaid,
  });

  await assert.rejects(
    () => service.publish(publishInput),
    UnsupportedNodeError,
  );

  const key = publicationKey({
    pageId,
    sourceHash: sha256(JSON.stringify((await docmost.readJson()).content)),
    channel: "wechat",
    accountId,
    templateVersion: baseConfig.PUBLISHER_TEMPLATE_VERSION,
  });
  const job = await store.findJobByKey(key);
  assert.equal(job?.status, "blocked");
  assert.match(job?.warnings[0] ?? "", /transclusion/);
});

test("Mermaid render errors block publication before uploads or drafts", async () => {
  const markdown = "# Broken diagram\n\n```mermaid\nflowchart TD\nA -->\n```";
  const wechat = new MockWeChatClient();
  const { service, store } = publicationHarness(
    new FakeDocmost([markdown], {
      document: {
        type: "doc",
        content: [{ type: "codeBlock", attrs: { language: "mermaid" } }],
      },
    }),
    {
      wechat,
      mermaid: new MermaidRenderer(new Rasterizer(1024 * 1024)),
    },
  );

  await assert.rejects(
    () => service.publish(publishInput),
    (error: Error) => {
      assert.equal(error.name, "MermaidRenderError");
      assert.match(
        error.message,
        /Check the syntax inside the fenced mermaid block/,
      );
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
  assert.equal(job?.errorCode, "MERMAID_RENDER_FAILED");
  assert.match(job?.warnings[0] ?? "", /Mermaid diagram could not be rendered/);
  assert.deepEqual(wechat.calls, []);
  assert.equal(
    store.audits.some(({ event }) => event === "publication.failed"),
    false,
  );
  assert.deepEqual(
    store.audits.map(({ event }) => event),
    [
      "publish_config.saved",
      "publication.started",
      "publication.blocked_content",
    ],
  );
});

test("Mermaid blocks publish as WeChat images while normal code stays highlighted", async () => {
  const markdown = [
    "# Diagrams",
    "",
    "```mermaid",
    "flowchart TD",
    "A[Start] --> B[Done]",
    "```",
    "",
    "```mermaid",
    "sequenceDiagram",
    "Alice->>Bob: Hello",
    "```",
    "",
    "```ts",
    "const value: number = 1;",
    "```",
  ].join("\n");
  const wechat = new MockWeChatClient();
  const { service } = publicationHarness(
    new FakeDocmost([markdown], {
      document: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 1 } },
          { type: "codeBlock", attrs: { language: "mermaid" } },
          { type: "codeBlock", attrs: { language: "mermaid" } },
          { type: "codeBlock", attrs: { language: "ts" } },
        ],
      },
    }),
    {
      wechat,
      mermaid: new MermaidRenderer(new Rasterizer(1024 * 1024)),
    },
  );

  const job = await service.publish(publishInput);

  assert.equal(job.status, "draft_created");
  assert.equal(
    wechat.calls.filter((call) => call === "media/uploadimg").length,
    2,
  );
  assert.equal(wechat.calls.filter((call) => call === "draft/add").length, 1);
  assert.equal(wechat.draftArticles.length, 1);

  const content = wechat.draftArticles[0].content;
  assert.equal(
    [...content.matchAll(/https:\/\/mmbiz\.qpic\.cn\/mock\//g)].length,
    2,
  );
  assert.doesNotMatch(content, /flowchart TD|sequenceDiagram/);
  assert.match(content, /language-ts/);
  assert.match(content, /hljs-keyword/);
  assert.match(content, />const<\/span>/);
  assert.match(content, />value<\/span>/);
});

test("an over-long title is rejected before any job or upload is created", async () => {
  const { service, store, wechat } = harness([withCover], {
    title: "标".repeat(65),
  });

  await assert.rejects(
    () => service.publish(publishInput),
    (error: Error) => {
      assert.equal(error.name, "InvalidArticleError");
      assert.match(error.message, /最多 64 个字符，当前 65 个/);
      return true;
    },
  );
  assert.deepEqual(wechat.calls, []);
  assert.deepEqual(
    store.audits.map(({ event }) => event),
    ["publish_config.saved"],
  );
});

test("a 64 character title is accepted", async () => {
  const { service } = harness([withCover], { title: "标".repeat(64) });
  const job = await service.publish(publishInput);
  assert.equal(job.status, "draft_created");
});

test("publish configuration is persisted per page for console refill", async () => {
  const { service, store } = harness([withCover]);

  await service.publish({
    ...publishInput,
    author: "Saved author",
    digest: "Saved digest",
    needOpenComment: true,
  });

  assert.deepEqual(await store.getConfig(pageId), {
    ...publishInput,
    author: "Saved author",
    digest: "Saved digest",
    needOpenComment: true,
    channel: "wechat",
    accountId,
    templateVersion: baseConfig.PUBLISHER_TEMPLATE_VERSION,
  });
});

test("the asset cache reuses body URLs and cover media across pages", async () => {
  const { service, wechat } = harness([withCover]);

  await service.publish(publishInput);
  await service.publish({
    ...publishInput,
    pageId: "019fabe2-2a4d-7ee9-b9de-1c4dfbedcace",
  });

  assert.equal(
    wechat.calls.filter((call) => call === "media/uploadimg").length,
    1,
  );
  assert.equal(
    wechat.calls.filter((call) => call === "material/add_material").length,
    1,
  );
  assert.equal(wechat.calls.filter((call) => call === "draft/add").length, 2);
});

test("the publication lifecycle writes redacted audit events", async () => {
  const { service, store } = harness([withCover]);

  await service.publish(publishInput);

  assert.deepEqual(
    store.audits.map(({ event }) => event),
    [
      "publish_config.saved",
      "publication.started",
      "publication.draft_created",
    ],
  );
  assert.doesNotMatch(
    JSON.stringify(store.audits),
    /APP_SECRET|INTEGRATION_ENCRYPTION_SECRET|DOCMOST_API_KEY/,
  );
});

test("a failed upload persists the failed status and audit event", async () => {
  const throwingWechat = {
    async uploadBodyImage(): Promise<{ url: string }> {
      throw new Error("upload failed");
    },
    async uploadCover(): Promise<{ mediaId: string }> {
      throw new Error("cover should not be reached");
    },
    async createDraft(): Promise<{ mediaId: string }> {
      throw new Error("draft should not be reached");
    },
  };
  const { service, store } = publicationHarness(new FakeDocmost([withCover]), {
    wechat: throwingWechat,
    mermaid: unreachableMermaid,
  });

  await assert.rejects(() => service.publish(publishInput), /upload failed/);

  const failed = store.audits.find(
    ({ event }) => event === "publication.failed",
  );
  assert.ok(failed);
  assert.equal(failed.resourceType, "publication_job");
  assert.deepEqual(
    store.audits.map(({ event }) => event),
    ["publish_config.saved", "publication.started", "publication.failed"],
  );
});
