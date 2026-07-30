import assert from "node:assert/strict";
import test from "node:test";
import { encryptWechatAccountSecret } from "@docmost/integration-db";
import { LiveWeChatClient } from "../src/wechat/live-client.js";
import { createWeChatClientFactory } from "../src/wechat/factory.js";
import { baseConfig, pngBytes, testAccount } from "./helpers.js";

const liveConfig = {
  apiBaseUrl: "https://api.weixin.qq.com",
  appId: "wx-real-shaped-test-id",
  appSecret: "real-shaped-test-secret-value",
};

function requestUrl(input: RequestInfo | URL): URL {
  return new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
}

test("the live adapter uses official draft-only endpoints and snake_case fields", async () => {
  const requests: Array<{ url: URL; body?: string }> = [];
  const client = new LiveWeChatClient(liveConfig, async (input, init) => {
    const url = requestUrl(input);
    requests.push({
      url,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    if (url.pathname === "/cgi-bin/stable_token") {
      return Response.json({
        access_token: "token-redacted",
        expires_in: 7200,
      });
    }
    if (url.pathname === "/cgi-bin/media/uploadimg") {
      return Response.json({ url: "https://mmbiz.qpic.cn/body" });
    }
    if (url.pathname === "/cgi-bin/material/add_material") {
      return Response.json({ media_id: "cover-id" });
    }
    if (url.pathname === "/cgi-bin/draft/add") {
      return Response.json({ media_id: "draft-id" });
    }
    return Response.json({ errcode: 404, errmsg: "unexpected test path" });
  });

  await client.uploadBodyImage(pngBytes, "image/png");
  await client.uploadCover(pngBytes, "image/png");
  await client.createDraft({
    title: "Title",
    author: "Author",
    content: "<p>Body</p>",
    thumbMediaId: "cover-id",
    needOpenComment: 1,
    onlyFansCanComment: 0,
  });

  assert.deepEqual(
    requests.map(({ url }) => url.pathname),
    [
      "/cgi-bin/stable_token",
      "/cgi-bin/media/uploadimg",
      "/cgi-bin/material/add_material",
      "/cgi-bin/draft/add",
    ],
  );
  assert.ok(requests.every(({ url }) => !url.pathname.includes("freepublish")));
  assert.equal(requests[2].url.searchParams.get("type"), "image");

  const draft = JSON.parse(requests[3].body ?? "{}");
  assert.equal(draft.articles[0].thumb_media_id, "cover-id");
  assert.equal(draft.articles[0].show_cover_pic, 0);
  assert.equal(draft.articles[0].need_open_comment, 1);
  assert.equal(draft.articles[0].thumbMediaId, undefined);
});

test("a valid stable_token is reused across draft operations", async () => {
  const paths: string[] = [];
  const client = new LiveWeChatClient(liveConfig, async (input) => {
    const url = requestUrl(input);
    paths.push(url.pathname);
    if (url.pathname === "/cgi-bin/stable_token") {
      return Response.json({ access_token: "cached-token", expires_in: 7200 });
    }
    if (url.pathname === "/cgi-bin/media/uploadimg") {
      return Response.json({ url: "https://mmbiz.qpic.cn/body" });
    }
    if (url.pathname === "/cgi-bin/draft/add") {
      return Response.json({ media_id: "draft-id" });
    }
    return Response.json({ errcode: 404, errmsg: "unexpected path" });
  });

  await client.uploadBodyImage(pngBytes, "image/png");
  await client.createDraft({
    title: "Title",
    author: "Author",
    content: "<p>Body</p>",
    thumbMediaId: "cover-id",
    needOpenComment: 0,
    onlyFansCanComment: 0,
  });

  assert.equal(
    paths.filter((path) => path === "/cgi-bin/stable_token").length,
    1,
  );
});

test("error messages expose neither app secrets nor returned tokens", async () => {
  const secret = liveConfig.appSecret;
  const returnedToken = "wechat-token-that-must-not-leak";
  const client = new LiveWeChatClient(liveConfig, async () =>
    Response.json(
      {
        errcode: 40001,
        errmsg: `invalid credential ${secret} ${returnedToken}`,
      },
      { status: 401 },
    ),
  );

  await assert.rejects(
    () => client.uploadBodyImage(pngBytes, "image/png"),
    (error: Error) => {
      assert.doesNotMatch(error.message, new RegExp(secret));
      assert.doesNotMatch(error.message, new RegExp(returnedToken));
      return true;
    },
  );
});

test("the live factory decrypts the Server-compatible database envelope", async () => {
  const encryptionSecret = "server-app-secret-for-tests";
  const appSecret = "database-wechat-app-secret";
  const account = {
    ...testAccount,
    appId: "wx-database-account",
    appSecretEnvelope: encryptWechatAccountSecret(
      appSecret,
      encryptionSecret,
    ),
  };
  let tokenRequestBody = "";
  const factory = createWeChatClientFactory(
    {
      ...baseConfig,
      WECHAT_MODE: "live",
      INTEGRATION_ENCRYPTION_SECRET: encryptionSecret,
    },
    async (input, init) => {
      const url = requestUrl(input);
      if (url.pathname === "/cgi-bin/stable_token") {
        tokenRequestBody = String(init?.body);
        return Response.json({ access_token: "scoped-token", expires_in: 7200 });
      }
      return Response.json({ url: "https://mmbiz.qpic.cn/scoped" });
    },
  );

  await factory(account).uploadBodyImage(pngBytes, "image/png");

  assert.deepEqual(JSON.parse(tokenRequestBody), {
    grant_type: "client_credential",
    appid: account.appId,
    secret: appSecret,
    force_refresh: false,
  });
});

test("an undecryptable account produces a sanitized error", () => {
  const wrongSecret = "wrong-server-app-secret";
  const storedSecret = "stored-wechat-secret";
  const account = {
    ...testAccount,
    appId: "wx-private-app-id",
    appSecretEnvelope: encryptWechatAccountSecret(
      storedSecret,
      "correct-server-app-secret",
    ),
  };
  const factory = createWeChatClientFactory({
    ...baseConfig,
    WECHAT_MODE: "live",
    INTEGRATION_ENCRYPTION_SECRET: wrongSecret,
  });

  assert.throws(
    () => factory(account),
    (error: Error) => {
      assert.equal(error.name, "WeChatAccountUnavailableError");
      assert.doesNotMatch(error.message, /wx-private-app-id/);
      assert.doesNotMatch(error.message, /stored-wechat-secret/);
      assert.doesNotMatch(error.message, /correct-server-app-secret/);
      return true;
    },
  );
});
