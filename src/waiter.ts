import { TimeoutError } from "./errors.js";
import type { CursorCloudClient } from "./client.js";
import type { SseEvent } from "./sse.js";
import { applyStreamEvent, emptyTranscript, type TranscriptState } from "./transcript.js";
import { isTerminalRunStatus, type AgentRecord, type RunRecord, type WatchConfig } from "./types.js";

export type WatchTick = {
  agent: AgentRecord;
  run: RunRecord;
  poll: number;
  transcript?: TranscriptState;
};

export async function watchRun(
  client: CursorCloudClient,
  input: {
    agentId: string;
    runId?: string;
    watch: WatchConfig;
    signal?: AbortSignal;
    transcript?: TranscriptState;
    onTick?: (tick: WatchTick) => void;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  },
): Promise<{ agent: AgentRecord; run: RunRecord; transcript?: TranscriptState }> {
  const started = Date.now();
  let delay = input.watch.pollIntervalMs;
  let poll = 0;
  let runId = input.runId;
  let transcript = input.transcript;

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

    transcript = transcript ?? emptyTranscript(runId, input.agentId);
    const remaining = input.watch.timeoutMs - (Date.now() - started);
    if (remaining > 1000 && typeof client.streamRun === "function") {
      const streamed = await watchViaStream(client, {
        agentId: input.agentId,
        runId,
        timeoutMs: remaining,
        signal: input.signal,
        transcript,
        onEvent: (state, runHint) => {
          poll += 1;
          input.onTick?.({
            agent: { ...agent, latestRunId: runId },
            run: runHint,
            poll,
            transcript: state,
          });
        },
      });
      if (streamed) {
        const latestAgent = await client.getAgent(input.agentId, input.signal).catch(() => agent);
        const run = await client.getRun(input.agentId, runId, input.signal);
        input.onTick?.({ agent: latestAgent, run, poll: poll + 1, transcript: streamed });
        return { agent: latestAgent, run, transcript: streamed };
      }
    }

    const run = await client.getRun(input.agentId, runId, input.signal);
    poll += 1;
    input.onTick?.({ agent, run, poll, transcript });
    if (isTerminalRunStatus(run.status)) {
      return { agent, run, transcript };
    }

    await (input.sleep ?? sleep)(delay, input.signal);
    delay = nextDelay(delay, input.watch.maxPollIntervalMs);
  }
}

async function watchViaStream(
  client: CursorCloudClient,
  input: {
    agentId: string;
    runId: string;
    timeoutMs: number;
    signal?: AbortSignal;
    transcript: TranscriptState;
    onEvent?: (state: TranscriptState, run: RunRecord) => void;
  },
): Promise<TranscriptState | undefined> {
  let state = input.transcript;
  try {
    for await (const event of client.streamRun(input.agentId, input.runId, {
      lastEventId: state.lastEventId,
      signal: input.signal,
      timeoutMs: input.timeoutMs,
    })) {
      state = applyStreamEvent(state, event);
      input.onEvent?.(state, runHint(input.runId, input.agentId, state, event));
      if (event.event === "result" || event.event === "done" || isTerminalRunStatus(state.runStatus)) {
        return state;
      }
    }
  } catch {
    return undefined;
  }
  return isTerminalRunStatus(state.runStatus) ? state : undefined;
}

function runHint(runId: string, agentId: string, state: TranscriptState, event: SseEvent): RunRecord {
  const data = event.data && typeof event.data === "object" ? (event.data as Record<string, unknown>) : {};
  const status =
    (typeof data.status === "string" && data.status) ||
    state.runStatus ||
    (event.event === "result" ? "FINISHED" : "RUNNING");
  return {
    id: runId,
    agentId,
    status,
    result: state.resultFinal ?? state.resultPartial,
  };
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
