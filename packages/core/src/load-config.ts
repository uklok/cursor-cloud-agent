import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PluginConfig } from "./types.js";

export function loadCliConfig(env: NodeJS.ProcessEnv = process.env): PluginConfig {
  const inline = env.OPENCLAW_CURSOR_CLOUD_CONFIG_JSON?.trim();
  if (inline) {
    return JSON.parse(inline) as PluginConfig;
  }
  const path =
    env.CURSOR_CLOUD_CONFIG?.trim() ||
    env.OPENCLAW_CURSOR_CLOUD_CONFIG?.trim() ||
    join(homedir(), ".config/openclaw-cursor-cloud/config.json");
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PluginConfig;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" && !env.CURSOR_CLOUD_CONFIG && !env.OPENCLAW_CURSOR_CLOUD_CONFIG) {
      return {
        defaultEnv: env.CURSOR_CLOUD_DEFAULT_ENV,
        apiBaseUrl: env.CURSOR_CLOUD_API_BASE_URL,
        envs: {},
      };
    }
    throw error;
  }
}
