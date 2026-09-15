import { TimeoutError } from "./errors.js";
import type { CursorCloudClient } from "./client.js";
import { isTerminalRunStatus, type AgentRecord, type RunRecord, type WatchConfig } from "./types.js";

export type WatchTick = {
  agent: AgentRecord;
  run: RunRecord;
  poll: number;
};

export async function watchRun(
  client: CursorCloudClient,
  input: {
    agentId: string;
    runId?: string;
    watch: WatchConfig;
    signal?: AbortSignal;
    onTick?: (tick: WatchTick) => void;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  },
): Promise<{ agent: AgentRecord; run: RunRecord }> {
  const started = Date.now();
  let delay = input.watch.pollIntervalMs;
  let poll = 0;
  let runId = input.runId;

  while (true) {
    if (input.signal?.aborted) {
      throw new TimeoutError("Watch aborted");
    }
    if (Date.now() - started > input.watch.timeoutMs) {
      throw new TimeoutError(
        `Watch timed out after ${input.watch.timeoutMs}ms for ${input.agentId}${runId ? ` / ${runId}` : ""}`,
      );
    }

    const agent = await client.getAgent(input.agentId, input.signal);
    runId = runId ?? agent.latestRunId;
    if (!runId) {
      await (input.sleep ?? sleep)(delay, input.signal);
      delay = nextDelay(delay, input.watch.maxPollIntervalMs);
      continue;
    }

    const run = await client.getRun(input.agentId, runId, input.signal);
    poll += 1;
    input.onTick?.({ agent, run, poll });
    if (isTerminalRunStatus(run.status)) {
      return { agent, run };
    }

    await (input.sleep ?? sleep)(delay, input.signal);
    delay = nextDelay(delay, input.watch.maxPollIntervalMs);
  }
}

export function nextDelay(current: number, max: number): number {
  return Math.min(Math.round(current * 1.5), max);
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new TimeoutError("Watch aborted");
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new TimeoutError("Watch aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
