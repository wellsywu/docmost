import { decryptWechatAccountSecret } from "@docmost/integration-db";
import type { PublisherConfig } from "../config.js";
import { WeChatAccountUnavailableError } from "../core/errors.js";
import type { StoredWechatAccount } from "../publication/store.js";
import { LiveWeChatClient } from "./live-client.js";
import { MockWeChatClient } from "./mock-client.js";
import type { WeChatPort } from "./port.js";

export type WeChatClientFactory = (
  account: StoredWechatAccount,
) => WeChatPort;

export function createWeChatClientFactory(
  config: PublisherConfig,
  fetchImpl: typeof fetch = fetch,
): WeChatClientFactory {
  if (config.WECHAT_MODE === "mock") {
    return () => new MockWeChatClient();
  }

  const encryptionSecret =
    config.INTEGRATION_ENCRYPTION_SECRET ?? config.APP_SECRET;
  if (!encryptionSecret) {
    throw new WeChatAccountUnavailableError();
  }

  return (account) => {
    try {
      return new LiveWeChatClient(
        {
          apiBaseUrl: config.WECHAT_API_BASE_URL,
          appId: account.appId,
          appSecret: decryptWechatAccountSecret(
            account.appSecretEnvelope,
            encryptionSecret,
          ),
        },
        fetchImpl,
      );
    } catch {
      throw new WeChatAccountUnavailableError();
    }
  };
}
