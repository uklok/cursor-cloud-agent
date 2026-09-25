import { describe, expect, it } from "vitest";
import { interpolateSafe, notifyValues, resolveNotifyCommand, sessionNotifyCommand } from "./notify.js";

describe("notify interpolation", () => {
  it("fills safe placeholders and leaves result braces alone", () => {
    const values = notifyValues(
      { id: "bc-1", url: "https://cursor.com/agents/bc-1", status: "IDLE" },
      {
        id: "run-1",
        status: "FINISHED",
        result: "touch /tmp; echo hi",
        git: { branches: [{ prUrl: "https://github.com/acme/repo/pull/1" }] },
      },
    );
    expect(
      interpolateSafe("done {agentId} {runStatus} {prUrl} {result}", values),
    ).toBe("done bc-1 FINISHED https://github.com/acme/repo/pull/1 {result}");
  });

  it("targets the originating OpenClaw session by default", () => {
    const values = notifyValues({ id: "bc-1", url: "https://cursor.com/agents/bc-1" }, { id: "run-2", status: "FINISHED" });
    const command = resolveNotifyCommand(undefined, values, { sessionKey: "aipal@grok.uklok.ai" });
    expect(command).toContain("openclaw agent --session-key ");
    expect(command).toContain("aipal@grok.uklok.ai");
    expect(command).not.toContain("touch");
    expect(sessionNotifyCommand({ sessionId: "sess-1" }, values)).toContain("--session-id");
  });
});
