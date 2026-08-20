import {
  NuttyError,
  type CreateMemoryOptions,
  type Destination,
  type Memory,
  type MemorySearchQuery,
  type MemoryType,
  type SearchPage,
  type StorageCapabilities,
  type StorageHealth,
  type StoragePort,
  type StorageScope,
  type StoredMemory,
} from "@nutty/core";
import { createHash } from "node:crypto";
import { z } from "zod";

import { feishuRecordToMemory, memoryToFeishuFields } from "./mapping.js";
import { FeishuSchemaRegistry, type InspectedTable } from "./schema-registry.js";
import type {
  FeishuClient,
  FeishuDestinationConfig,
  FeishuRecord,
  FeishuTableConfig,
  LegacyTableName,
  LogicalField,
} from "./types.js";

const DEFAULT_LEGACY_ROUTES: Record<MemoryType, LegacyTableName> = {
  conversation: "Inbox",
  decision: "Ideas",
  insight: "Ideas",
  reference: "Links",
  task: "Tasks",
  project: "Projects",
  preference: "Ideas",
  inbox: "Inbox",
};

export const FEISHU_TEXT_FIELD_CHARACTER_LIMIT = 100_000;

const cursorSchema = z.object({ tableIndex: z.number().int().nonnegative(), pageToken: z.string().optional() });
type Cursor = z.infer<typeof cursorSchema>;

type TableContext = {
  config: FeishuTableConfig;
  inspected: InspectedTable;
};

