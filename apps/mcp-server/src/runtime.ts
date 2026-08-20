import { randomBytes } from "node:crypto";

import { MemoryService, type Principal, type StorageHealth } from "@nutty/core";
import {
  FeishuHttpClient,
  FeishuLarkCliClient,
  FeishuStorageAdapter,
  FeishuTenantTokenProvider,
} from "@nutty/storage-feishu";

import type { ServerConfig } from "./config.js";

export type NuttyRuntime = {
  principal: Principal;
  service: MemoryService;
  health: () => Promise<StorageHealth>;
};

export function createNuttyRuntime(config: ServerConfig): NuttyRuntime {
  const principal = { id: config.principalId };
  const feishuClient =
    config.feishu.transport === "lark-cli"
      ? new FeishuLarkCliClient({
          binary: config.feishu.binary,
          identity: config.feishu.identity,
          timeoutMs: config.feishu.timeoutMs,
        })
      : new FeishuHttpClient(
          new FeishuTenantTokenProvider(
            config.feishu.appId,
            config.feishu.appSecret,
            config.feishu.apiBaseUrl,
          ),
          config.feishu.apiBaseUrl,
        );
  const storage = new FeishuStorageAdapter(
    feishuClient,
    {
      id: config.destinationId,
      displayName: "Feishu Memories",
      appToken: config.feishu.appToken,
      ...(config.feishu.webBaseUrl === undefined
        ? {}
        : { webBaseUrl: config.feishu.webBaseUrl }),
      profile: "unified",
      table: { tableId: config.feishu.tableId },
    },
  );
  const service = new MemoryService({
    storage,
    defaultDestinationId: config.destinationId,
    confirmationSecret:
      config.confirmationSecret ?? randomBytes(32).toString("base64url"),
  });
  return {
    principal,
    service,
    health: () =>
      storage.health({ principal, destinationId: config.destinationId }),
  };
}
