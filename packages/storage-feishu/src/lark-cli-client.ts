import { execFile, type ExecFileException } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NuttyError } from "@nutty/core";
import { z } from "zod";

import type {
  FeishuClient,
  FeishuField,
  FeishuFilter,
  FeishuRecord,
  FeishuRecordPage,
} from "./types.js";

export type LarkCliIdentity = "user" | "bot";

export type LarkCliJsonPayload = {
  flag: "--filter-json" | "--json";
  value: unknown;
};

export interface LarkCliRunner {
  run(args: string[], payload?: LarkCliJsonPayload): Promise<unknown>;
}

export type LarkCliProcessRunnerOptions = {
  binary?: string;
  timeoutMs?: number;
  maxBufferBytes?: number;
};

type ExecutionResult = {
  error: ExecFileException | null;
  stdout: string;
  stderr: string;
};

const envelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown() }).passthrough(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          type: z.string().optional(),
          subtype: z.string().optional(),
          code: z.number().optional(),
          message: z.string().optional(),
        })
        .passthrough(),
    })
    .passthrough(),
]);

const cliFieldListSchema = z.object({
  fields: z.array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        multiple: z.boolean().optional(),
      })
      .passthrough(),
  ),
});

const cliRecordMatrixSchema = z.object({
  data: z.array(z.array(z.unknown())),
  fields: z.array(z.string()),
  record_id_list: z.array(z.string()),
  has_more: z.boolean().optional(),
});

const cliCreateSchema = z.object({ record_id_list: z.array(z.string()).min(1) }).passthrough();

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function errorPayload(result: ExecutionResult): z.infer<typeof envelopeSchema> | undefined {
  for (const candidate of [result.stderr, result.stdout]) {
    const parsed = envelopeSchema.safeParse(parseJson(candidate.trim()));
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

function throwCliFailure(result: ExecutionResult): never {
  const payload = errorPayload(result);
  if (payload?.ok === false) {
    const { code, subtype, type } = payload.error;
    if (code === 1254290 || code === 1254112) {
      throw new NuttyError("RATE_LIMITED", "Feishu rate limit reached.", {
        retryable: true,
        recoveryAction: "retry",
      });
    }
    if (code === 1254291) {
      throw new NuttyError("CONFLICT", "Feishu reported a concurrent write conflict.", {
        retryable: true,
        recoveryAction: "retry",
      });
    }
    if (code === 91403 || code === 99991672 || subtype === "missing_scope") {
      throw new NuttyError("FORBIDDEN", "The lark-cli identity cannot access this Base.", {
        recoveryAction: "authenticate",
      });
    }
    if (type === "authorization" || type === "authentication") {
      throw new NuttyError("AUTH_REQUIRED", "lark-cli user authentication is required.", {
        recoveryAction: "authenticate",
      });
    }
    if (type === "confirmation") {
      throw new NuttyError("FORBIDDEN", "The lark-cli operation requires explicit confirmation.");
    }
    if (type === "network") {
      throw new NuttyError("DESTINATION_UNAVAILABLE", "lark-cli could not reach Feishu.", {
        retryable: true,
        recoveryAction: "retry",
      });
    }
  }

  if (result.error?.code === "ENOENT") {
    throw new NuttyError("DESTINATION_UNAVAILABLE", "lark-cli is not installed or not on PATH.", {
      recoveryAction: "authenticate",
    });
  }
  if (result.error?.killed || result.error?.signal !== undefined) {
    throw new NuttyError("PROVIDER_TIMEOUT", "lark-cli did not respond in time.", {
      retryable: true,
      recoveryAction: "retry",
    });
  }
  throw new NuttyError("DESTINATION_UNAVAILABLE", "lark-cli could not complete the Feishu request.");
}

function execute(
  binary: string,
  args: string[],
  options: { cwd?: string; timeoutMs: number; maxBufferBytes: number },
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    execFile(
      binary,
      args,
      {
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        encoding: "utf8",
        env: {
          ...process.env,
          LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
          LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
        },
        maxBuffer: options.maxBufferBytes,
        timeout: options.timeoutMs,
      },
      (error, stdout, stderr) => {
        resolve({ error, stdout, stderr });
      },
    );
  });
}

