import { z } from "zod";

const environmentSchema = z
  .object({
    NUTTY_HOST: z.string().default("127.0.0.1"),
    NUTTY_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    NUTTY_ALLOWED_HOSTS: z.string().optional(),
    NUTTY_PERSONAL_TOKEN: z.string().min(32),
    NUTTY_PRINCIPAL_ID: z.string().min(1).default("personal"),
    NUTTY_CONFIRMATION_SECRET: z.string().min(32),
    NUTTY_DESTINATION_ID: z.string().min(1).default("feishu-default"),
    FEISHU_TRANSPORT: z.enum(["lark-cli", "openapi"]).default("lark-cli"),
    FEISHU_APP_ID: z.string().min(1).optional(),
    FEISHU_APP_SECRET: z.string().min(1).optional(),
    FEISHU_APP_TOKEN: z.string().min(1),
    FEISHU_TABLE_ID: z.string().min(1),
    FEISHU_API_BASE_URL: z.string().url().default("https://open.feishu.cn/open-apis"),
    FEISHU_WEB_BASE_URL: z.string().url().optional(),
    FEISHU_LARK_CLI_BINARY: z.string().min(1).default("lark-cli"),
    FEISHU_LARK_CLI_IDENTITY: z.enum(["user", "bot"]).default("user"),
    FEISHU_LARK_CLI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  })
  .superRefine((value, context) => {
    if (value.FEISHU_TRANSPORT !== "openapi") return;
    for (const field of ["FEISHU_APP_ID", "FEISHU_APP_SECRET"] as const) {
      if (value[field] === undefined) {
        context.addIssue({
          code: "custom",
          message: `${field} is required when FEISHU_TRANSPORT=openapi`,
          path: [field],
        });
      }
    }
  });

type FeishuCommonConfig = {
  appToken: string;
  tableId: string;
  webBaseUrl?: string;
};

export type ServerConfig = {
  host: string;
  port: number;
  allowedHosts?: string[];
  personalToken: string;
  principalId: string;
  confirmationSecret?: string;
  destinationId: string;
  feishu: FeishuCommonConfig &
    (
      | {
          transport: "lark-cli";
          binary: string;
          identity: "user" | "bot";
          timeoutMs: number;
        }
      | {
          transport: "openapi";
          appId: string;
          appSecret: string;
          apiBaseUrl: string;
        }
    );
};

export function loadServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const value = environmentSchema.parse(environment);
  const allowedHosts = value.NUTTY_ALLOWED_HOSTS?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const common = {
    appToken: value.FEISHU_APP_TOKEN,
    tableId: value.FEISHU_TABLE_ID,
    ...(value.FEISHU_WEB_BASE_URL === undefined
      ? {}
      : { webBaseUrl: value.FEISHU_WEB_BASE_URL }),
  };
  return {
    host: value.NUTTY_HOST,
    port: value.NUTTY_PORT,
    ...(allowedHosts === undefined || allowedHosts.length === 0 ? {} : { allowedHosts }),
    personalToken: value.NUTTY_PERSONAL_TOKEN,
    principalId: value.NUTTY_PRINCIPAL_ID,
    confirmationSecret: value.NUTTY_CONFIRMATION_SECRET,
    destinationId: value.NUTTY_DESTINATION_ID,
    feishu:
      value.FEISHU_TRANSPORT === "lark-cli"
        ? {
            ...common,
            transport: "lark-cli",
            binary: value.FEISHU_LARK_CLI_BINARY,
            identity: value.FEISHU_LARK_CLI_IDENTITY,
            timeoutMs: value.FEISHU_LARK_CLI_TIMEOUT_MS,
          }
        : {
            ...common,
            transport: "openapi",
            appId: value.FEISHU_APP_ID as string,
            appSecret: value.FEISHU_APP_SECRET as string,
            apiBaseUrl: value.FEISHU_API_BASE_URL,
          },
  };
}
