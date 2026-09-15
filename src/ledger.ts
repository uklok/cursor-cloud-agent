import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defaultAgentsPath, ensureDir, legacyLedgerPath } from "./paths.js";
import type { EnvRole } from "./types.js";

export type LedgerEntry = {
  agentId: string;
  runId?: string;
  envId?: string;
  envName?: string;
  envRole?: EnvRole;
  project?: string;
  repo?: string;
  name?: string;
  url?: string;
  sessionId?: string;
  sessionKey?: string;
  createdAt: string;
  updatedAt: string;
  lastRunStatus?: string;
};

const MAX_ENTRIES = 50;

export function readLedger(path = defaultAgentsPath()): LedgerEntry[] {
  const fromPath = readItems(path);
  if (fromPath) {
    return fromPath;
  }
  if (path === defaultAgentsPath()) {
    return readItems(legacyLedgerPath()) ?? [];
  }
  return [];
}

export function upsertLedger(
  entry: Omit<LedgerEntry, "createdAt" | "updatedAt"> & { createdAt?: string },
  path = defaultAgentsPath(),
  now = new Date(),
): LedgerEntry[] {
  const iso = now.toISOString();
  const current = readLedger(path);
  const previous = current.find((item) => item.agentId === entry.agentId);
  const items = current.filter((item) => item.agentId !== entry.agentId);
  items.unshift({
    agentId: entry.agentId,
    runId: entry.runId ?? previous?.runId,
    envId: entry.envId ?? previous?.envId,
    envName: entry.envName ?? previous?.envName,
    envRole: entry.envRole ?? previous?.envRole,
    project: entry.project ?? previous?.project,
    repo: entry.repo ?? previous?.repo,
    name: entry.name ?? previous?.name,
    url: entry.url ?? previous?.url,
    sessionId: entry.sessionId ?? previous?.sessionId,
    sessionKey: entry.sessionKey ?? previous?.sessionKey,
    createdAt: previous?.createdAt ?? entry.createdAt ?? iso,
    updatedAt: iso,
    lastRunStatus: entry.lastRunStatus ?? previous?.lastRunStatus,
  });
  const next = items.slice(0, MAX_ENTRIES);
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify({ items: next }, null, 2)}\n`, "utf8");
  return next;
}

export function agentsForTarget(
  path: string,
  params: { envId?: string; repo?: string; project?: string },
): LedgerEntry[] {
  return readLedger(path).filter((item) => {
    if (params.envId && item.envId !== params.envId) return false;
    if (params.project && item.project !== params.project) return false;
    if (params.repo && item.repo && item.repo !== params.repo) return false;
    return Boolean(params.envId || params.project || params.repo || item.agentId);
  });
}

function readItems(path: string): LedgerEntry[] | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { items?: LedgerEntry[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}