export class LarkCliProcessRunner implements LarkCliRunner {
  private readonly binary: string;
  private readonly timeoutMs: number;
  private readonly maxBufferBytes: number;

  constructor(options: LarkCliProcessRunnerOptions = {}) {
    this.binary = options.binary ?? "lark-cli";
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxBufferBytes = options.maxBufferBytes ?? 10 * 1024 * 1024;
  }

  async run(args: string[], payload?: LarkCliJsonPayload): Promise<unknown> {
    let temporaryDirectory: string | undefined;
    try {
      const commandArgs = [...args];
      let cwd: string | undefined;
      if (payload !== undefined) {
        temporaryDirectory = await mkdtemp(join(tmpdir(), "nutty-lark-cli-"));
        const filename = "payload.json";
        await writeFile(join(temporaryDirectory, filename), JSON.stringify(payload.value), {
          encoding: "utf8",
          mode: 0o600,
        });
        commandArgs.push(payload.flag, `@${filename}`);
        cwd = temporaryDirectory;
      }

      const result = await execute(this.binary, commandArgs, {
        ...(cwd === undefined ? {} : { cwd }),
        timeoutMs: this.timeoutMs,
        maxBufferBytes: this.maxBufferBytes,
      });
      if (result.error !== null) throwCliFailure(result);
      const envelope = envelopeSchema.safeParse(parseJson(result.stdout.trim()));
      if (!envelope.success) {
        throw new NuttyError("DESTINATION_UNAVAILABLE", "lark-cli returned invalid JSON.");
      }
      if (!envelope.data.ok) throwCliFailure(result);
      return envelope.data.data;
    } finally {
      if (temporaryDirectory !== undefined) {
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    }
  }
}

type CliField = z.infer<typeof cliFieldListSchema>["fields"][number];

function feishuFieldType(field: CliField): number {
  switch (field.type) {
    case "text":
    case "phone":
    case "url":
      return 1;
    case "number":
      return 2;
    case "select":
      return field.multiple === true ? 4 : 3;
    case "datetime":
      return 5;
    default:
      return 0;
  }
}

function localDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function filterPayload(filter: FeishuFilter): unknown {
  return {
    logic: filter.conjunction,
    conditions: filter.conditions.map((condition) => [
      condition.field_name,
      condition.operator === "is" ? "==" : "intersects",
      condition.value.length === 1 ? condition.value[0] : condition.value,
    ]),
  };
}

function recordsFromMatrix(value: unknown): {
  records: FeishuRecord[];
  hasMore: boolean;
} {
  const matrix = cliRecordMatrixSchema.parse(value);
  const records = matrix.record_id_list.map((recordId, rowIndex) => {
    const row = matrix.data[rowIndex] ?? [];
    const fields = Object.fromEntries(
      matrix.fields.map((fieldName, columnIndex) => [fieldName, row[columnIndex] ?? null]),
    );
    return { record_id: recordId, fields };
  });
  return { records, hasMore: matrix.has_more ?? false };
}

export type FeishuLarkCliClientOptions = {
  binary?: string;
  identity?: LarkCliIdentity;
  timeoutMs?: number;
  runner?: LarkCliRunner;
};

export class FeishuLarkCliClient implements FeishuClient {
  private readonly identity: LarkCliIdentity;
  private readonly runner: LarkCliRunner;
  private readonly fieldDefinitions = new Map<string, Map<string, CliField>>();

  constructor(options: FeishuLarkCliClientOptions = {}) {
    this.identity = options.identity ?? "user";
    this.runner =
      options.runner ??
      new LarkCliProcessRunner({
        ...(options.binary === undefined ? {} : { binary: options.binary }),
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      });
  }

