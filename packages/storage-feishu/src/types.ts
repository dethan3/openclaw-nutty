import type { MemoryType } from "@nutty/core";

export const LOGICAL_FIELDS = [
  "id",
  "title",
  "content",
  "userPrompt",
  "assistantResponse",
  "userNote",
  "summary",
  "type",
  "tags",
  "project",
  "captureMode",
  "sourceSurface",
  "sourceDetails",
  "sensitivity",
  "contentHash",
  "schemaVersion",
  "createdAt",
  "updatedAt",
] as const;

export type LogicalField = (typeof LOGICAL_FIELDS)[number];
export type FeishuFieldMap = Record<LogicalField, string>;

export const DEFAULT_UNIFIED_FIELD_MAP: FeishuFieldMap = {
  id: "Nutty ID",
  title: "Title",
  content: "Content",
  userPrompt: "User Prompt",
  assistantResponse: "Assistant Response",
  userNote: "User Note",
  summary: "Summary",
  type: "Type",
  tags: "Tags",
  project: "Project",
  captureMode: "Capture Mode",
  sourceSurface: "Source",
  sourceDetails: "Source Details",
  sensitivity: "Sensitivity",
  contentHash: "Content Hash",
  schemaVersion: "Schema Version",
  createdAt: "Created At",
  updatedAt: "Updated At",
};

export const DEFAULT_LEGACY_FIELD_MAP: FeishuFieldMap = {
  ...DEFAULT_UNIFIED_FIELD_MAP,
  content: "Raw Input",
  project: "Related Project",
};

export type FeishuTableConfig = {
  tableId: string;
  fieldMap?: Partial<FeishuFieldMap>;
};

export type LegacyTableName = "Inbox" | "Links" | "Ideas" | "Projects" | "Tasks";

export type UnifiedProfile = {
  profile: "unified";
  table: FeishuTableConfig;
};

export type LegacyProfile = {
  profile: "legacy";
  tables: Record<LegacyTableName, FeishuTableConfig>;
  routes?: Partial<Record<MemoryType, LegacyTableName>>;
};

export type FeishuDestinationConfig = {
  id: string;
  displayName: string;
  appToken: string;
  webBaseUrl?: string;
} & (UnifiedProfile | LegacyProfile);

export type FeishuField = {
  field_id: string;
  field_name: string;
  type: number;
  is_primary?: boolean;
};

export type FeishuRecord = {
  record_id: string;
  fields: Record<string, unknown>;
  created_time?: number | string;
  last_modified_time?: number | string;
};

export type FeishuRecordPage = {
  items: FeishuRecord[];
  pageToken?: string;
  hasMore: boolean;
};

export type FeishuFilter = {
  conjunction: "and" | "or";
  conditions: Array<{
    field_name: string;
    operator: "is" | "contains";
    value: string[];
  }>;
};

export interface FeishuClient {
  listFields(appToken: string, tableId: string): Promise<FeishuField[]>;
  searchRecords(
    appToken: string,
    tableId: string,
    options: { pageSize: number; pageToken?: string; filter?: FeishuFilter },
  ): Promise<FeishuRecordPage>;
  createRecord(
    appToken: string,
    tableId: string,
    fields: Record<string, unknown>,
    options?: { clientToken?: string },
  ): Promise<FeishuRecord>;
  updateRecord(
    appToken: string,
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>,
  ): Promise<FeishuRecord>;
  deleteRecord(appToken: string, tableId: string, recordId: string): Promise<void>;
}
