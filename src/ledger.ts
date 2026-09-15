import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defaultLedgerPath, ensureDir } from "./paths.js";

export type LedgerEntry = {
  agentId: string;
  runId?: string;
  envId?: string;
  name?: string;
  url?: string;
  createdAt: string;
  updatedAt: string;
  lastRunStatus?: string;
};

const MAX_ENTRIES = 50;

export function readLedger(path = defaultLedgerPath()): LedgerEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { items?: LedgerEntry[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

export function upsertLedger(
  entry: Omit<LedgerEntry, "createdAt" | "updatedAt"> & { createdAt?: string },
  path = defaultLedgerPath(),
  now = new Date(),
): LedgerEntry[] {
  const iso = now.toISOString();
  const items = readLedger(path).filter((item) => item.agentId !== entry.agentId);
  const previous = readLedger(path).find((item) => item.agentId === entry.agentId);
  items.unshift({
    agentId: entry.agentId,
    runId: entry.runId ?? previous?.runId,
    envId: entry.envId ?? previous?.envId,
    name: entry.name ?? previous?.name,
    url: entry.url ?? previous?.url,
    createdAt: previous?.createdAt ?? entry.createdAt ?? iso,
    updatedAt: iso,
    lastRunStatus: entry.lastRunStatus ?? previous?.lastRunStatus,
  });
  const next = items.slice(0, MAX_ENTRIES);
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify({ items: next }, null, 2)}\n`, "utf8");
  return next;
}
