import { MemoryService } from "@nutty/core";
import {
  FeishuHttpClient,
  FeishuLarkCliClient,
  FeishuStorageAdapter,
  FeishuTenantTokenProvider,
} from "@nutty/storage-feishu";

import { personalProfileAuth } from "./auth.js";
import { loadServerConfig } from "./config.js";
import { createNuttyHttpApp } from "./http.js";
import { JsonLogger, Metrics } from "./observability.js";

const config = loadServerConfig();
const logger = new JsonLogger();
const metrics = new Metrics();
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
  confirmationSecret: config.confirmationSecret,
});
const app = createNuttyHttpApp({
  host: config.host,
  ...(config.allowedHosts === undefined ? {} : { allowedHosts: config.allowedHosts }),
  authenticate: personalProfileAuth(config.personalToken, principal),
  service,
  logger,
  metrics,
  health: (requestPrincipal) =>
    storage.health({ principal: requestPrincipal, destinationId: config.destinationId }),
});

app.listen(config.port, config.host, () => {
  logger.info("server_started", {
    host: config.host,
    port: config.port,
    profile: "personal",
    feishuTransport: config.feishu.transport,
  });
});
