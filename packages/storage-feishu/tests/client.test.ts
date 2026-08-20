import { afterEach, describe, expect, it, vi } from "vitest";

import { FeishuHttpClient } from "../src/index.js";

const tokenProvider = { token: async () => "test-access-token" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("FeishuHttpClient", () => {
  it("uses the official record search shape and requests automatic fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ code: 0, msg: "success", data: { items: [], has_more: false } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new FeishuHttpClient(tokenProvider, "https://open.feishu.cn/open-apis");

    await client.searchRecords("base-token", "table-id", {
      pageSize: 20,
      filter: {
        conjunction: "and",
        conditions: [{ field_name: "Nutty ID", operator: "is", value: ["memory-id"] }],
      },
    });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/bitable/v1/apps/base-token/tables/table-id/records/search?page_size=20");
    expect(request.headers).toMatchObject({ authorization: "Bearer test-access-token" });
    expect(JSON.parse(String(request.body))).toMatchObject({
      automatic_fields: true,
      filter: { conjunction: "and" },
    });
  });

  it("passes the provider client_token when creating a record", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        code: 0,
        msg: "success",
        data: { record: { record_id: "record-1", fields: { Title: "Test" } } },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new FeishuHttpClient(tokenProvider);

    await client.createRecord("base-token", "table-id", { Title: "Test" }, {
      clientToken: "123e4567-e89b-42d3-a456-426614174000",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "records?client_token=123e4567-e89b-42d3-a456-426614174000",
    );
  });

  it("retries the documented Feishu rate-limit error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: 1254290, msg: "TooManyRequest" }))
      .mockResolvedValueOnce(jsonResponse({ code: 1254290, msg: "TooManyRequest" }))
      .mockResolvedValueOnce(
        jsonResponse({ code: 0, msg: "success", data: { items: [], has_more: false } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new FeishuHttpClient(tokenProvider);

    await client.searchRecords("base-token", "table-id", { pageSize: 20 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([91403, 99991672])(
    "maps Feishu permission error %s to FORBIDDEN",
    async (providerCode) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ code: providerCode, msg: "Forbidden" }));
      vi.stubGlobal("fetch", fetchMock);
      const client = new FeishuHttpClient(tokenProvider);

      await expect(
        client.createRecord("base-token", "table-id", { Title: "Test" }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        recoveryAction: "authenticate",
      });
    },
  );
});