type LocatedRecord = TableContext & { record: FeishuRecord };

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): Cursor {
  if (cursor === undefined) return { tableIndex: 0 };
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch (error) {
    throw new NuttyError("INVALID_INPUT", "The search cursor is invalid.", { cause: error });
  }
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

function uuidClientToken(idempotencyKey: string): string {
  const hex = createHash("sha256").update(idempotencyKey).digest("hex");
  const variant = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function matches(memory: Memory, query: MemorySearchQuery): boolean {
  if (query.types !== undefined && !query.types.includes(memory.type)) return false;
  if (query.tags !== undefined) {
    const memoryTags = new Set(memory.tags.map(normalized));
    if (!query.tags.every((tag) => memoryTags.has(normalized(tag)))) return false;
  }
  if (query.project !== undefined && normalized(memory.project ?? "") !== normalized(query.project)) {
    return false;
  }
  if (query.surfaces !== undefined && !query.surfaces.includes(memory.source.surface)) return false;
  if (query.createdFrom !== undefined && Date.parse(memory.createdAt) < Date.parse(query.createdFrom)) {
    return false;
  }
  if (query.createdTo !== undefined && Date.parse(memory.createdAt) > Date.parse(query.createdTo)) {
    return false;
  }
  if (query.text !== undefined) {
    const haystack = normalized(
      [memory.title, memory.summary, memory.content, memory.project, ...memory.tags]
        .filter((item): item is string => item !== undefined)
        .join("\n"),
    );
    if (!haystack.includes(normalized(query.text))) return false;
  }
  return true;
}

export class FeishuStorageAdapter implements StoragePort {
  private readonly schemaRegistry: FeishuSchemaRegistry;
  private readonly createLocks = new Map<string, Promise<StoredMemory>>();

  constructor(
    private readonly client: FeishuClient,
    private readonly config: FeishuDestinationConfig,
  ) {
    this.schemaRegistry = new FeishuSchemaRegistry(client);
  }

  async destination(scope: StorageScope): Promise<Destination> {
    this.assertScope(scope);
    try {
      const tables = await this.allTables();
      const missingOptionalFields = new Set(
        tables.flatMap((table) => table.inspected.missingOptionalFields),
      );
      return {
        id: this.config.id,
        provider: "feishu",
        displayName: this.config.displayName,
        status: missingOptionalFields.size === 0 ? "ready" : "degraded",
        isDefault: true,
        capabilities: await this.capabilities(scope),
      };
    } catch (error) {
      if (error instanceof NuttyError && error.code === "SCHEMA_MISMATCH") {
        return {
          id: this.config.id,
          provider: "feishu",
          displayName: this.config.displayName,
          status: "configuration_required",
          isDefault: true,
          capabilities: await this.capabilities(scope),
        };
      }
      throw error;
    }
  }

  async capabilities(scope: StorageScope): Promise<StorageCapabilities> {
    this.assertScope(scope);
    return {
      fullTextSearch: false,
      structuredFilters: true,
      optimisticConcurrency: false,
      softDelete: false,
      maxContentCharacters: FEISHU_TEXT_FIELD_CHARACTER_LIMIT,
    };
  }

  async findByHash(scope: StorageScope, contentHash: string): Promise<StoredMemory | null> {
    this.assertScope(scope);
    const located = await this.findRecord("contentHash", contentHash);
    return located === null ? null : this.toStoredMemory(located);
  }

  async create(
    scope: StorageScope,
    memory: Memory,
    options: CreateMemoryOptions,
  ): Promise<StoredMemory> {
    this.assertScope(scope);
    const currentLock = this.createLocks.get(options.idempotencyKey);
    if (currentLock !== undefined) return currentLock;
    const operation = this.createUnlocked(memory, options.idempotencyKey);
    this.createLocks.set(options.idempotencyKey, operation);
    try {
      return await operation;
    } finally {
      this.createLocks.delete(options.idempotencyKey);
    }
  }

  async get(scope: StorageScope, id: string): Promise<StoredMemory | null> {
    this.assertScope(scope);
    const located = await this.findRecord("id", id);
    return located === null ? null : this.toStoredMemory(located);
  }

  async search(scope: StorageScope, query: MemorySearchQuery): Promise<SearchPage> {
    this.assertScope(scope);
    const tables = await this.searchTables(query.types);
    let cursor = decodeCursor(query.cursor);
    const items: StoredMemory[] = [];
    let scannedPages = 0;

    while (
      cursor.tableIndex < tables.length &&
      items.length < query.limit &&
      scannedPages < 5
    ) {
      const table = tables[cursor.tableIndex];
      if (table === undefined) break;
      const page = await this.client.searchRecords(this.config.appToken, table.config.tableId, {
        pageSize: Math.min(100, query.limit - items.length),
        ...(cursor.pageToken === undefined ? {} : { pageToken: cursor.pageToken }),
      });
      scannedPages += 1;
      for (const record of page.items) {
        const stored = this.toStoredMemory({ ...table, record });
        if (matches(stored.memory, query)) items.push(stored);
        if (items.length >= query.limit) break;
      }

      if (page.hasMore && page.pageToken !== undefined) {
        cursor = { tableIndex: cursor.tableIndex, pageToken: page.pageToken };
        if (items.length >= query.limit) break;
      } else {
        cursor = { tableIndex: cursor.tableIndex + 1 };
      }
    }

    const hasNext = cursor.tableIndex < tables.length;
    return {
      items,
      ...(hasNext ? { nextCursor: encodeCursor(cursor) } : {}),
    };
  }

  async update(
    scope: StorageScope,
    id: string,
    memory: Memory,
    expectedVersion?: string,
  ): Promise<StoredMemory> {
    this.assertScope(scope);
    const located = await this.findRecord("id", id);
    if (located === null) throw new NuttyError("NOT_FOUND", "Memory not found.");
    const currentVersion = located.record.last_modified_time;
    if (expectedVersion !== undefined && String(currentVersion) !== expectedVersion) {
      throw new NuttyError("CONFLICT", "The Feishu record changed since it was read.", {
        recoveryAction: "refresh_and_retry",
      });
    }
    const mapped = memoryToFeishuFields(memory, located.inspected);
    const record = await this.client.updateRecord(
      this.config.appToken,
      located.config.tableId,
      located.record.record_id,
      mapped.fields,
    );
    return this.toStoredMemory({ ...located, record }, mapped.skippedFields);
  }

  async delete(scope: StorageScope, id: string): Promise<void> {
    this.assertScope(scope);
    const located = await this.findRecord("id", id);
    if (located === null) return;
    await this.client.deleteRecord(
      this.config.appToken,
      located.config.tableId,
      located.record.record_id,
    );
  }

  async health(scope: StorageScope): Promise<StorageHealth> {
    this.assertScope(scope);
    try {
      const destination = await this.destination(scope);
      return {
        provider: "feishu",
        status: destination.status === "ready" ? "healthy" : "degraded",
        checkedAt: new Date().toISOString(),
        ...(destination.status === "ready"
          ? {}
          : { message: "Feishu schema requires attention." }),
      };
    } catch {
      return {
        provider: "feishu",
        status: "unavailable",
        checkedAt: new Date().toISOString(),
        message: "Feishu storage is unavailable.",
      };
    }
  }

  private assertScope(scope: StorageScope): void {
    if (scope.destinationId !== this.config.id) {
      throw new NuttyError("DESTINATION_NOT_FOUND", "Destination not found.", {
        recoveryAction: "choose_destination",
      });
    }
  }

  private async createUnlocked(
    memory: Memory,
    idempotencyKey: string,
  ): Promise<StoredMemory> {
    const table = await this.tableForMemory(memory.type);
    const mapped = memoryToFeishuFields(memory, table.inspected);
    try {
      const record = await this.client.createRecord(
        this.config.appToken,
        table.config.tableId,
        mapped.fields,
        { clientToken: uuidClientToken(idempotencyKey) },
      );
      return this.toStoredMemory({ ...table, record }, mapped.skippedFields);
    } catch (error) {
      if (error instanceof NuttyError && error.code === "PROVIDER_TIMEOUT") {
        const reconciled = await this.findRecord("id", memory.id);
        if (reconciled !== null) return this.toStoredMemory(reconciled, mapped.skippedFields);
      }
      throw error;
    }
  }

  private async findRecord(
    logicalField: "id" | "contentHash",
    value: string,
  ): Promise<LocatedRecord | null> {
    for (const table of await this.allTables()) {
      const page = await this.client.searchRecords(this.config.appToken, table.config.tableId, {
        pageSize: 2,
        filter: {
          conjunction: "and",
          conditions: [
            {
              field_name: table.inspected.fieldMap[logicalField],
              operator: "is",
              value: [value],
            },
          ],
        },
      });
      const record = page.items[0];
      if (record !== undefined) return { ...table, record };
    }
    return null;
  }

  private toStoredMemory(located: LocatedRecord, skippedFields: string[] = []): StoredMemory {
    try {
      const memory = feishuRecordToMemory(located.record, located.inspected, this.config);
      return {
        memory,
        ...(located.record.last_modified_time === undefined
          ? {}
          : { providerVersion: String(located.record.last_modified_time) }),
        ...(skippedFields.length === 0 ? {} : { skippedFields }),
        ...(located.inspected.missingOptionalFields.length === 0
          ? {}
          : {
              warnings: [
                `Optional Feishu fields are unavailable: ${located.inspected.missingOptionalFields.join(", ")}.`,
              ],
            }),
      };
    } catch (error) {
      throw new NuttyError("SCHEMA_MISMATCH", "A Feishu record is not valid Nutty data.", {
        recoveryAction: "fix_destination_schema",
        cause: error,
      });
    }
  }

  private async tableForMemory(type: MemoryType): Promise<TableContext> {
    if (this.config.profile === "unified") {
      return this.inspectTable(this.config.table);
    }
    const route = this.config.routes?.[type] ?? DEFAULT_LEGACY_ROUTES[type];
    return this.inspectTable(this.config.tables[route]);
  }

  private async searchTables(types: MemoryType[] | undefined): Promise<TableContext[]> {
    if (types === undefined || this.config.profile === "unified") return this.allTables();
    const legacyConfig = this.config;
    const names = new Set(
      types.map((type) => legacyConfig.routes?.[type] ?? DEFAULT_LEGACY_ROUTES[type]),
    );
    return Promise.all([...names].map((name) => this.inspectTable(legacyConfig.tables[name])));
  }

  private async allTables(): Promise<TableContext[]> {
    if (this.config.profile === "unified") return [await this.inspectTable(this.config.table)];
    return Promise.all(
      Object.values(this.config.tables).map((table) => this.inspectTable(table)),
    );
  }

  private async inspectTable(config: FeishuTableConfig): Promise<TableContext> {
    return {
      config,
      inspected: await this.schemaRegistry.inspect(
        this.config.appToken,
        config,
        this.config.profile,
      ),
    };
  }
}
