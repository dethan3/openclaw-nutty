import { describe, expect, it } from "vitest";

import { loadServerConfig } from "../src/config.js";

const common = {
  NUTTY_PERSONAL_TOKEN: "personal-token-that-is-long-enough",
  NUTTY_CONFIRMATION_SECRET: "confirmation-secret-that-is-long-enough",
  FEISHU_APP_TOKEN: "base-token",
  FEISHU_TABLE_ID: "table-id",
};

describe("loadServerConfig", () => {
  it("defaults to local lark-cli without requiring an app secret", () => {
    expect(loadServerConfig(common).feishu).toEqual({
      transport: "lark-cli",
      appToken: "base-token",
      tableId: "table-id",
      binary: "lark-cli",
      identity: "user",
      timeoutMs: 30_000,
    });
  });

  it("loads direct OpenAPI credentials only for openapi transport", () => {
    expect(
      loadServerConfig({
        ...common,
        FEISHU_TRANSPORT: "openapi",
        FEISHU_APP_ID: "app-id",
        FEISHU_APP_SECRET: "app-secret",
      }).feishu,
    ).toEqual({
      transport: "openapi",
      appToken: "base-token",
      tableId: "table-id",
      appId: "app-id",
      appSecret: "app-secret",
      apiBaseUrl: "https://open.feishu.cn/open-apis",
    });
  });

  it("rejects openapi transport without an app secret", () => {
    expect(() =>
      loadServerConfig({ ...common, FEISHU_TRANSPORT: "openapi", FEISHU_APP_ID: "app-id" }),
    ).toThrow(/FEISHU_APP_SECRET/);
  });
});
