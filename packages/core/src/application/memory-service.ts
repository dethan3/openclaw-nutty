import { createHash, randomUUID } from "node:crypto";

import {
  getMemoryInputSchema,
  listDestinationsOutputSchema,
  saveMemoryInputSchema,
  saveMemoryOutputSchema,
  searchMemoriesInputSchema,
  searchMemoriesOutputSchema,
  updateMemoryInputSchema,
  updateMemoryOutputSchema,
  type GetMemoryInput,
  type GetMemoryOutput,
  type ListDestinationsOutput,
  type SaveMemoryInput,
  type SaveMemoryOutput,
  type SearchMemoriesInput,
  type SearchMemoriesOutput,
  type UpdateMemoryInput,
  type UpdateMemoryOutput,
} from "../contracts/tools.js";
import {
  CORE_LIMITS,
  CURRENT_MEMORY_SCHEMA_VERSION,
  memorySchema,
  memorySummarySchema,
  type Memory,
} from "../domain/memory.js";
import type { Principal } from "../domain/principal.js";
import { NuttyError } from "../errors/nutty-error.js";
import { SensitiveContentPolicy, containsSensitiveContent } from "../policies/content.js";
import type { StoragePort, StorageScope } from "../ports/storage.js";

export type MemoryServiceOptions = {
  storage: StoragePort;
  defaultDestinationId: string;
  destinationIds?: string[];
  confirmationSecret: string;
  now?: () => Date;
  createId?: () => string;
};

function normalizedContent(content: string): string {
  return content.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
}

export function hashMemoryContent(content: string): string {
  return createHash("sha256").update(normalizedContent(content), "utf8").digest("hex");
}

function defaultTitle(content: string): string {
  const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return (firstLine || "Untitled memory").slice(0, CORE_LIMITS.titleCharacters);
}

function withoutNulls<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, item === null ? undefined : item]),
  );
}

const DESTINATION_LIMITED_FIELDS = [
  ["content", "Content"],
  ["userPrompt", "User Prompt"],
  ["assistantResponse", "Assistant Response"],
] as const;

type DestinationLimitedContent = {
  content: string;
  userPrompt?: string | undefined;
  assistantResponse?: string | undefined;
};

function characterCount(value: string): number {
  return Array.from(value).length;
}

export class MemoryService {
  private readonly storage: StoragePort;
  private readonly defaultDestinationId: string;
  private readonly destinationIds: string[];
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly sensitiveContentPolicy: SensitiveContentPolicy;

  constructor(options: MemoryServiceOptions) {
    this.storage = options.storage;
    this.defaultDestinationId = options.defaultDestinationId;
    this.destinationIds = options.destinationIds ?? [options.defaultDestinationId];
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.sensitiveContentPolicy = new SensitiveContentPolicy(options.confirmationSecret);
  }

  async save(principal: Principal, rawInput: SaveMemoryInput): Promise<SaveMemoryOutput> {
    const input = saveMemoryInputSchema.parse(rawInput);
    const scope = this.scope(principal, input.destinationId);
    await this.assertDestinationContentLimit(scope, input);
    const contentHash = hashMemoryContent(input.content);
    const now = this.now();
    const sensitiveContent = [
      input.content,
      input.userPrompt,
      input.assistantResponse,
      input.userNote,
    ]
      .filter((item): item is string => item !== undefined)
      .join("\u0000");
    const containsSensitiveData = containsSensitiveContent(sensitiveContent);

    if (containsSensitiveData) {
      this.sensitiveContentPolicy.requireConfirmation(
        {
          hash: hashMemoryContent(sensitiveContent),
          principalId: principal.id,
          destinationId: scope.destinationId,
        },
        input.sensitiveConfirmationToken,
        now,
      );
    }

    if (input.saveIntentId === undefined) {
      const existing = await this.storage.findByHash(scope, contentHash);
      if (existing !== null) {
        return saveMemoryOutputSchema.parse({
          outcome: "existing",
          memory: memorySummarySchema.parse(existing.memory),
          skippedFields: [],
          warnings: [],
        });
      }
    }

    const timestamp = now.toISOString();
    const sensitivity = containsSensitiveData
      ? "restricted"
      : (input.sensitivity ?? "normal");
    const memory = memorySchema.parse({
      id: this.createId(),
      title: input.title ?? defaultTitle(input.content),
      content: input.content,
      ...(input.userPrompt === undefined ? {} : { userPrompt: input.userPrompt }),
      ...(input.assistantResponse === undefined
        ? {}
        : { assistantResponse: input.assistantResponse }),
      ...(input.userNote === undefined ? {} : { userNote: input.userNote }),
      ...(input.summary === undefined ? {} : { summary: input.summary }),
      type: input.type ?? "inbox",
      tags: input.tags ?? [],
      ...(input.project === undefined ? {} : { project: input.project }),
      captureMode: input.captureMode,
      source: input.source,
      sensitivity,
      contentHash,
      schemaVersion: CURRENT_MEMORY_SCHEMA_VERSION,
      createdAt: timestamp,
      updatedAt: timestamp,
      externalRefs: [],
    });

    const stored = await this.storage.create(scope, memory, {
      idempotencyKey: input.saveIntentId ?? this.idempotencyKey(scope, memory),
    });
    return saveMemoryOutputSchema.parse({
      outcome: "created",
      memory: memorySummarySchema.parse(stored.memory),
      skippedFields: stored.skippedFields ?? [],
      warnings: stored.warnings ?? [],
    });
  }

