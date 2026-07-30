import { z } from "zod";
import { TEMPLATE_ID } from "./rendering/theme.js";

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off"]);

const envFlag = z
  .preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const normalized = value.trim().toLowerCase();
      if (TRUTHY.has(normalized)) return "1";
      if (FALSY.has(normalized)) return "0";
      return value;
    },
    z.enum(["0", "1"]).default("1"),
  )
  .transform((value) => value === "1");

const schema = z.object({
  PUBLISHER_HOST: z.string().default("127.0.0.1"),
  PUBLISHER_PORT: z.coerce.number().int().min(1).max(65535).default(3050),
  PUBLISHER_DATABASE_URL: z
    .string()
    .default("postgres://publisher:publisher@127.0.0.1:5432/publisher"),
  PUBLISHER_USE_MEMORY_STORE: envFlag,
  PUBLISHER_AUTH_ENABLED: envFlag,
  PUBLISHER_ACCESS_TOKEN: z
    .string()
    .min(24)
    .default("publisher_placeholder_2a4c90f8e1d7428b"),
  PUBLISHER_DEFAULT_COVER_PATH: z.string().trim().min(1).optional(),
  DOCMOST_BASE_URL: z.string().url(),
  DOCMOST_API_KEY: z.string().min(12),
  DOCMOST_VERIFY_TLS: envFlag,
  DOCMOST_MAX_ASSET_BYTES: z.coerce
    .number()
    .positive()
    .default(10 * 1024 * 1024),
  WECHAT_MODE: z.enum(["mock", "live"]).default("mock"),
  INTEGRATION_ENCRYPTION_SECRET: z.string().min(16).optional(),
  APP_SECRET: z.string().min(16).optional(),
  WECHAT_API_BASE_URL: z.string().url().default("https://api.weixin.qq.com"),
  WECHAT_MAX_IMAGE_BYTES: z.coerce
    .number()
    .positive()
    .default(10 * 1024 * 1024),
  PUBLISHER_TEMPLATE_VERSION: z.string().min(1).default(TEMPLATE_ID),
});

export type PublisherConfig = z.infer<typeof schema>;

function placeholder(value: string): boolean {
  return /placeholder|replace_with_real|example/i.test(value);
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): PublisherConfig {
  const config = schema.parse(env);
  if (config.WECHAT_MODE !== "live") return config;

  if (placeholder(config.DOCMOST_API_KEY)) {
    throw new Error("Live WeChat mode refuses placeholder credentials");
  }
  const encryptionSecret =
    config.INTEGRATION_ENCRYPTION_SECRET ?? config.APP_SECRET;
  if (!encryptionSecret || placeholder(encryptionSecret)) {
    throw new Error(
      "Live WeChat mode requires the shared integration encryption secret",
    );
  }
  if (config.PUBLISHER_USE_MEMORY_STORE) {
    throw new Error("Live WeChat mode requires persistent PostgreSQL storage");
  }
  if (placeholder(config.PUBLISHER_ACCESS_TOKEN)) {
    throw new Error("Live WeChat mode requires a real Publisher access token");
  }
  if (!config.PUBLISHER_AUTH_ENABLED) {
    throw new Error("Live WeChat mode requires PUBLISHER_AUTH_ENABLED=1");
  }
  return config;
}
