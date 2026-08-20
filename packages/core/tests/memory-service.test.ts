import { describe, expect, it } from "vitest";

import { InMemoryStorage, MemoryService, NuttyError } from "../src/index.js";

const destination = {
  id: "local-test",
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

function createService(maxContentCharacters?: number): MemoryService {
  const configuredDestination = {
    ...destination,
    capabilities: {
      ...destination.capabilities,
      ...(maxContentCharacters === undefined ? {} : { maxContentCharacters }),
    },
  };
  return new MemoryService({
    storage: new InMemoryStorage(configuredDestination),
    defaultDestinationId: configuredDestination.id,
    confirmationSecret: "test-confirmation-secret-that-is-long-enough",
    now: () => new Date("2026-08-19T02:00:00.000Z"),
    createId: () => "123e4567-e89b-42d3-a456-426614174000",
  });
}

const principal = { id: "test-user" };
const input = {
  content: "Keep platform capture separate from storage.",
  captureMode: "previous_answer" as const,
  source: { surface: "codex" as const, assistantMessageId: "message-1" },
  type: "decision" as const,
  tags: ["architecture"],
};

describe("MemoryService", () => {
  it("saves, searches, reads, updates, and deduplicates memories", async () => {
    const service = createService();
    const created = await service.save(principal, input);
    expect(created.outcome).toBe("created");
    expect(created.memory.externalRefs).toHaveLength(1);

    const duplicate = await service.save(principal, input);
    expect(duplicate.outcome).toBe("existing");

    const otherUserCopy = await service.save({ id: "other-user" }, input);
    expect(otherUserCopy.outcome).toBe("created");

    const search = await service.search(principal, { query: "platform" });
    expect(search.items).toHaveLength(1);

    const full = await service.get(principal, { id: created.memory.id });
    expect(full.memory.content).toBe(input.content);

    const updated = await service.update(principal, {
      id: created.memory.id,
      patch: { tags: ["architecture", "MCP"] },
    });
    expect(updated.memory.tags).toEqual(["architecture", "MCP"]);
  });

  it("binds sensitive-content confirmation to the content and principal", async () => {
    const service = createService();
    const sensitiveInput = {
      ...input,
      content: "Save this exchange.",
      userPrompt: "api_key = super-secret-value-12345",
    };
    let token = "";
    try {
      await service.save(principal, sensitiveInput);
    } catch (error) {
      expect(error).toBeInstanceOf(NuttyError);
      const nuttyError = error as NuttyError;
      expect(nuttyError.code).toBe("SENSITIVE_CONTENT_CONFIRMATION_REQUIRED");
      token = nuttyError.details?.confirmationToken ?? "";
    }
    expect(token).not.toBe("");

    await expect(
      service.save(principal, {
        ...sensitiveInput,
        userPrompt: "api_key = a-different-secret-value-67890",
        sensitiveConfirmationToken: token,
      }),
    ).rejects.toMatchObject({ code: "SENSITIVE_CONTENT_CONFIRMATION_REQUIRED" });

    const saved = await service.save(principal, {
      ...sensitiveInput,
      sensitiveConfirmationToken: token,
    });
    expect(saved.memory.sensitivity).toBe("restricted");

    await expect(
      service.save({ id: "other-user" }, { ...sensitiveInput, sensitiveConfirmationToken: token }),
    ).rejects.toMatchObject({ code: "SENSITIVE_CONTENT_CONFIRMATION_REQUIRED" });
  });

  it("enforces the destination limit for every conversation content field", async () => {
    const service = createService(10);

    await expect(
      service.save(principal, { ...input, content: "12345678901" }),
    ).rejects.toMatchObject({
      code: "CONTENT_TOO_LARGE",
      recoveryAction: "reduce_content",
      details: {
        field: "content",
        characterCount: "11",
        maxContentCharacters: "10",
      },
    });

    await expect(
      service.save(principal, {
        ...input,
        content: "short",
        userPrompt: "12345678901",
      }),
    ).rejects.toMatchObject({
      code: "CONTENT_TOO_LARGE",
      details: { field: "userPrompt" },
    });

    const created = await service.save(principal, { ...input, content: "1234567890" });
    await expect(
      service.update(principal, {
        id: created.memory.id,
        patch: { assistantResponse: "12345678901" },
        replaceOriginal: true,
      }),
    ).rejects.toMatchObject({
      code: "CONTENT_TOO_LARGE",
      details: { field: "assistantResponse" },
    });
  });
});
