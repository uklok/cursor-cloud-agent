import { describe, expect, it } from "vitest";
import { interpolateSafe, notifyValues } from "./notify.js";

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
});
