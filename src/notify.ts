import { spawn } from "node:child_process";
import type { AgentRecord, RunRecord } from "./types.js";
import { proofFromRun } from "./brief.js";
import { readLedger } from "./ledger.js";
import type { SessionRef } from "./placement.js";
import type { Runtime } from "./runtime.js";

const SAFE_PLACEHOLDERS = new Set(["agentId", "runId", "runStatus", "agentLifecycle", "url", "prUrl"]);
const SAFE_VALUE = /^[A-Za-z0-9._~:/#@!$&*+,;=%?[\]-]*$/;

export type NotifyValues = {
  agentId: string;
  runId: string;
  runStatus: string;
  agentLifecycle: string;
  url: string;
  prUrl: string;
  prUrls: string;
  result: string;
  json: string;
};

export function notifyValues(agent: AgentRecord, run: RunRecord): NotifyValues {
  const proof = proofFromRun(run);
  const payload = {
    agentId: agent.id,
    runId: run.id,
    runStatus: run.status ?? "",
    agentLifecycle: agent.status ?? "",
    url: agent.url ?? "",
    prUrl: proof.prUrls[0] ?? "",
    prUrls: proof.prUrls,
    result: run.result ?? "",
    durationMs: run.durationMs,
    branches: proof.branches,
  };
  return {
    agentId: payload.agentId,
    runId: payload.runId,
    runStatus: payload.runStatus,
    agentLifecycle: payload.agentLifecycle,
    url: payload.url,
    prUrl: payload.prUrl,
    prUrls: proof.prUrls.join(" "),
    result: payload.result,
    json: JSON.stringify(payload),
  };
}

export function interpolateSafe(template: string, values: NotifyValues): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (match, key: string) => {
    if (!SAFE_PLACEHOLDERS.has(key)) {
      return match;
    }
    const value = values[key as keyof NotifyValues] ?? "";
    return SAFE_VALUE.test(value) ? value : "";
  });
}

export function notifyEnv(values: NotifyValues): NodeJS.ProcessEnv {
  return {
    CURSOR_CLOUD_AGENT_ID: values.agentId,
    CURSOR_CLOUD_RUN_ID: values.runId,
    CURSOR_CLOUD_RUN_STATUS: values.runStatus,
    CURSOR_CLOUD_AGENT_LIFECYCLE: values.agentLifecycle,
    CURSOR_CLOUD_URL: values.url,
    CURSOR_CLOUD_PR_URL: values.prUrl,
    CURSOR_CLOUD_PR_URLS: values.prUrls,
    CURSOR_CLOUD_RESULT: values.result,
    CURSOR_CLOUD_JSON: values.json,
  };
}

export function defaultNotifyText(values: NotifyValues): string {
  const lines = [
    `Cursor Cloud ${values.runStatus || "update"} for ${values.agentId}`,
    values.url,
    values.prUrl,
    values.result ? values.result.slice(0, 500) : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export function sessionNotifyText(values: NotifyValues): string {
  return [
    `[cursor-cloud] Cloud run ${values.runStatus || "update"}`,
    `agent=${values.agentId}`,
    `run=${values.runId}`,
    values.url ? `url=${values.url}` : "",
    "Call cursor_cloud_status on that agentId now. Do not launch a new agent. Watch notify is not the transcript.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function sessionNotifyCommand(session: SessionRef, values: NotifyValues): string | undefined {
  const message = JSON.stringify(sessionNotifyText(values));
  if (session.sessionKey?.trim()) {
    return `openclaw agent --session-key ${JSON.stringify(session.sessionKey.trim())} --message ${message}`;
  }
  if (session.sessionId?.trim()) {
    return `openclaw agent --session-id ${JSON.stringify(session.sessionId.trim())} --message ${message}`;
  }
  return undefined;
}

export function resolveNotifyCommand(
  configured: string | undefined,
  values: NotifyValues,
  session: SessionRef = {},
): string | undefined {
  if (configured?.trim()) {
    return configured.trim();
  }
  const targeted = sessionNotifyCommand(session, values);
  if (targeted) {
    return targeted;
  }
  if (process.env.OPENCLAW_NOTIFY === "1") {
    return `openclaw message send --text ${JSON.stringify(defaultNotifyText(values))}`;
  }
  return undefined;
}

export function resolveWatchSession(
  runtime: Runtime,
  agentId: string,
  explicit: SessionRef = {},
): SessionRef {
  const fromLedger = readLedger(runtime.ledgerPath).find((item) => item.agentId === agentId);
  return {
    sessionId:
      explicit.sessionId?.trim() ||
      runtime.env.OPENCLAW_CURSOR_CLOUD_SESSION_ID?.trim() ||
      fromLedger?.sessionId,
    sessionKey:
      explicit.sessionKey?.trim() ||
      runtime.env.OPENCLAW_CURSOR_CLOUD_SESSION_KEY?.trim() ||
      fromLedger?.sessionKey,
  };
}

export async function runNotifyCommand(
  command: string | undefined,
  values: NotifyValues,
  options: { env?: NodeJS.ProcessEnv; spawnImpl?: typeof spawn; session?: SessionRef } = {},
): Promise<{ ran: boolean; command?: string; sessionTargeted?: boolean }> {
  const resolved = resolveNotifyCommand(command, values, options.session ?? {});
  if (!resolved) {
    return { ran: false };
  }
  const interpolated = interpolateSafe(resolved, values);
  await new Promise<void>((resolve, reject) => {
    const child = (options.spawnImpl ?? spawn)(interpolated, {
      shell: true,
      env: { ...process.env, ...options.env, ...notifyEnv(values) },
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || code === null) {
        resolve();
        return;
      }
      reject(new Error(`notify command exited ${code}`));
    });
  });
  return {
    ran: true,
    command: interpolated,
    sessionTargeted: Boolean(options.session?.sessionKey || options.session?.sessionId),
  };
}