  async search(
    principal: Principal,
    rawInput: SearchMemoriesInput,
  ): Promise<SearchMemoriesOutput> {
    const input = searchMemoriesInputSchema.parse(rawInput);
    const scope = this.scope(principal, input.destinationId);
    const page = await this.storage.search(scope, {
      ...(input.query === undefined ? {} : { text: input.query }),
      ...(input.types === undefined ? {} : { types: input.types }),
      ...(input.tags === undefined ? {} : { tags: input.tags }),
      ...(input.project === undefined ? {} : { project: input.project }),
      ...(input.surfaces === undefined ? {} : { surfaces: input.surfaces }),
      ...(input.createdFrom === undefined ? {} : { createdFrom: input.createdFrom }),
      ...(input.createdTo === undefined ? {} : { createdTo: input.createdTo }),
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      limit: input.limit,
    });
    return searchMemoriesOutputSchema.parse({
      items: page.items.map((item) => memorySummarySchema.parse(item.memory)),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    });
  }

  async get(principal: Principal, rawInput: GetMemoryInput): Promise<GetMemoryOutput> {
    const input = getMemoryInputSchema.parse(rawInput);
    const stored = await this.storage.get(this.scope(principal, input.destinationId), input.id);
    if (stored === null) {
      throw new NuttyError("NOT_FOUND", "Memory not found.");
    }
    return { memory: stored.memory };
  }

  async update(
    principal: Principal,
    rawInput: UpdateMemoryInput,
  ): Promise<UpdateMemoryOutput> {
    const input = updateMemoryInputSchema.parse(rawInput);
    const scope = this.scope(principal, input.destinationId);
    const current = await this.storage.get(scope, input.id);
    if (current === null) {
      throw new NuttyError("NOT_FOUND", "Memory not found.");
    }

    const patch = withoutNulls(input.patch);
    const nextContent = typeof patch.content === "string" ? patch.content : current.memory.content;
    const updated = memorySchema.parse({
      ...current.memory,
      ...patch,
      contentHash: hashMemoryContent(nextContent),
      updatedAt: this.now().toISOString(),
    });
    await this.assertDestinationContentLimit(scope, updated);
    const stored = await this.storage.update(scope, input.id, updated, input.expectedVersion);
    return updateMemoryOutputSchema.parse({ memory: stored.memory });
  }

  async listDestinations(principal: Principal): Promise<ListDestinationsOutput> {
    const destinations = await Promise.all(
      this.destinationIds.map((destinationId) =>
        this.storage.destination({ principal, destinationId }),
      ),
    );
    return listDestinationsOutputSchema.parse({ destinations });
  }

  private scope(principal: Principal, destinationId: string | undefined): StorageScope {
    return { principal, destinationId: destinationId ?? this.defaultDestinationId };
  }

  private async assertDestinationContentLimit(
    scope: StorageScope,
    value: DestinationLimitedContent,
  ): Promise<void> {
    const { maxContentCharacters } = await this.storage.capabilities(scope);
    if (maxContentCharacters === undefined) return;

    for (const [field, label] of DESTINATION_LIMITED_FIELDS) {
      const content = value[field];
      if (content === undefined) continue;
      const characters = characterCount(content);
      if (characters <= maxContentCharacters) continue;
      throw new NuttyError(
        "CONTENT_TOO_LARGE",
        `${label} contains ${characters} characters, but the destination allows at most ${maxContentCharacters}.`,
        {
          recoveryAction: "reduce_content",
          details: {
            field,
            characterCount: String(characters),
            maxContentCharacters: String(maxContentCharacters),
            destinationId: scope.destinationId,
          },
        },
      );
    }
  }

  private idempotencyKey(scope: StorageScope, memory: Memory): string {
    const messageIdentity = [
      memory.source.conversationId,
      memory.source.userMessageId,
      memory.source.assistantMessageId,
    ]
      .filter((item): item is string => item !== undefined)
      .join(":");
    return createHash("sha256")
      .update(
        [
          scope.principal.id,
          scope.destinationId,
          memory.captureMode,
          messageIdentity || memory.contentHash,
        ].join("\u0000"),
      )
      .digest("hex");
  }
}
