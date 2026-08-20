import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { NuttyError } from "@nutty/core";
import { z } from "zod";

import type { ServerConfig } from "./config.js";

const localConfigSchema = z
  .object({
    version: z.literal(1),
    principalId: z.string().min(1).default("personal"),
    destinationId: z.string().min(1).default("feishu-default"),
    feishu: z
      .object({
        appToken: z.string().min(1),
        tableId: z.string().min(1),
        webBaseUrl: z.string().url().optional(),
        binary: z.string().min(1).default("lark-cli"),
        identity: z.enum(["user", "bot"]).default("user"),
        timeoutMs: z.number().int().min(1_000).max(120_000).default(30_000),
      })
      .strict(),
  })
  .strict();

export type LocalNuttyConfig = z.output<typeof localConfigSchema>;

export function defaultNuttyConfigPath(
  environment: NodeJS.ProcessEnv = process.env,
  userHome: string = homedir(),
): string {
  if (environment.NUTTY_CONFIG_PATH !== undefined) {
    return environment.NUTTY_CONFIG_PATH;
  }
  const configRoot = environment.XDG_CONFIG_HOME ?? join(userHome, ".config");
  return join(configRoot, "nutty", "config.json");
}

export function parseFeishuBaseUrl(rawUrl: string): LocalNuttyConfig["feishu"] {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new NuttyError("INVALID_INPUT", "The Feishu Base URL is invalid.", { cause: error });
  }
  const baseIndex = url.pathname.split("/").findIndex((segment) => segment === "base");
  const appToken = url.pathname.split("/")[baseIndex + 1];
  const tableId = url.searchParams.get("table") ?? undefined;
  if (baseIndex < 0 || appToken === undefined || appToken.length === 0 || tableId === undefined) {
    throw new NuttyError(
      "INVALID_INPUT",
      "The URL must identify a Feishu Base and include its table query parameter.",
    );
  }
  return {
    appToken,
    tableId,
    webBaseUrl: `${url.protocol}//${url.host}/base`,
    binary: "lark-cli",
    identity: "user",
    timeoutMs: 30_000,
  };
}

export async function readLocalNuttyConfig(path: string): Promise<LocalNuttyConfig | null> {
  try {
    return localConfigSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new NuttyError("INVALID_INPUT", `Nutty configuration is invalid: ${path}`, {
        cause: error,
      });
    }
    throw error;
  }
}

export async function writeLocalNuttyConfig(
  path: string,
  input: LocalNuttyConfig,
): Promise<LocalNuttyConfig> {
  const config = localConfigSchema.parse(input);
  const directory = dirname(path);
  const temporaryPath = join(directory, `.config-${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporaryPath, path);
  await chmod(path, 0o600);
  return config;
}

export function localConfigToServerConfig(config: LocalNuttyConfig): ServerConfig {
  return {
    host: "127.0.0.1",
    port: 3000,
    personalToken: "local-stdio-does-not-use-http-authentication",
    principalId: config.principalId,
    destinationId: config.destinationId,
    feishu: {
      transport: "lark-cli",
      appToken: config.feishu.appToken,
      tableId: config.feishu.tableId,
      ...(config.feishu.webBaseUrl === undefined
        ? {}
        : { webBaseUrl: config.feishu.webBaseUrl }),
      binary: config.feishu.binary,
      identity: config.feishu.identity,
      timeoutMs: config.feishu.timeoutMs,
    },
  };
}
