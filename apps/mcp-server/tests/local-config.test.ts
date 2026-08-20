import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  defaultNuttyConfigPath,
  parseFeishuBaseUrl,
  readLocalNuttyConfig,
  writeLocalNuttyConfig,
} from "../src/local-config.js";

describe("local Nutty configuration", () => {
  it("uses the XDG config directory and supports an explicit override", () => {
    expect(defaultNuttyConfigPath({ XDG_CONFIG_HOME: "/tmp/config" }, "/home/test")).toBe(
      "/tmp/config/nutty/config.json",
    );
    expect(
      defaultNuttyConfigPath({ NUTTY_CONFIG_PATH: "/tmp/nutty.json" }, "/home/test"),
    ).toBe("/tmp/nutty.json");
  });

  it("extracts the Base and table identifiers from a Feishu URL", () => {
    expect(
      parseFeishuBaseUrl("https://example.feishu.cn/base/bascnExample?table=tblExample&view=vew1"),
    ).toEqual({
      appToken: "bascnExample",
      tableId: "tblExample",
      webBaseUrl: "https://example.feishu.cn/base",
      binary: "lark-cli",
      identity: "user",
      timeoutMs: 30_000,
    });
  });

  it("writes a private, round-trippable config file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nutty-config-test-"));
    const path = join(directory, "nested", "config.json");
    const config = {
      version: 1 as const,
      principalId: "personal",
      destinationId: "feishu-default",
      feishu: parseFeishuBaseUrl(
        "https://example.feishu.cn/base/bascnExample?table=tblExample",
      ),
    };

    await writeLocalNuttyConfig(path, config);

    expect(await readLocalNuttyConfig(path)).toEqual(config);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});
