import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
import { sanitizeId } from "./ids.js";
import { defaultLockDir, ensureDir } from "./paths.js";

export type WatchLock = {
  acquired: boolean;
  path: string;
  reason?: "already-watching";
  release?: () => void;
};

export function isWatchLocked(agentId: string, dir = defaultLockDir()): boolean {
  const path = join(dir, `${sanitizeId(agentId)}.lock`);
  try {
    const pid = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
    return Number.isFinite(pid) && isAlive(pid);
  } catch {
    return false;
  }
}

export function tryAcquireWatchLock(agentId: string, dir = defaultLockDir()): WatchLock {
  ensureDir(dir);
  const path = join(dir, `${sanitizeId(agentId)}.lock`);
  try {
    const fd = openSync(path, "wx");
    writeSync(fd, `${process.pid}\n`);
    return {
      acquired: true,
      path,
      release: () => {
        try {
          closeSync(fd);
        } catch {
          // already closed
        }
        try {
          unlinkSync(path);
        } catch {
          // lost the file
        }
      },
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") {
      throw error;
    }
    const pid = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
    if (Number.isFinite(pid) && isAlive(pid)) {
      return { acquired: false, path, reason: "already-watching" };
    }
    try {
      unlinkSync(path);
    } catch {
      // raced
    }
    return tryAcquireWatchLock(agentId, dir);
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
