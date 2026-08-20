import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { LocalRuntimeManager } from "./local-runtime.js";
import { createNuttyLocalMcpServer } from "./local-tools.js";
import { Metrics, StderrJsonLogger } from "./observability.js";

const logger = new StderrJsonLogger();
const server = createNuttyLocalMcpServer(
  new LocalRuntimeManager(),
  logger,
  new Metrics(),
);
const transport = new StdioServerTransport();

await server.connect(transport);
process.stdin.resume();

logger.info("server_started", {
  profile: "personal",
  transport: "stdio",
  feishuTransport: "lark-cli",
});
