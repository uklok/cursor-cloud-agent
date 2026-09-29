#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import {
  agentsAction,
  cancelAction,
  envsAction,
  launchAction,
  listAction,
  meAction,
  modelsAction,
  replyAction,
  statusAction,
  watchForeground,
} from "./actions.js";
import { formatError } from "./errors.js";
import { TOOL_EFFORT_LEVELS } from "./model.js";
import { loadCliConfig } from "./load-config.js";
import { createRuntime } from "./runtime.js";
import { VERSION } from "./version.js";

type Flags = Record<string, string | boolean>;

async function main(argv = process.argv.slice(2)): Promise<void> {
  const { command, flags, rest } = parseArgs(argv);
  if (!command || command === "help" || flags.help === true) {
    printHelp();
    return;
  }
  if (command === "version" || flags.version === true) {
    console.log(VERSION);
    return;
  }
  const runtime = createRuntime(loadCliConfig());
  const prompt = readPrompt(flags, rest);

  switch (command) {
    case "launch":
      printJson(
        await launchAction(runtime, {
          prompt,
          env: str(flags.env),
          fresh: bool(flags.fresh),
          agentId: str(flags["agent-id"]),
          sessionName: str(flags["session-name"]),
          name: str(flags.name),
          model: str(flags.model),
          effort: str(flags.effort),
          fast: bool(flags.fast),
          mode: mode(flags.mode),
          repo: str(flags.repo),
          startingRef: str(flags["starting-ref"]),
          autoCreatePR: bool(flags["auto-create-pr"]),
          watch: flags.watch === undefined ? true : Boolean(flags.watch),
          idempotencyKey: str(flags["idempotency-key"]),
        }),
      );
      return;
    case "reply":
      printJson(
        await replyAction(runtime, {
          agentId: required(flags, "agent-id"),
          prompt,
          mode: mode(flags.mode),
          model: str(flags.model),
          effort: str(flags.effort),
          fast: bool(flags.fast),
          watch: flags.watch === undefined ? true : Boolean(flags.watch),
        }),
      );
      return;
    case "status":
      printJson(
        await statusAction(runtime, {
          agentId: required(flags, "agent-id"),
          runId: str(flags["run-id"]),
        }),
      );
      return;
    case "cancel":
      printJson(
        await cancelAction(runtime, {
          agentId: required(flags, "agent-id"),
          runId: str(flags["run-id"]),
        }),
      );
      return;
    case "watch":
      printJson(
        await watchForeground(runtime, {
          agentId: required(flags, "agent-id"),
          runId: str(flags["run-id"]),
        }),
      );
      return;
    case "list":
      printJson(await listAction(runtime, { limit: num(flags.limit) }));
      return;
    case "models":
      printJson(await modelsAction(runtime));
      return;
    case "me":
      printJson(await meAction(runtime));
      return;
    case "envs":
      printJson(
        await envsAction(runtime, {
          role: role(flags.role),
          project: str(flags.project),
          repo: str(flags.repo),
          refresh: bool(flags.refresh),
        }),
      );
      return;
    case "agents":
    case "ledger":
      printJson(
        agentsAction(runtime, {
          env: str(flags.env),
          project: str(flags.project),
          repo: str(flags.repo),
        }),
      );
      return;
    default:
      throw new Error(`Unknown command '${command}'. Try cursor-cloud help.`);
  }
}

function parseArgs(argv: string[]): { command?: string; flags: Flags; rest: string[] } {
  const flags: Flags = {};
  const rest: string[] = [];
  let command: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const [rawKey, inline] = token.slice(2).split("=", 2);
      if (inline !== undefined) {
        flags[rawKey] = coerce(inline);
        continue;
      }
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        flags[rawKey] = true;
      } else {
        flags[rawKey] = coerce(next);
        i += 1;
      }
      continue;
    }
    if (!command) {
      command = token;
    } else {
      rest.push(token);
    }
  }
  return { command, flags, rest };
}

function coerce(value: string): string | boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function str(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function num(value: string | boolean | undefined): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function bool(value: string | boolean | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === true || value === "true";
}

function required(flags: Flags, key: string): string {
  const value = str(flags[key]);
  if (!value) {
    throw new Error(`Missing --${key}`);
  }
  return value;
}

function mode(value: string | boolean | undefined): "agent" | "plan" | undefined {
  const raw = str(value);
  if (raw === "agent" || raw === "plan") return raw;
  return undefined;
}

function role(value: string | boolean | undefined): "base" | "project" | undefined {
  const raw = str(value);
  if (raw === "base" || raw === "project") return raw;
  return undefined;
}

function readPrompt(flags: Flags, rest: string[]): string {
  const file = str(flags["prompt-file"]);
  if (file) {
    return readFileSync(file, "utf8");
  }
  return str(flags.prompt) ?? rest.join(" ");
}

function printJson(value: unknown): void {
  writeFileSync(1, `${JSON.stringify(value, null, 2)}\n`);
}

function printHelp(): void {
  writeFileSync(
    1,
    `cursor-cloud ${VERSION}

Commands:
  launch   --env <id> --prompt <text> [--name] [--model] [--effort ${TOOL_EFFORT_LEVELS.join("|")}] [--fast] [--repo] [--watch]
  reply    --agent-id bc-… --prompt <text> [--mode] [--watch]
  status   --agent-id bc-… [--run-id run-…]
  cancel   --agent-id bc-… [--run-id run-…]
  watch    --agent-id bc-… [--run-id run-…]
  list     [--limit n]
  models
  me
  envs     [--refresh] [--role base|project] [--project <key>] [--repo <https-url>]
  agents   [--env <id>] [--project <key>] [--repo <https-url>]

Auth: CURSOR_API_KEY (or apiKeyEnv). Config: CURSOR_CLOUD_CONFIG or
~/.config/openclaw-cursor-cloud/config.json

OpenClaw setup: openclaw-cursor-cloud setup
MCP stdio: cursor-cloud-mcp
`,
  );
}

main().catch((error) => {
  printJson(formatError(error));
  process.exitCode = 1;
});
