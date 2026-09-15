import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function stateDir(override?: string): string {
  if (override) {
    return override;
  }
  const xdg = process.env.XDG_STATE_HOME?.trim();
  return xdg ? join(xdg, "openclaw-cursor-cloud") : join(homedir(), ".local/state/openclaw-cursor-cloud");
}

export function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

export function defaultAgentsPath(): string {
  return join(stateDir(), "agents.json");
}

/** @deprecated Use defaultAgentsPath. Kept so older ledgerPath overrides still resolve. */
export function defaultLedgerPath(): string {
  return defaultAgentsPath();
}

export function legacyLedgerPath(): string {
  return join(stateDir(), "ledger.json");
}

export function defaultLockDir(): string {
  return join(stateDir(), "locks");
}

export function defaultEnvCatalogPath(): string {
  return join(stateDir(), "envs.json");
}
