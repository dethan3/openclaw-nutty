import { describe, expect, it, vi } from "vitest";

import {
  FeishuLarkCliClient,
  LarkCliProcessRunner,
  type LarkCliJsonPayload,
  type LarkCliRunner,
} from "../src/index.js";

function fakeRunner() {
  const run = vi.fn<(args: string[], payload?: LarkCliJsonPayload) => Promise<unknown>>();
  return { run, runner: { run } satisfies LarkCliRunner };
}

const fieldList = {
  fields: [
    { id: "fld-title", name: "Title", type: "text" },
    { id: "fld-type", name: "Type", type: "select", multiple: false },
    { id: "fld-tags", name: "Tags", type: "select", multiple: true },
    { id: "fld-created", name: "Created At", type: "datetime" },
  ],
};

describe("FeishuLarkCliClient", () => {
  it("maps lark-cli field metadata to Feishu field types", async () => {
    const { run, runner } = fakeRunner();
    run.mockResolvedValue(fieldList);
    const client = new FeishuLarkCliClient({ runner });

    await expect(client.listFields("base-token", "table-id")).resolves.toEqual([
      { field_id: "fld-title", field_name: "Title", type: 1 },
      { field_id: "fld-type", field_name: "Type", type: 3 },
      { field_id: "fld-tags", field_name: "Tags", type: 4 },
      { field_id: "fld-created", field_name: "Created At", type: 5 },
    ]);
    expect(run).toHaveBeenCalledWith(
      expect.arrayContaining(["base", "+field-list", "--as", "user", "--format", "json"]),
      undefined,
    );
  });

  it("translates filters, matrix records, and offset pagination", async () => {
    const { run, runner } = fakeRunner();
    run.mockResolvedValue({
      fields: ["Nutty ID", "Title"],
      data: [["memory-id", "A durable memory"]],
      record_id_list: ["rec-1"],
      has_more: true,
    });
    const client = new FeishuLarkCliClient({ identity: "user", runner });

    await expect(
      client.searchRecords("base-token", "table-id", {
        pageSize: 20,
        pageToken: "40",
        filter: {
          conjunction: "and",
          conditions: [{ field_name: "Nutty ID", operator: "is", value: ["memory-id"] }],
        },
      }),
    ).resolves.toEqual({
      items: [
        {
          record_id: "rec-1",
          fields: { "Nutty ID": "memory-id", Title: "A durable memory" },
        },
      ],
      pageToken: "41",
      hasMore: true,
    });
    expect(run).toHaveBeenCalledWith(
      expect.arrayContaining(["+record-list", "--limit", "20", "--offset", "40"]),
      {
        flag: "--filter-json",
        value: { logic: "and", conditions: [["Nutty ID", "==", "memory-id"]] },
      },
    );
  });

  it("creates through a secure JSON payload and returns the submitted record", async () => {
    const { run, runner } = fakeRunner();
    run
      .mockResolvedValueOnce(fieldList)
      .mockResolvedValueOnce({ record_id_list: ["rec-created"] });
    const client = new FeishuLarkCliClient({ runner });

    await expect(
      client.createRecord("base-token", "table-id", {
        Title: "Saved",
        Type: "task",
        "Created At": Date.parse("2026-08-19T15:00:00+08:00"),
      }),
    ).resolves.toEqual({
      record_id: "rec-created",
      fields: {
        Title: "Saved",
        Type: ["task"],
        "Created At": expect.any(String),
      },
    });

    const createPayload = run.mock.calls[1]?.[1];
    expect(createPayload).toMatchObject({
      flag: "--json",
      value: { create_records: [{ Title: "Saved", Type: ["task"] }] },
    });
    expect(
      (createPayload?.value as { create_records: Array<Record<string, unknown>> }).create_records[0]?.[
        "Created At"
      ],
    ).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("reports a missing lark-cli binary as an unavailable destination", async () => {
    const runner = new LarkCliProcessRunner({ binary: "nutty-missing-lark-cli-binary" });
    await expect(runner.run(["base", "+field-list"])).rejects.toMatchObject({
      code: "DESTINATION_UNAVAILABLE",
    });
  });

  it("does not misclassify an ordinary non-zero exit as a timeout", async () => {
    const runner = new LarkCliProcessRunner({ binary: process.execPath });
    await expect(
      runner.run(["--eval", "process.stderr.write('ordinary failure'); process.exit(1)"]),
    ).rejects.toMatchObject({
      code: "DESTINATION_UNAVAILABLE",
    });
  });
});
