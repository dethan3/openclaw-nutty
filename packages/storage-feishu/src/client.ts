import { NuttyError } from "@nutty/core";
import { z } from "zod";

import type {
  FeishuClient,
  FeishuField,
  FeishuFilter,
  FeishuRecord,
  FeishuRecordPage,
} from "./types.js";

type TokenProvider = { token(): Promise<string> };

const envelopeSchema = z.object({
  code: z.number(),
  msg: z.string().optional(),
  data: z.unknown().optional(),
});

export class FeishuTenantTokenProvider implements TokenProvider {
  private cached: { token: string; expiresAt: number } | undefined;

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly apiBaseUrl = "https://open.feishu.cn/open-apis",
  ) {}

  async token(): Promise<string> {
    if (this.cached !== undefined && this.cached.expiresAt > Date.now() + 60_000) {
      return this.cached.token;
    }
    let response: Response;
    try {
      response = await fetch(`${this.apiBaseUrl}/auth/v3/tenant_access_token/internal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new NuttyError("PROVIDER_TIMEOUT", "Feishu authentication timed out.", {
        retryable: true,
        recoveryAction: "retry",
        cause: error,
      });
    }
    if (!response.ok) {
      throw new NuttyError("DESTINATION_UNAVAILABLE", "Unable to authenticate with Feishu.", {
        retryable: response.status >= 500,
      });
    }
    const payload = z
      .object({
        code: z.number(),
        tenant_access_token: z.string().optional(),
        expire: z.number().optional(),
      })
      .parse(await response.json());
    if (payload.code !== 0 || payload.tenant_access_token === undefined) {
      throw new NuttyError("DESTINATION_UNAVAILABLE", "Feishu authentication was rejected.");
    }
    this.cached = {
      token: payload.tenant_access_token,
      expiresAt: Date.now() + (payload.expire ?? 7_200) * 1_000,
    };
    return this.cached.token;
  }
}

export class FeishuHttpClient implements FeishuClient {
  constructor(
    private readonly tokenProvider: TokenProvider,
    private readonly apiBaseUrl = "https://open.feishu.cn/open-apis",
  ) {}

  async listFields(appToken: string, tableId: string): Promise<FeishuField[]> {
    const fields: FeishuField[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({ page_size: "100" });
      if (pageToken !== undefined) query.set("page_token", pageToken);
      const data = await this.request<{
        items?: FeishuField[];
        page_token?: string;
        has_more?: boolean;
      }>(
        "GET",
        `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields?${query.toString()}`,
      );
      fields.push(...(data.items ?? []));
      pageToken = data.has_more ? data.page_token : undefined;
    } while (pageToken !== undefined);
    return fields;
  }

  async searchRecords(
    appToken: string,
    tableId: string,
    options: { pageSize: number; pageToken?: string; filter?: FeishuFilter },
  ): Promise<FeishuRecordPage> {
    const query = new URLSearchParams({ page_size: String(options.pageSize) });
    if (options.pageToken !== undefined) query.set("page_token", options.pageToken);
    const data = await this.request<{
      items?: FeishuRecord[];
      page_token?: string;
      has_more?: boolean;
    }>(
      "POST",
      `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/search?${query.toString()}`,
      {
        automatic_fields: true,
        ...(options.filter === undefined ? {} : { filter: options.filter }),
      },
    );
    return {
      items: data.items ?? [],
      ...(data.page_token === undefined ? {} : { pageToken: data.page_token }),
      hasMore: data.has_more ?? false,
    };
  }

  async createRecord(
    appToken: string,
    tableId: string,
    fields: Record<string, unknown>,
    options: { clientToken?: string } = {},
  ): Promise<FeishuRecord> {
    const query = new URLSearchParams();
    if (options.clientToken !== undefined) query.set("client_token", options.clientToken);
    const suffix = query.size === 0 ? "" : `?${query.toString()}`;
    const data = await this.request<{ record: FeishuRecord }>(
      "POST",
      `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records${suffix}`,
      { fields },
    );
    return data.record;
  }

  async updateRecord(
    appToken: string,
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>,
  ): Promise<FeishuRecord> {
    const data = await this.request<{ record: FeishuRecord }>(
      "PUT",
      `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`,
      { fields },
    );
    return data.record;
  }

  async deleteRecord(appToken: string, tableId: string, recordId: string): Promise<void> {
    await this.request(
      "DELETE",
      `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`,
    );
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(`${this.apiBaseUrl}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${await this.tokenProvider.token()}`,
            "content-type": "application/json",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(15_000),
        });
        const rawPayload: unknown = await response.json().catch(() => ({}));
        const envelope = envelopeSchema.safeParse(rawPayload);
        const providerCode = envelope.success ? envelope.data.code : undefined;
        const retryableProviderCode =
          providerCode !== undefined && [1254112, 1254290, 1254291, 1254607].includes(providerCode);
        if (
          ([429, 500, 502, 503, 504].includes(response.status) || retryableProviderCode) &&
          attempt < 2
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100 * 3 ** attempt));
          continue;
        }
        if (envelope.success && envelope.data.code !== 0) {
          this.throwProviderError(envelope.data.code);
        }
        if (!response.ok) this.throwHttpError(response.status);
        if (!envelope.success) {
          throw new NuttyError("DESTINATION_UNAVAILABLE", "Feishu returned an invalid response.");
        }
        return envelope.data.data as T;
      } catch (error) {
        if (error instanceof NuttyError) throw error;
        const isNetworkFailure =
          error instanceof TypeError ||
          (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name));
        if (attempt < 2 && isNetworkFailure) {
          await new Promise((resolve) => setTimeout(resolve, 100 * 3 ** attempt));
          continue;
        }
        throw new NuttyError("PROVIDER_TIMEOUT", "Feishu did not respond in time.", {
          retryable: true,
          recoveryAction: "retry",
          cause: error,
        });
      }
    }
    throw new NuttyError("DESTINATION_UNAVAILABLE", "Feishu storage is unavailable.", {
      retryable: true,
    });
  }

  private throwHttpError(status: number): never {
    if (status === 429) {
      throw new NuttyError("RATE_LIMITED", "Feishu rate limit reached.", {
        retryable: true,
        recoveryAction: "retry",
      });
    }
    if (status === 401 || status === 403) {
      throw new NuttyError("FORBIDDEN", "Feishu credentials cannot access this Base.");
    }
    throw new NuttyError("DESTINATION_UNAVAILABLE", "Feishu storage is unavailable.", {
      retryable: status >= 500,
    });
  }

  private throwProviderError(code: number): never {
    if (code === 91403 || code === 99991672) {
      throw new NuttyError("FORBIDDEN", "Feishu credentials cannot access this Base.", {
        recoveryAction: "authenticate",
      });
    }
    if (code === 1254112 || code === 1254290) {
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
    if (code === 1254607) {
      throw new NuttyError("DESTINATION_UNAVAILABLE", "Feishu data is not ready yet.", {
        retryable: true,
        recoveryAction: "retry",
      });
    }
    throw new NuttyError("DESTINATION_UNAVAILABLE", "Feishu rejected the storage request.");
  }
}