  async listFields(appToken: string, tableId: string): Promise<FeishuField[]> {
    const result = cliFieldListSchema.parse(
      await this.call("+field-list", appToken, tableId),
    );
    this.fieldDefinitions.set(
      this.tableKey(appToken, tableId),
      new Map(result.fields.map((field) => [field.name, field])),
    );
    return result.fields.map((field) => ({
      field_id: field.id,
      field_name: field.name,
      type: feishuFieldType(field),
    }));
  }

  async searchRecords(
    appToken: string,
    tableId: string,
    options: { pageSize: number; pageToken?: string; filter?: FeishuFilter },
  ): Promise<FeishuRecordPage> {
    const offset = options.pageToken === undefined ? 0 : Number.parseInt(options.pageToken, 10);
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new NuttyError("INVALID_INPUT", "The lark-cli record cursor is invalid.");
    }
    const result = await this.call(
      "+record-list",
      appToken,
      tableId,
      ["--limit", String(options.pageSize), "--offset", String(offset)],
      options.filter === undefined
        ? undefined
        : { flag: "--filter-json", value: filterPayload(options.filter) },
    );
    const { records, hasMore } = recordsFromMatrix(result);
    const canContinue = hasMore && records.length > 0;
    return {
      items: records,
      ...(canContinue ? { pageToken: String(offset + records.length) } : {}),
      hasMore: canContinue,
    };
  }

  async createRecord(
    appToken: string,
    tableId: string,
    fields: Record<string, unknown>,
    _options: { clientToken?: string } = {},
  ): Promise<FeishuRecord> {
    const normalizedFields = await this.normalizeFields(appToken, tableId, fields);
    const created = cliCreateSchema.parse(
      await this.call("+record-batch-create", appToken, tableId, [], {
        flag: "--json",
        value: { create_records: [normalizedFields] },
      }),
    );
    const recordId = created.record_id_list[0];
    if (recordId === undefined) {
      throw new NuttyError("PARTIAL_WRITE", "lark-cli did not return the created record ID.");
    }
    return { record_id: recordId, fields: normalizedFields };
  }

  async updateRecord(
    appToken: string,
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>,
  ): Promise<FeishuRecord> {
    const normalizedFields = await this.normalizeFields(appToken, tableId, fields);
    await this.call("+record-batch-update", appToken, tableId, [], {
      flag: "--json",
      value: { update_records: { [recordId]: normalizedFields } },
    });
    return { record_id: recordId, fields: normalizedFields };
  }

  async deleteRecord(appToken: string, tableId: string, recordId: string): Promise<void> {
    await this.call("+record-delete", appToken, tableId, ["--record-id", recordId]);
  }

  private async normalizeFields(
    appToken: string,
    tableId: string,
    fields: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const key = this.tableKey(appToken, tableId);
    if (!this.fieldDefinitions.has(key)) await this.listFields(appToken, tableId);
    const definitions = this.fieldDefinitions.get(key) ?? new Map<string, CliField>();
    return Object.fromEntries(
      Object.entries(fields).map(([name, value]) => {
        const definition = definitions.get(name);
        if (definition?.type === "datetime" && typeof value === "number") {
          return [name, localDateTime(value)];
        }
        if (definition?.type === "select" && value !== null && !Array.isArray(value)) {
          return [name, [value]];
        }
        return [name, value];
      }),
    );
  }

  private call(
    command: string,
    appToken: string,
    tableId: string,
    args: string[] = [],
    payload?: LarkCliJsonPayload,
  ): Promise<unknown> {
    return this.runner.run(
      [
        "base",
        command,
        "--base-token",
        appToken,
        "--table-id",
        tableId,
        ...args,
        "--as",
        this.identity,
        "--format",
        "json",
      ],
      payload,
    );
  }

  private tableKey(appToken: string, tableId: string): string {
    return `${appToken}:${tableId}`;
  }
}
