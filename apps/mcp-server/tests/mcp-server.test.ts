import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { InMemoryStorage, MemoryService } from "@nutty/core";
import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import {
  Metrics,
  createNuttyMcpServer,
  personalProfileAuth,
  type Logger,
} from "../src/index.js";

const logger: Logger = { info: () => undefined, error: () => undefined };
const principal = { id: "mcp-test-user" };
const destination = {
  id: "test-memory",
  provider: "local" as const,
  displayName: "Test memory",
  status: "ready" as const,
  isDefault: true,
  capabilities: {
    fullTextSearch: true,
    structuredFilters: true,
    optimisticConcurrency: true,
    softDelete: false,
  },
};

function dependencies() {
  const storage = new InMemoryStorage(destination);
  const service = new MemoryService({
    storage,
    defaultDestinationId: destination.id,
    confirmationSecret: "mcp-test-confirmation-secret-long-enough",
    now: () => new Date("2026-08-19T02:00:00.000Z"),
    createId: () => "123e4567-e89b-42d3-a456-426614174000",
  });
  return { storage, service, metrics: new Metrics() };
}

describe("Nutty MCP server", () => {
  it("advertises five annotated tools and completes a save/search flow", async () => {
    const { service, metrics } = dependencies();
    const server = createNuttyMcpServer({
      context: async () => ({ service, principal }),
      logger,
      metrics,
    });
    const client = new Client({ name: "nutty-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport as unknown as Transport),
      client.connect(clientTransport as unknown as Transport),
    ]);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "save_memory",
      "search_memories",
      "get_memory",
      "update_memory",
      "list_destinations",
    ]);
    expect(tools.tools.find((tool) => tool.name === "save_memory")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    });

    const saved = await client.callTool({
      name: "save_memory",
      arguments: {
        content: "MCP keeps platform adapters thin.",
        captureMode: "previous_answer",
        source: { surface: "codex" },
        type: "decision",
      },
    });
    expect(saved.isError).not.toBe(true);
    expect(saved.structuredContent).toMatchObject({ outcome: "created" });

    const search = await client.callTool({
      name: "search_memories",
      arguments: { query: "platform" },
    });
    expect(search.structuredContent).toMatchObject({
      items: [{ title: "MCP keeps platform adapters thin." }],
    });

    await client.close();
    await server.close();
  });

  it("enforces Personal Profile bearer authentication at the HTTP boundary", () => {
    const accessToken = "personal-test-token-that-is-32-bytes";
    const middleware = personalProfileAuth(accessToken, principal);
    const status = vi.fn().mockReturnThis();
    const set = vi.fn().mockReturnThis();
    const json = vi.fn();
    const response = { status, set, json, locals: {} } as unknown as Response;
    const next = vi.fn() as NextFunction;

    middleware(
      { header: () => undefined } as unknown as Request,
      response,
      next,
    );
    expect(status).toHaveBeenCalledWith(401);
    expect(set).toHaveBeenCalledWith("WWW-Authenticate", expect.stringContaining("Bearer"));
    expect(next).not.toHaveBeenCalled();

    middleware(
      { header: () => `Bearer ${accessToken}` } as unknown as Request,
      response,
      next,
    );
    expect(response.locals.principal).toEqual(principal);
    expect(next).toHaveBeenCalledOnce();
  });
});
