import { randomUUID } from "node:crypto";

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { MemoryService, Principal, StorageHealth } from "@nutty/core";
import type { Express, RequestHandler } from "express";

import type { Logger } from "./observability.js";
import { Metrics } from "./observability.js";
import { createNuttyMcpServer } from "./tools.js";

export type HttpAppOptions = {
  host: string;
  allowedHosts?: string[];
  authenticate: RequestHandler;
  service: MemoryService;
  logger: Logger;
  metrics: Metrics;
  health: (principal: Principal) => Promise<StorageHealth>;
};

function methodNotAllowed(response: Parameters<RequestHandler>[1]): void {
  response.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
}

export function createNuttyHttpApp(options: HttpAppOptions): Express {
  const app = createMcpExpressApp({
    host: options.host,
    ...(options.allowedHosts === undefined ? {} : { allowedHosts: options.allowedHosts }),
  });

  app.get("/health", async (_request, response) => {
    response.json({ status: "ok", service: "nutty", version: "0.1.0" });
  });

  app.use((request, response, next) => {
    const requestId = randomUUID();
    const startedAt = performance.now();
    response.set("x-request-id", requestId);
    response.on("finish", () => {
      options.logger.info("http_request_completed", {
        requestId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMilliseconds: Math.round(performance.now() - startedAt),
      });
    });
    next();
  });

  app.use("/mcp", options.authenticate);
  app.use("/metrics", options.authenticate);
  app.use("/health/storage", options.authenticate);

  app.get("/metrics", (_request, response) => response.json(options.metrics.snapshot()));
  app.get("/health/storage", async (_request, response) => {
    const principal = response.locals.principal as Principal;
    const health = await options.health(principal);
    response.status(health.status === "unavailable" ? 503 : 200).json(health);
  });

  app.post("/mcp", async (request, response) => {
    const principal = response.locals.principal as Principal;
    const server = createNuttyMcpServer({
      service: options.service,
      principal,
      logger: options.logger,
      metrics: options.metrics,
    });
    const transport = new StreamableHTTPServerTransport();
    try {
      // SDK 1.30's class and Transport interface differ only in optional-property typing.
      await server.connect(transport as unknown as Transport);
      await transport.handleRequest(request, response, request.body);
      response.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch {
      options.logger.error("mcp_transport_failed", {
        requestId: response.getHeader("x-request-id"),
      });
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error." },
          id: null,
        });
      }
    }
  });
  app.get("/mcp", (_request, response) => methodNotAllowed(response));
  app.delete("/mcp", (_request, response) => methodNotAllowed(response));

  return app;
}
