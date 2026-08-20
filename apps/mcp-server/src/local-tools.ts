import { randomUUID } from "node:crypto";

import { NuttyError } from "@nutty/core";
import { z } from "zod";

import { LocalRuntimeManager, type LocalRuntimeStatus } from "./local-runtime.js";
import type { Logger } from "./observability.js";
import { Metrics } from "./observability.js";
import { createNuttyMcpServer } from "./tools.js";

const statusOutputSchema = z
  .object({
    configured: z.boolean(),
    destinationId: z.string().optional(),
    provider: z.literal("feishu").optional(),
    health: z.enum(["healthy", "degraded", "unavailable"]).optional(),
  })
  .strict();

function publicStatus(status: LocalRuntimeStatus): z.output<typeof statusOutputSchema> {
  return statusOutputSchema.parse({
    configured: status.configured,
    ...(status.destinationId === undefined ? {} : { destinationId: status.destinationId }),
    ...(status.provider === undefined ? {} : { provider: status.provider }),
    ...(status.health === undefined ? {} : { health: status.health }),
  });
}

async function localTool(
  operation: () => Promise<LocalRuntimeStatus>,
  successMessage: string,
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}> {
  try {
    const status = publicStatus(await operation());
    return {
      content: [{ type: "text", text: successMessage }],
      structuredContent: status,
    };
  } catch (error) {
    const requestId = randomUUID();
    const nuttyError =
      error instanceof NuttyError
        ? error
        : new NuttyError("INTERNAL_ERROR", "Nutty could not complete local setup.", {
            cause: error,
          });
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            code: nuttyError.code,
            message: nuttyError.message,
            retryable: nuttyError.retryable,
            requestId,
            ...(nuttyError.recoveryAction === undefined
              ? {}
              : { recoveryAction: nuttyError.recoveryAction }),
          }),
        },
      ],
    };
  }
}

export function createNuttyLocalMcpServer(
  manager: LocalRuntimeManager,
  logger: Logger,
  metrics: Metrics,
) {
  const server = createNuttyMcpServer({
    context: () => manager.context(),
    logger,
    metrics,
  });

  server.registerTool(
    "get_nutty_status",
    {
      title: "Get Nutty status",
      description:
        "Check whether local Nutty is connected to a Feishu Base destination and whether it is reachable.",
      inputSchema: {},
      outputSchema: statusOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async () => localTool(() => manager.status(), "Nutty status loaded."),
  );

  server.registerTool(
    "configure_nutty",
    {
      title: "Configure Nutty",
      description:
        "Connect local Nutty to a Feishu Base table URL after the user explicitly chooses that destination.",
      inputSchema: {
        baseUrl: z
          .string()
          .url()
          .describe("Full Feishu Base table URL, including the table query parameter."),
      },
      outputSchema: statusOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ baseUrl }) =>
      localTool(() => manager.configureFromBaseUrl(baseUrl), "Nutty is connected to Feishu."),
  );

  return server;
}
