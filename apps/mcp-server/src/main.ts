import { personalProfileAuth } from "./auth.js";
import { loadServerConfig } from "./config.js";
import { createNuttyHttpApp } from "./http.js";
import { JsonLogger, Metrics } from "./observability.js";
import { createNuttyRuntime } from "./runtime.js";

const config = loadServerConfig();
const logger = new JsonLogger();
const metrics = new Metrics();
const runtime = createNuttyRuntime(config);
const app = createNuttyHttpApp({
  host: config.host,
  ...(config.allowedHosts === undefined ? {} : { allowedHosts: config.allowedHosts }),
  authenticate: personalProfileAuth(config.personalToken, runtime.principal),
  service: runtime.service,
  logger,
  metrics,
  health: () => runtime.health(),
});

app.listen(config.port, config.host, () => {
  logger.info("server_started", {
    host: config.host,
    port: config.port,
    profile: "personal",
    feishuTransport: config.feishu.transport,
  });
});
