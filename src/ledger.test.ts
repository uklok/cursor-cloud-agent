import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readLedger, upsertLedger } from "./ledger.js";

describe("ledger", () => {
  it("upserts by agent id and caps at 50", () => {
    const path = join(mkdtempSync(join(tmpdir(), "cursor-cloud-")), "ledger.json");
    upsertLedger({ agentId: "bc-1", runId: "run-1", envId: "uklok-os" }, path, new Date("2026-01-01"));
    upsertLedger({ agentId: "bc-1", runId: "run-2", lastRunStatus: "FINISHED" }, path, new Date("2026-01-02"));
    const items = readLedger(path);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      agentId: "bc-1",
      runId: "run-2",
      envId: "uklok-os",
      lastRunStatus: "FINISHED",
    });
  });
});
