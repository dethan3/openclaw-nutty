import { randomUUID } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  MemoryService,
  NuttyError,
  getMemoryInputSchema,
  getMemoryOutputSchema,
  listDestinationsInputSchema,
  listDestinationsOutputSchema,
  nuttyErrorPayloadSchema,
  saveMemoryInputSchema,
  saveMemoryOutputSchema,
  searchMemoriesInputSchema,
  searchMemoriesOutputSchema,
  updateMemoryInputSchema,
  updateMemoryOutputSchema,
  type NuttyErrorPayload,
  type Principal,
} from "@nutty/core";
import { z } from "zod";

import type { Logger } from "./observability.js";
import { Metrics } from "./observability.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export type NuttyToolContext = {
  service: MemoryService;
  principal: Principal;
};

type ToolDependencies = {
  context: () => Promise<NuttyToolContext>;
  logger: Logger;
  metrics: Metrics;
};

function errorPayload(error: unknown, requestId: string): NuttyErrorPayload {
  const nuttyError =
    error instanceof NuttyError
      ? error
      : error instanceof z.ZodError
        ? new NuttyError("INVALID_INPUT", "Tool input is invalid.", { cause: error })
        : new NuttyError("INTERNAL_ERROR", "Nutty could not complete the request.", {
            retryable: false,
            cause: error,
          });
  return nuttyErrorPayloadSchema.parse({
    code: nuttyError.code,
    message: nuttyError.message,
    retryable: nuttyError.retryable,
    requestId,
    ...(nuttyError.recoveryAction === undefined
      ? {}
      : { recoveryAction: nuttyError.recoveryAction }),
    ...(nuttyError.details === undefined ? {} : { details: nuttyError.details }),
  });
}

async function runTool<T extends Record<string, unknown>>(
  tool: string,
  dependencies: ToolDependencies,
  operation: () => Promise<T>,
  successMessage: (output: T) => string,
): Promise<ToolResult> {
  const startedAt = performance.now();
  const requestId = randomUUID();
  try {
    const output = await operation();
    dependencies.metrics.record(tool, "success", performance.now() - startedAt);
    dependencies.logger.info("mcp_tool_completed", { tool, requestId, outcome: "success" });
    return {
      structuredContent: output,
      content: [{ type: "text", text: successMessage(output) }],
    };
  } catch (error) {
    const payload = errorPayload(error, requestId);
    dependencies.metrics.record(tool, "error", performance.now() - startedAt);
    dependencies.logger.error("mcp_tool_completed", {
      tool,
      requestId,
      outcome: "error",
      errorCode: payload.code,
    });
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify(payload) }],
    };
  }
}

export function createNuttyMcpServer(dependencies: ToolDependencies): McpServer {
  const server = new McpServer(
    { name: "nutty", version: "0.1.0" },
    {
      instructions:
        "Save only user-visible content the user selected. Never send identity fields, credentials, system prompts, hidden reasoning, or invented message IDs. Search before fetching full memory bodies.",
    },
  );

  server.registerTool(
    "save_memory",
    {
      title: "Save memory",
      description:
        "Save explicit user-visible conversation content or a selected passage to the user's Nutty destination.",
      inputSchema: saveMemoryInputSchema,
      outputSchema: saveMemoryOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (input) =>
      runTool(
        "save_memory",
        dependencies,
        async () => {
          const context = await dependencies.context();
          return context.service.save(context.principal, input);
        },
        (output) =>
          output.outcome === "existing" ? "This memory already exists." : "Memory saved.",
      ),
  );

  server.registerTool(
    "search_memories",
    {
      title: "Search memories",
      description: "Search saved Nutty memories using text and structured filters.",
      inputSchema: searchMemoriesInputSchema,
      outputSchema: searchMemoriesOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (input) =>
      runTool(
        "search_memories",
        dependencies,
        async () => {
          const context = await dependencies.context();
          return context.service.search(context.principal, input);
        },
        (output) => `Found ${output.items.length} memories.`,
      ),
  );

  server.registerTool(
    "get_memory",
    {
      title: "Get memory",
      description: "Read one complete Nutty memory after selecting it from search results.",
      inputSchema: getMemoryInputSchema,
      outputSchema: getMemoryOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (input) =>
      runTool(
        "get_memory",
        dependencies,
        async () => {
          const context = await dependencies.context();
          return context.service.get(context.principal, input);
        },
        () => "Memory loaded.",
      ),
  );

  server.registerTool(
    "update_memory",
    {
      title: "Update memory",
      description:
        "Update derived memory fields. Replacing original content requires replaceOriginal=true after user confirmation.",
      inputSchema: updateMemoryInputSchema,
      outputSchema: updateMemoryOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (input) =>
      runTool(
        "update_memory",
        dependencies,
        async () => {
          const context = await dependencies.context();
          return context.service.update(context.principal, input);
        },
        () => "Memory updated.",
      ),
  );

  server.registerTool(
    "list_destinations",
    {
      title: "List memory destinations",
      description: "List storage destinations available to the authenticated user and their capabilities.",
      inputSchema: listDestinationsInputSchema,
      outputSchema: listDestinationsOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () =>
      runTool(
        "list_destinations",
        dependencies,
        async () => {
          const context = await dependencies.context();
          return context.service.listDestinations(context.principal);
        },
        (output) => `Found ${output.destinations.length} destinations.`,
      ),
  );

  return server;
}
