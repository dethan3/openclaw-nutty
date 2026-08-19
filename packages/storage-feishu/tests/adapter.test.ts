import {
  CURRENT_MEMORY_SCHEMA_VERSION,
  type Memory,
  type StorageScope,
} from "@nutty/core";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LEGACY_FIELD_MAP,
  DEFAULT_UNIFIED_FIELD_MAP,
  FeishuStorageAdapter,
  LOGICAL_FIELDS,
  type FeishuClient,
  type FeishuField,
  type FeishuFilter,
  type FeishuRecord,
  type FeishuRecordPage,
} from "../src/index.js";

const fieldTypes = {
  type: 3,
  tags: 4,
  captureMode: 3,
  sourceSurface: 3,
  sensitivity: 3,
  schemaVersion: 2,
  createdAt: 5,
  updatedAt: 5,
} as const;

function fieldsFor(profile: "unified" | "legacy"): FeishuField[] {
  const map = profile === "unified" ? DEFAULT_UNIFIED_FIELD_MAP : DEFAULT_LEGACY_FIELD_MAP;
  return LOGICAL_FIELDS.map((logicalField, index) => ({
    field_id: `field-${index}`,
    field_name: map[logicalField],
    type: fieldTypes[logicalField as keyof typeof fieldTypes] ?? 1,
  }));
}

class FakeFeishuClient implements FeishuClient {
  readonly records = new Map<string, FeishuRecord[]>();
  readonly fields = new Map<string, FeishuField[]>();
  lastCreatedTable: string | undefined;
  lastClientToken: string | undefined;

  async listFields(_appToken: string, tableId: string): Promise<FeishuField[]> {
    return this.fields.get(tableId) ?? [];
  }

  async searchRecords(
    _appToken: string,
    tableId: string,
    options: { pageSize: number; pageToken?: string; filter?: FeishuFilter },
  ): Promise<FeishuRecordPage> {
    let records = this.records.get(tableId) ?? [];
    const condition = options.filter?.conditions[0];
    if (condition !== undefined) {
      records = records.filter((record) =>
        condition.value.includes(String(record.fields[condition.field_name])),
      );
    }
    const offset = Number(options.pageToken ?? "0");
    const items = records.slice(offset, offset + options.pageSize);
    const next = offset + items.length;
    return {
      items,
      ...(next < records.length ? { pageToken: String(next) } : {}),
      hasMore: next < records.length,
    };
  }

  async createRecord(
    _appToken: string,
    tableId: string,
    fields: Record<string, unknown>,
    options?: { clientToken?: string },
  ): Promise<FeishuRecord> {
    this.lastCreatedTable = tableId;
    this.lastClientToken = options?.clientToken;
    const now = Date.parse("2026-08-19T02:00:00.000Z");
    const record = {
      record_id: `record-${(this.records.get(tableId)?.length ?? 0) + 1}`,
      fields,
      created_time: now,
      last_modified_time: now,
    };
    this.records.set(tableId, [...(this.records.get(tableId) ?? []), record]);
    return record;
  }

  async updateRecord(
    _appToken: string,
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>,
  ): Promise<FeishuRecord> {
    const records = this.records.get(tableId) ?? [];
    const index = records.findIndex((record) => record.record_id === recordId);
    const current = records[index];
    if (current === undefined) throw new Error("record missing");
    const updated = { ...current, fields, last_modified_time: Number(current.last_modified_time) + 1 };
    records[index] = updated;
    return updated;
  }

  async deleteRecord(_appToken: string, tableId: string, recordId: string): Promise<void> {
    this.records.set(
      tableId,
      (this.records.get(tableId) ?? []).filter((record) => record.record_id !== recordId),
    );
  }
}

const scope: StorageScope = {
  principal: { id: "test-user" },
  destinationId: "feishu-test",
};

const memory: Memory = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  title: "Nutty architecture",
  content: "Keep adapters outside Core.",
  type: "decision",
  tags: ["architecture"],
  captureMode: "previous_answer",
  source: { surface: "codex", assistantMessageId: "message-1" },
  sensitivity: "normal",
  contentHash: "a".repeat(64),
  schemaVersion: CURRENT_MEMORY_SCHEMA_VERSION,
  createdAt: "2026-08-19T02:00:00.000Z",
  updatedAt: "2026-08-19T02:00:00.000Z",
  externalRefs: [],
};

describe("FeishuStorageAdapter", () => {
  it("checks unified schema and implements the StoragePort lifecycle", async () => {
    const client = new FakeFeishuClient();
    client.fields.set("memories", fieldsFor("unified"));
    const adapter = new FeishuStorageAdapter(client, {
      id: scope.destinationId,
      displayName: "Feishu test",
      appToken: "app-token",
      profile: "unified",
      table: { tableId: "memories" },
    });

    const destination = await adapter.destination(scope);
    expect(destination.status).toBe("ready");

    const created = await adapter.create(scope, memory, { idempotencyKey: "save-1" });
    expect(created.memory.externalRefs[0]?.externalId).toBe("record-1");
    expect(client.lastClientToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect((await adapter.findByHash(scope, memory.contentHash))?.memory.id).toBe(memory.id);
    expect((await adapter.get(scope, memory.id))?.memory.content).toBe(memory.content);

    const search = await adapter.search(scope, { text: "adapters", limit: 20 });
    expect(search.items).toHaveLength(1);

    const changed: Memory = { ...memory, title: "Updated architecture" };
    const updated = await adapter.update(
      scope,
      memory.id,
      changed,
      created.providerVersion,
    );
    expect(updated.memory.title).toBe("Updated architecture");

    await adapter.delete(scope, memory.id);
    expect(await adapter.get(scope, memory.id)).toBeNull();
  });

  it("keeps legacy table routing inside the adapter", async () => {
    const client = new FakeFeishuClient();
    for (const table of ["Inbox", "Links", "Ideas", "Projects", "Tasks"] as const) {
      client.fields.set(table, fieldsFor("legacy"));
    }
    const adapter = new FeishuStorageAdapter(client, {
      id: scope.destinationId,
      displayName: "Legacy Feishu",
      appToken: "app-token",
      profile: "legacy",
      tables: {
        Inbox: { tableId: "Inbox" },
        Links: { tableId: "Links" },
        Ideas: { tableId: "Ideas" },
        Projects: { tableId: "Projects" },
        Tasks: { tableId: "Tasks" },
      },
    });

    await adapter.create(scope, { ...memory, type: "task" }, { idempotencyKey: "task-save" });
    expect(client.lastCreatedTable).toBe("Tasks");
  });

  it("reports configuration_required when required fields are absent", async () => {
    const client = new FakeFeishuClient();
    client.fields.set(
      "memories",
      fieldsFor("unified").filter((field) => field.field_name !== "Content Hash"),
    );
    const adapter = new FeishuStorageAdapter(client, {
      id: scope.destinationId,
      displayName: "Broken Feishu",
      appToken: "app-token",
      profile: "unified",
      table: { tableId: "memories" },
    });
    expect((await adapter.destination(scope)).status).toBe("configuration_required");
  });
});
