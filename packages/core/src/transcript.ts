import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ensureDir } from "./paths.js";
import type { SseEvent } from "./sse.js";
import type { TranscriptMessage } from "./types.js";
import { isTerminalRunStatus } from "./types.js";

const MAX_MESSAGES = 200;

export type TranscriptState = {
  runId: string;
  agentId?: string;
  lastEventId?: string;
  runStatus?: string;
  messages: TranscriptMessage[];
  resultPartial?: string;
  resultFinal?: string;
  updatedAt: string;
  assistantBuffer?: string;
  thinkingBuffer?: string;
};

export function transcriptPath(ledgerPath: string, runId: string): string {
  return join(dirname(ledgerPath), "transcripts", `${runId}.json`);
}

export function loadTranscript(ledgerPath: string, runId?: string): TranscriptState | undefined {
  if (!runId) {
    return undefined;
  }
  const path = transcriptPath(ledgerPath, runId);
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as TranscriptState;
    if (!parsed || parsed.runId !== runId || !Array.isArray(parsed.messages)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export function saveTranscript(ledgerPath: string, state: TranscriptState): TranscriptState {
  const path = transcriptPath(ledgerPath, state.runId);
  ensureDir(dirname(path));
  const stored = {
    runId: state.runId,
    agentId: state.agentId,
    lastEventId: state.lastEventId,
    runStatus: state.runStatus,
    messages: state.messages.slice(-MAX_MESSAGES),
    resultPartial: state.resultPartial,
    resultFinal: state.resultFinal,
    updatedAt: state.updatedAt,
  };
  writeFileSync(path, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  return { ...state, ...stored };
}

export function emptyTranscript(runId: string, agentId?: string, now = new Date()): TranscriptState {
  return {
    runId,
    agentId,
    messages: [],
    updatedAt: now.toISOString(),
  };
}

export function applyStreamEvent(state: TranscriptState, event: SseEvent, now = new Date()): TranscriptState {
  const next: TranscriptState = {
    ...state,
    lastEventId: event.id ?? state.lastEventId,
    updatedAt: now.toISOString(),
  };
  const data = event.data && typeof event.data === "object" ? (event.data as Record<string, unknown>) : {};
  const text = typeof data.text === "string" ? data.text : undefined;

  switch (event.event) {
    case "status": {
      const status = typeof data.status === "string" ? data.status : undefined;
      next.runStatus = status ?? next.runStatus;
      pushMessage(next, { kind: "status", status, at: now.toISOString() });
      break;
    }
    case "assistant": {
      next.assistantBuffer = `${next.assistantBuffer ?? ""}${text ?? ""}`;
      next.resultPartial = next.assistantBuffer;
      break;
    }
    case "thinking": {
      next.thinkingBuffer = `${next.thinkingBuffer ?? ""}${text ?? ""}`;
      break;
    }
    case "tool_call": {
      flushBuffers(next, now);
      pushMessage(next, {
        kind: "tool_call",
        name: typeof data.name === "string" ? data.name : undefined,
        callId: typeof data.callId === "string" ? data.callId : undefined,
        status: typeof data.status === "string" ? data.status : undefined,
        truncated: Boolean(data.truncated),
        at: now.toISOString(),
      });
      break;
    }
    case "result": {
      flushBuffers(next, now);
      next.runStatus = typeof data.status === "string" ? data.status : next.runStatus;
      next.resultFinal = text ?? next.resultFinal;
      pushMessage(next, { kind: "result", text: next.resultFinal, status: next.runStatus, at: now.toISOString() });
      break;
    }
    case "error": {
      flushBuffers(next, now);
      const message = typeof data.message === "string" ? data.message : JSON.stringify(event.data);
      pushMessage(next, { kind: "error", text: message, at: now.toISOString() });
      break;
    }
    default:
      break;
  }
  return next;
}

export function classifyResult(input: {
  runStatus?: string;
  result?: string;
  transcript?: TranscriptState;
}): {
  result?: string;
  resultPartial?: string;
  resultTruncated: boolean;
} {
  const transcript = input.transcript;
  const resultPartial = transcript?.resultPartial;
  const resultFinal = isTerminalRunStatus(input.runStatus)
    ? (transcript?.resultFinal ?? input.result)
    : undefined;
  const stored = isTerminalRunStatus(input.runStatus) ? input.result : undefined;
  const result = resultFinal ?? stored;
  const resultTruncated = Boolean(
    (result && resultPartial && resultPartial.length > result.length + 20) ||
      (result && isTerminalRunStatus(input.runStatus) && looksMidTurn(result)),
  );
  return {
    result,
    resultPartial: isTerminalRunStatus(input.runStatus) ? resultPartial : (resultPartial ?? result),
    resultTruncated,
  };
}

export function looksMidTurn(text: string): boolean {
  return text.length < 400 && /\b(drafting|working on|i'll |next\.)\b/i.test(text);
}

function flushBuffers(state: TranscriptState, now: Date): void {
  if (state.assistantBuffer) {
    pushMessage(state, { kind: "assistant", text: state.assistantBuffer, at: now.toISOString() });
    state.assistantBuffer = "";
  }
  if (state.thinkingBuffer) {
    pushMessage(state, { kind: "thinking", text: state.thinkingBuffer, at: now.toISOString() });
    state.thinkingBuffer = "";
  }
}

function pushMessage(state: TranscriptState, message: TranscriptMessage): void {
  if (message.kind === "status" && !message.status) {
    return;
  }
  state.messages = [...state.messages, message].slice(-MAX_MESSAGES);
}
