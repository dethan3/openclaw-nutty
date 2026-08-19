import {
  CURRENT_MEMORY_SCHEMA_VERSION,
  memorySchema,
  memorySourceSchema,
  type ExternalRef,
  type Memory,
} from "@nutty/core";

import type { InspectedTable } from "./schema-registry.js";
import type { FeishuDestinationConfig, FeishuRecord, LogicalField } from "./types.js";

function text(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null && "text" in item) {
          return typeof item.text === "string" ? item.text : "";
        }
        return "";
      })
      .filter(Boolean);
    return parts.length === 0 ? undefined : parts.join("");
  }
  return undefined;
}

function textList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(text).filter((item): item is string => item !== undefined);
  }
  const scalar = text(value);
  return scalar === undefined
    ? []
    : scalar
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function timestamp(value: unknown, fallback: unknown): string {
  const candidate = value ?? fallback;
  if (typeof candidate === "number" || /^\d+$/.test(String(candidate))) {
    return new Date(Number(candidate)).toISOString();
  }
  const scalar = text(candidate);
  return scalar === undefined ? new Date(0).toISOString() : new Date(scalar).toISOString();
}

function field(record: FeishuRecord, table: InspectedTable, logicalField: LogicalField): unknown {
  return record.fields[table.fieldMap[logicalField]];
}

function encode(value: unknown, fieldType: number): unknown {
  if (value === undefined) return undefined;
  if (fieldType === 5 && typeof value === "string") return Date.parse(value);
  if (fieldType === 2 && typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  if (fieldType === 1 && Array.isArray(value)) return value.join(", ");
  return value;
}

export function memoryToFeishuFields(
  memory: Memory,
  table: InspectedTable,
): { fields: Record<string, unknown>; skippedFields: string[] } {
  const values: Record<LogicalField, unknown> = {
    id: memory.id,
    title: memory.title,
    content: memory.content,
    userPrompt: memory.userPrompt,
    assistantResponse: memory.assistantResponse,
    userNote: memory.userNote,
    summary: memory.summary,
    type: memory.type,
    tags: memory.tags,
    project: memory.project,
    captureMode: memory.captureMode,
    sourceSurface: memory.source.surface,
    sourceDetails: JSON.stringify(memory.source),
    sensitivity: memory.sensitivity,
    contentHash: memory.contentHash,
    schemaVersion: String(memory.schemaVersion),
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
  const fields: Record<string, unknown> = {};
  const skippedFields: string[] = [];
  for (const [logicalField, value] of Object.entries(values) as Array<
    [LogicalField, unknown]
  >) {
    if (value === undefined) continue;
    const providerName = table.fieldMap[logicalField];
    const providerField = table.fields.get(providerName);
    if (providerField === undefined) {
      skippedFields.push(logicalField);
      continue;
    }
    fields[providerName] = encode(value, providerField.type);
  }
  return { fields, skippedFields };
}

function externalRef(
  destination: FeishuDestinationConfig,
  tableId: string,
  record: FeishuRecord,
): ExternalRef {
  const webUrl =
    destination.webBaseUrl === undefined
      ? undefined
      : `${destination.webBaseUrl.replace(/\/$/, "")}/${destination.appToken}?table=${encodeURIComponent(tableId)}&record=${encodeURIComponent(record.record_id)}`;
  return {
    destinationId: destination.id,
    provider: "feishu",
    externalId: record.record_id,
    ...(webUrl === undefined ? {} : { url: webUrl }),
    ...(record.last_modified_time === undefined
      ? {}
      : { providerVersion: String(record.last_modified_time) }),
    syncedAt: new Date().toISOString(),
  };
}

export function feishuRecordToMemory(
  record: FeishuRecord,
  table: InspectedTable,
  destination: FeishuDestinationConfig,
): Memory {
  const sourceDetails = text(field(record, table, "sourceDetails"));
  let source: unknown = {
    surface: text(field(record, table, "sourceSurface")) ?? "other",
  };
  if (sourceDetails !== undefined) {
    try {
      source = JSON.parse(sourceDetails);
    } catch {
      // Fall back to the separately stored surface field.
    }
  }
  const parsedSource = memorySourceSchema.parse(source);
  const createdAt = timestamp(field(record, table, "createdAt"), record.created_time);
  const updatedAt = timestamp(field(record, table, "updatedAt"), record.last_modified_time);

  const optional = (logicalField: LogicalField): string | undefined =>
    text(field(record, table, logicalField));
  return memorySchema.parse({
    id: text(field(record, table, "id")),
    title: text(field(record, table, "title")),
    content: text(field(record, table, "content")),
    ...(optional("userPrompt") === undefined ? {} : { userPrompt: optional("userPrompt") }),
    ...(optional("assistantResponse") === undefined
      ? {}
      : { assistantResponse: optional("assistantResponse") }),
    ...(optional("userNote") === undefined ? {} : { userNote: optional("userNote") }),
    ...(optional("summary") === undefined ? {} : { summary: optional("summary") }),
    type: text(field(record, table, "type")) ?? "inbox",
    tags: textList(field(record, table, "tags")),
    ...(optional("project") === undefined ? {} : { project: optional("project") }),
    captureMode: text(field(record, table, "captureMode")) ?? "manual",
    source: parsedSource,
    sensitivity: text(field(record, table, "sensitivity")) ?? "normal",
    contentHash: text(field(record, table, "contentHash")),
    schemaVersion: Number(
      text(field(record, table, "schemaVersion")) ?? CURRENT_MEMORY_SCHEMA_VERSION,
    ),
    createdAt,
    updatedAt: Date.parse(updatedAt) < Date.parse(createdAt) ? createdAt : updatedAt,
    externalRefs: [externalRef(destination, table.tableId, record)],
  });
}
