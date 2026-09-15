import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME, VERSION } from "./version.js";

export const PLUGIN_ID = "cursor-cloud";

export type SetupSource = "link" | "npm" | "skip";

export type SetupResult = {
  ok: true;
  source: SetupSource;
  installed: boolean;
  alsoAllow: string[];
  skillEnabled: boolean;
  next: string[];
};

export function packageRoot(from = import.meta.url): string {
  return dirname(fileURLToPath(new URL("..", from)));
}

export function detectSetupSource(root = packageRoot()): SetupSource {
  return existsSync(join(root, "src", "plugin.ts")) ? "link" : "npm";
}

export function mergeAllowlist(current: unknown, extra: string): string[] {
  const list = Array.isArray(current) ? current.filter((item): item is string => typeof item === "string") : [];
  return list.includes(extra) ? list : [...list, extra];
}

export function installArgs(source: SetupSource, root: string, version = VERSION): string[] {
  const consent = ["--force", "--accept-capabilities", "--acknowledge-install-policy-warning"];
  if (source === "link") {
    return ["plugins", "install", "--link", ...consent, root];
  }
  if (source === "npm") {
    return ["plugins", "install", `npm:${PACKAGE_NAME}@${version}`, ...consent];
  }
  return [];
}

export async function setupGateway(
  options: {
    source?: SetupSource;
    env?: NodeJS.ProcessEnv;
    run?: typeof runOpenclaw;
  } = {},
): Promise<SetupResult> {
  const run = options.run ?? runOpenclaw;
  const env = options.env ?? process.env;
  const root = packageRoot();
  const source = options.source ?? detectSetupSource(root);
  let installed = false;
  const install = installArgs(source, root);
  if (install.length > 0) {
    await run(install, env);
    installed = true;
  }

  const currentAllow = await run(["config", "get", "tools.alsoAllow", "--json"], env).catch(() => "null");
  const alsoAllow = mergeAllowlist(parseJson(currentAllow), PLUGIN_ID);
  await run(["config", "set", "tools.alsoAllow", "--strict-json", JSON.stringify(alsoAllow)], env);
  await run(
    ["config", "set", "skills.entries.cursor-cloud", "--merge", "--strict-json", JSON.stringify({ enabled: true })],
    env,
  );
  await run(["plugins", "enable", PLUGIN_ID, "--accept-capabilities"], env).catch(() => undefined);

  return {
    ok: true,
    source,
    installed,
    alsoAllow,
    skillEnabled: true,
    next: [
      "Set CURSOR_API_KEY on the gateway environment (systemd EnvironmentFile), not in openclaw.json.",
      "Register envs in plugins.entries.cursor-cloud.config (see examples/gateway-plugin.json).",
      "Restart the gateway, open a new chat, then cursor_cloud_me, cursor_cloud_envs, and cursor_cloud_agents before launch.",
    ],
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function runOpenclaw(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("openclaw", args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `openclaw ${args.join(" ")} exited ${code}`));
    });
  });
}
