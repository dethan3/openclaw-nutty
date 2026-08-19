import { describe, expect, it } from "vitest";

import {
  CURRENT_MEMORY_SCHEMA_VERSION,
  memorySchema,
  tagsSchema,
} from "../src/index.js";

const validMemory = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  title: "Nutty architecture",
  content: "Keep platform capture separate from storage.",
  userPrompt: "How should Nutty be structured?",
  assistantResponse: "Use a Core, MCP boundary, and adapters.",
  type: "decision",
  tags: ["architecture", "MCP"],
  captureMode: "current_exchange",
  source: {
    surface: "codex",
    conversationId: "conversation-1",
  },
  sensitivity: "normal",
  contentHash: "a".repeat(64),
  schemaVersion: CURRENT_MEMORY_SCHEMA_VERSION,
  createdAt: "2026-08-19T10:00:00+08:00",
  updatedAt: "2026-08-19T10:00:00+08:00",
  externalRefs: [],
} as const;

describe("memorySchema", () => {
  it("accepts a canonical memory", () => {
    expect(memorySchema.parse(validMemory)).toEqual(validMemory);
  });

  it("rejects timestamps that move backwards", () => {
    const result = memorySchema.safeParse({
      ...validMemory,
      updatedAt: "2026-08-19T09:59:59+08:00",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown fields instead of silently accepting identity data", () => {
    const result = memorySchema.safeParse({
      ...validMemory,
      tenantId: "model-supplied-tenant",
    });

    expect(result.success).toBe(false);
  });

  it("rejects schema versions the current Core does not understand", () => {
    const result = memorySchema.safeParse({
      ...validMemory,
      schemaVersion: CURRENT_MEMORY_SCHEMA_VERSION + 1,
    });

    expect(result.success).toBe(false);
  });
});

describe("tagsSchema", () => {
  it("requires canonical tags without hash prefixes", () => {
    expect(tagsSchema.safeParse(["#memory"]).success).toBe(false);
  });

  it("rejects duplicate tags ignoring case", () => {
    expect(tagsSchema.safeParse(["MCP", "mcp"]).success).toBe(false);
  });
});
