import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Runtime } from "./runtime.js";

export type WatchHandle = {
  watching: boolean;
  alreadyWatching?: boolean;
  pid?: number;
  command: string[];
};

export function spawnWatch(
  runtime: Runtime,
  input: { agentId: string; runId?: string },
): WatchHandle {
  const cli = fileURLToPath(new URL("./cli.js", import.meta.url));
  const args = [cli, "watch", "--agent-id", input.agentId];
  if (input.runId) {
    args.push("--run-id", input.runId);
  }
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: "ignore",
    env: {
      ...runtime.env,
      [runtime.config.apiKeyEnv]: runtime.env[runtime.config.apiKeyEnv] ?? "",
      OPENCLAW_CURSOR_CLOUD_CONFIG_JSON: JSON.stringify({
        apiBaseUrl: runtime.config.apiBaseUrl,
        authScheme: runtime.config.authScheme,
        apiKeyEnv: runtime.config.apiKeyEnv,
        defaultEnv: runtime.config.defaultEnv,
        envs: runtime.config.envs,
        allowReposOnLaunch: runtime.config.allowReposOnLaunch,
        watch: runtime.config.watch,
        ledgerPath: runtime.ledgerPath,
      }),
    },
  });
  child.unref();
  return {
    watching: true,
    pid: child.pid,
    command: [process.execPath, ...args],
  };
}
