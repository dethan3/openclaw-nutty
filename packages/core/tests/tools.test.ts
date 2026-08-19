import { describe, expect, it } from "vitest";

import {
  saveMemoryInputSchema,
  searchMemoriesInputSchema,
  updateMemoryInputSchema,
} from "../src/index.js";

describe("saveMemoryInputSchema", () => {
  it("accepts explicit content without requiring a destination", () => {
    const result = saveMemoryInputSchema.parse({
      content: "Save this answer exactly.",
      captureMode: "previous_answer",
      source: { surface: "chatgpt" },
    });

    expect(result.destinationId).toBeUndefined();
  });

  it("rejects model-supplied identity fields", () => {
    const result = saveMemoryInputSchema.safeParse({
      content: "Attempted cross-tenant write.",
      captureMode: "manual",
      source: { surface: "other" },
      userId: "someone-else",
    });

    expect(result.success).toBe(false);
  });
});

describe("searchMemoriesInputSchema", () => {
  it("applies a bounded default limit", () => {
    const result = searchMemoriesInputSchema.parse({ query: "MCP" });

    expect(result.limit).toBe(20);
  });

  it("rejects an inverted date range", () => {
    const result = searchMemoriesInputSchema.safeParse({
      createdFrom: "2026-08-20T00:00:00Z",
      createdTo: "2026-08-19T00:00:00Z",
    });

    expect(result.success).toBe(false);
  });
});

describe("updateMemoryInputSchema", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";

  it("allows metadata updates without replacing original content", () => {
    expect(
      updateMemoryInputSchema.safeParse({
        id,
        patch: { tags: ["memory"] },
      }).success,
    ).toBe(true);
  });

  it("requires explicit replacement when original content changes", () => {
    expect(
      updateMemoryInputSchema.safeParse({
        id,
        patch: { content: "Rewritten text" },
      }).success,
    ).toBe(false);
  });
});
