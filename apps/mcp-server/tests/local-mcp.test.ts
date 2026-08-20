import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { describe, expect, it } from "vitest";

import {
  LocalRuntimeManager,
  Metrics,
  createNuttyLocalMcpServer,
  type Logger,
} from "../src/index.js";

const logger: Logger = { info: () => undefined, error: () => undefined };

describe("local Nutty MCP server", () => {
  it("starts before setup and guides the client to configure a destination", async () => {
    const manager = new LocalRuntimeManager(
      join("/tmp", `missing-nutty-config-${randomUUID()}.json`),
    );
    const server = createNuttyLocalMcpServer(manager, logger, new Metrics());
    const client = new Client({ name: "nutty-local-test", version: "1.0.0" });
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
      "get_nutty_status",
      "configure_nutty",
    ]);

    const status = await client.callTool({ name: "get_nutty_status", arguments: {} });
    expect(status.structuredContent).toEqual({ configured: false });

    const save = await client.callTool({
      name: "save_memory",
      arguments: {
        content: "This should wait until Nutty is configured.",
        captureMode: "manual",
        source: { surface: "codex" },
      },
    });
    expect(save.isError).toBe(true);
    expect(save.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining("DESTINATION_NOT_FOUND") }),
    ]);

    await client.close();
    await server.close();
  });
});
