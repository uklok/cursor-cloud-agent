import { describe, expect, it } from "vitest";
import { consumeSse } from "./sse.js";
import { applyStreamEvent, classifyResult, emptyTranscript } from "./transcript.js";

describe("SSE transcript", () => {
  it("parses assistant deltas and a terminal result", () => {
    const { events, rest } = consumeSse(
      [
        "event: status",
        'data: {"runId":"run-1","status":"RUNNING"}',
        "",
        "id: 1-0",
        "event: assistant",
        'data: {"text":"Drafting "}',
        "",
        "id: 1-1",
        "event: assistant",
        'data: {"text":"the plan."}',
        "",
        "id: 1-2",
        "event: result",
        'data: {"runId":"run-1","status":"FINISHED","text":"Here is the plan."}',
        "",
        "partial",
      ].join("\n"),
    );
    expect(rest).toBe("partial");
    let state = emptyTranscript("run-1", "bc-1");
    for (const event of events) {
      state = applyStreamEvent(state, event, new Date("2026-09-25T07:15:08Z"));
    }
    expect(state.resultPartial).toBe("Drafting the plan.");
    expect(state.resultFinal).toBe("Here is the plan.");
    expect(state.messages.some((item) => item.kind === "assistant")).toBe(true);
    expect(classifyResult({ runStatus: "FINISHED", result: "Here is the plan.", transcript: state })).toMatchObject({
      result: "Here is the plan.",
      resultPartial: "Drafting the plan.",
      resultTruncated: false,
    });
  });

  it("flags a mid-turn note stored as the official result", () => {
    expect(
      classifyResult({
        runStatus: "FINISHED",
        result: "Drafting the structured capability plan next.",
      }).resultTruncated,
    ).toBe(true);
  });
});
