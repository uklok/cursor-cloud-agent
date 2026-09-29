import { describe, expect, it } from "vitest";
import { TimeoutError } from "./errors.js";
import type { CursorCloudClient } from "./client.js";
import { DEFAULT_WATCH } from "./config.js";
import { watchRun } from "./waiter.js";

describe("watchRun", () => {
  it("returns when the run is terminal", async () => {
    const statuses = ["RUNNING", "FINISHED"];
    const client = {
      getAgent: async () => ({ id: "bc-1", latestRunId: "run-1", status: "ACTIVE" }),
      getRun: async () => ({ id: "run-1", status: statuses.shift() }),
    } as unknown as CursorCloudClient;
    const result = await watchRun(client, {
      agentId: "bc-1",
      watch: { ...DEFAULT_WATCH, pollIntervalMs: 1, timeoutMs: 1000 },
      sleep: async () => undefined,
    });
    expect(result.run.status).toBe("FINISHED");
  });

  it("times out while still running", async () => {
    const client = {
      getAgent: async () => ({ id: "bc-1", latestRunId: "run-1" }),
      getRun: async () => ({ id: "run-1", status: "RUNNING" }),
    } as unknown as CursorCloudClient;
    await expect(
      watchRun(client, {
        agentId: "bc-1",
        watch: { ...DEFAULT_WATCH, pollIntervalMs: 1, timeoutMs: 5 },
        sleep: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });
});
