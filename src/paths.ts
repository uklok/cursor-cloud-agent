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

export function defaultLedgerPath(): string {
  return join(stateDir(), "ledger.json");
}

export function defaultLockDir(): string {
  return join(stateDir(), "locks");
}
