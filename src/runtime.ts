import { CursorCloudClient } from "./client.js";
import { resolveConfig, publicConfig, type PluginConfigSchema } from "./config.js";
import { ConfigError } from "./errors.js";
import { defaultLedgerPath } from "./paths.js";
import type { PluginConfig, ResolvedConfig } from "./types.js";

export type Runtime = {
  client: CursorCloudClient;
  config: ResolvedConfig;
  env: NodeJS.ProcessEnv;
  ledgerPath: string;
};

export function createRuntime(
  raw: PluginConfig | PluginConfigSchema | undefined,
  env: NodeJS.ProcessEnv = process.env,
  options: { fetch?: typeof fetch } = {},
): Runtime {
  const allowInsecureHost = env.CURSOR_CLOUD_ALLOW_INSECURE_HOST === "1";
  const config = resolveConfig(raw, { allowInsecureHost });
  const apiKey = env[config.apiKeyEnv]?.trim();
  if (!apiKey) {
    throw new ConfigError(
      `Missing ${config.apiKeyEnv}. Set it on the OpenClaw gateway environment; do not put the key in plugin config.`,
    );
  }
  return {
    client: new CursorCloudClient({
      apiKey,
      apiBaseUrl: env.CURSOR_CLOUD_API_BASE_URL?.trim() || config.apiBaseUrl,
      authScheme: config.authScheme,
      allowInsecureHost,
      fetch: options.fetch,
    }),
    config,
    env,
    ledgerPath: config.ledgerPath || defaultLedgerPath(),
  };
}

export function configForChild(runtime: Runtime): string {
  return JSON.stringify(publicConfig(runtime.config));
}
