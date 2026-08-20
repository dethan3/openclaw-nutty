import { NuttyError } from "@nutty/core";

import {
  defaultNuttyConfigPath,
  localConfigToServerConfig,
  parseFeishuBaseUrl,
  readLocalNuttyConfig,
  writeLocalNuttyConfig,
  type LocalNuttyConfig,
} from "./local-config.js";
import { createNuttyRuntime, type NuttyRuntime } from "./runtime.js";
import type { NuttyToolContext } from "./tools.js";

export type LocalRuntimeStatus = {
  configured: boolean;
  configPath: string;
  destinationId?: string;
  provider?: "feishu";
  health?: "healthy" | "degraded" | "unavailable";
};

export class LocalRuntimeManager {
  private runtime: NuttyRuntime | undefined;

  constructor(readonly configPath = defaultNuttyConfigPath()) {}

  async context(): Promise<NuttyToolContext> {
    const runtime = await this.getRuntime();
    return { service: runtime.service, principal: runtime.principal };
  }

  async status(): Promise<LocalRuntimeStatus> {
    const config = await readLocalNuttyConfig(this.configPath);
    if (config === null) return { configured: false, configPath: this.configPath };
    const runtime = this.runtime ?? createNuttyRuntime(localConfigToServerConfig(config));
    this.runtime = runtime;
    const health = await runtime.health();
    return {
      configured: true,
      configPath: this.configPath,
      destinationId: config.destinationId,
      provider: "feishu",
      health: health.status,
    };
  }

  async configureFromBaseUrl(baseUrl: string): Promise<LocalRuntimeStatus> {
    const config: LocalNuttyConfig = {
      version: 1,
      principalId: "personal",
      destinationId: "feishu-default",
      feishu: parseFeishuBaseUrl(baseUrl),
    };
    const runtime = createNuttyRuntime(localConfigToServerConfig(config));
    const health = await runtime.health();
    if (health.status === "unavailable") {
      throw new NuttyError(
        "DESTINATION_UNAVAILABLE",
        "Nutty could not access that Feishu table with the current lark-cli login.",
        { recoveryAction: "retry" },
      );
    }
    await writeLocalNuttyConfig(this.configPath, config);
    this.runtime = runtime;
    return {
      configured: true,
      configPath: this.configPath,
      destinationId: config.destinationId,
      provider: "feishu",
      health: health.status,
    };
  }

  private async getRuntime(): Promise<NuttyRuntime> {
    if (this.runtime !== undefined) return this.runtime;
    const config = await readLocalNuttyConfig(this.configPath);
    if (config === null) {
      throw new NuttyError(
        "DESTINATION_NOT_FOUND",
        "Nutty is not configured. Ask the user for the target Feishu Base table URL, then call configure_nutty.",
        { recoveryAction: "choose_destination" },
      );
    }
    this.runtime = createNuttyRuntime(localConfigToServerConfig(config));
    return this.runtime;
  }
}
