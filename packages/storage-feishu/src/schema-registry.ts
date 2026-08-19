import { NuttyError } from "@nutty/core";

import {
  DEFAULT_LEGACY_FIELD_MAP,
  DEFAULT_UNIFIED_FIELD_MAP,
  LOGICAL_FIELDS,
  type FeishuClient,
  type FeishuField,
  type FeishuFieldMap,
  type FeishuTableConfig,
} from "./types.js";

const REQUIRED_FIELDS = ["id", "title", "content", "contentHash"] as const;

const ACCEPTED_TYPES: Partial<Record<keyof FeishuFieldMap, readonly number[]>> = {
  id: [1],
  title: [1],
  content: [1],
  userPrompt: [1],
  assistantResponse: [1],
  userNote: [1],
  summary: [1],
  type: [1, 3],
  tags: [1, 4],
  project: [1, 3],
  captureMode: [1, 3],
  sourceSurface: [1, 3],
  sourceDetails: [1],
  sensitivity: [1, 3],
  contentHash: [1],
  schemaVersion: [1, 2],
  createdAt: [1, 5],
  updatedAt: [1, 5],
};

export type InspectedTable = {
  tableId: string;
  fieldMap: FeishuFieldMap;
  fields: ReadonlyMap<string, FeishuField>;
  missingOptionalFields: string[];
};

export class FeishuSchemaRegistry {
  private readonly cache = new Map<string, Promise<InspectedTable>>();

  constructor(private readonly client: FeishuClient) {}

  inspect(
    appToken: string,
    table: FeishuTableConfig,
    profile: "unified" | "legacy",
  ): Promise<InspectedTable> {
    const cacheKey = `${appToken}:${table.tableId}:${profile}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached;
    const inspection = this.inspectUncached(appToken, table, profile);
    this.cache.set(cacheKey, inspection);
    void inspection.catch(() => this.cache.delete(cacheKey));
    return inspection;
  }

  clear(): void {
    this.cache.clear();
  }

  private async inspectUncached(
    appToken: string,
    table: FeishuTableConfig,
    profile: "unified" | "legacy",
  ): Promise<InspectedTable> {
    const fieldMap: FeishuFieldMap = {
      ...(profile === "unified" ? DEFAULT_UNIFIED_FIELD_MAP : DEFAULT_LEGACY_FIELD_MAP),
      ...table.fieldMap,
    };
    const providerFields = await this.client.listFields(appToken, table.tableId);
    const fields = new Map(providerFields.map((field) => [field.field_name, field]));

    const missingRequired = REQUIRED_FIELDS.filter(
      (logicalField) => !fields.has(fieldMap[logicalField]),
    );
    if (missingRequired.length > 0) {
      throw new NuttyError(
        "SCHEMA_MISMATCH",
        `Feishu table is missing required Nutty fields: ${missingRequired.join(", ")}.`,
        { recoveryAction: "fix_destination_schema" },
      );
    }

    for (const logicalField of LOGICAL_FIELDS) {
      const providerField = fields.get(fieldMap[logicalField]);
      if (providerField === undefined) continue;
      const accepted = ACCEPTED_TYPES[logicalField];
      if (accepted !== undefined && !accepted.includes(providerField.type)) {
        throw new NuttyError(
          "SCHEMA_MISMATCH",
          `Feishu field ${fieldMap[logicalField]} has an incompatible field type.`,
          { recoveryAction: "fix_destination_schema" },
        );
      }
    }

    const missingOptionalFields = LOGICAL_FIELDS.filter(
      (logicalField) =>
        !REQUIRED_FIELDS.includes(logicalField as (typeof REQUIRED_FIELDS)[number]) &&
        !fields.has(fieldMap[logicalField]),
    );
    return { tableId: table.tableId, fieldMap, fields, missingOptionalFields };
  }
}
