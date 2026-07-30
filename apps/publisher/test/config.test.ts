import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { TEMPLATE_ID } from "../src/rendering/theme.js";
import { asEnv, baseConfig } from "./helpers.js";

const realCredentials = {
  WECHAT_MODE: "live",
  INTEGRATION_ENCRYPTION_SECRET: "server-app-secret-for-tests",
  DOCMOST_API_KEY: "dm_real_shaped_test_key",
  PUBLISHER_ACCESS_TOKEN: "publisher-real-access-token-value",
};

test("live mode rejects placeholder credentials", () => {
  assert.throws(
    () =>
      loadConfig({
        ...asEnv(baseConfig),
        WECHAT_MODE: "live",
        INTEGRATION_ENCRYPTION_SECRET: "server-app-secret-for-tests",
        DOCMOST_API_KEY: "dm_placeholder_test_key",
      }),
    /refuses placeholder credentials/,
  );
});

test("WeChat credentials and account are not configuration inputs", () => {
  const config = loadConfig({
    ...asEnv(baseConfig),
    WECHAT_APP_ID: "legacy-app-id",
    WECHAT_APP_SECRET: "legacy-app-secret-value",
    WECHAT_ACCOUNT_ID: "00000000-0000-7000-8000-000000000099",
  });

  assert.equal("WECHAT_APP_ID" in config, false);
  assert.equal("WECHAT_APP_SECRET" in config, false);
  assert.equal("WECHAT_ACCOUNT_ID" in config, false);
});

test("live mode requires the shared integration encryption secret", () => {
  assert.throws(
    () =>
      loadConfig({
        ...asEnv(baseConfig),
        WECHAT_MODE: "live",
        DOCMOST_API_KEY: "dm_real_shaped_test_key",
      }),
    /shared integration encryption secret/,
  );
});

test("live mode rejects volatile memory persistence", () => {
  assert.throws(
    () => loadConfig({ ...asEnv(baseConfig), ...realCredentials }),
    /requires persistent PostgreSQL storage/,
  );
});

test("live mode rejects a placeholder Publisher access token", () => {
  assert.throws(
    () =>
      loadConfig({
        ...asEnv(baseConfig),
        ...realCredentials,
        PUBLISHER_USE_MEMORY_STORE: "0",
        PUBLISHER_ACCESS_TOKEN: baseConfig.PUBLISHER_ACCESS_TOKEN,
      }),
    /requires a real Publisher access token/,
  );
});

test("live mode refuses to run with API authentication switched off", () => {
  assert.throws(
    () =>
      loadConfig({
        ...asEnv(baseConfig),
        ...realCredentials,
        PUBLISHER_USE_MEMORY_STORE: "0",
        PUBLISHER_AUTH_ENABLED: "0",
      }),
    /requires PUBLISHER_AUTH_ENABLED=1/,
  );
});

test("live mode accepts a fully configured environment", () => {
  const config = loadConfig({
    ...asEnv(baseConfig),
    ...realCredentials,
    PUBLISHER_USE_MEMORY_STORE: "0",
    PUBLISHER_AUTH_ENABLED: "1",
  });

  assert.equal(config.WECHAT_MODE, "live");
  assert.equal(config.PUBLISHER_AUTH_ENABLED, true);
});

test("boolean environment variables accept the usual spellings", () => {
  const env = { ...asEnv(baseConfig) };
  for (const [value, expected] of [
    ["true", true],
    ["TRUE", true],
    ["yes", true],
    ["on", true],
    ["false", false],
    ["no", false],
    ["off", false],
  ] as const) {
    assert.equal(
      loadConfig({ ...env, PUBLISHER_AUTH_ENABLED: value })
        .PUBLISHER_AUTH_ENABLED,
      expected,
      `PUBLISHER_AUTH_ENABLED=${value}`,
    );
  }
});

test("authentication and TLS verification default to on", () => {
  const env = { ...asEnv(baseConfig) };
  delete env.PUBLISHER_AUTH_ENABLED;
  delete env.DOCMOST_VERIFY_TLS;
  const config = loadConfig(env);

  assert.equal(config.PUBLISHER_AUTH_ENABLED, true);
  assert.equal(config.DOCMOST_VERIFY_TLS, true);
});

test("the template version defaults to the renderer's own template id", () => {
  const env = { ...asEnv(baseConfig) };
  delete env.PUBLISHER_TEMPLATE_VERSION;
  assert.equal(loadConfig(env).PUBLISHER_TEMPLATE_VERSION, TEMPLATE_ID);
});
