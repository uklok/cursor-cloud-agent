import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "./ledger.js";
import { resolvePlacement, sessionLabel } from "./placement.js";
import type { ListedEnv } from "./registry.js";

const envs: ListedEnv[] = [
  {
    id: "uklok-os",
    role: "base",
    type: "cloud",
    name: "UKLOK OS",
    allowRepos: [],
    isDefault: true,
  },
  {
    id: "payments",
    role: "project",
    type: "cloud",
    name: "Payments",
    project: "payments",
    allowRepos: ["https://github.com/acme/payments"],
    isDefault: false,
  },
];

const bound: LedgerEntry = {
  agentId: "bc-bound",
  envId: "uklok-os",
  name: "UKLOK OS smoke",
  sessionId: "sess-1",
  createdAt: "2026-09-15T00:00:00Z",
  updatedAt: "2026-09-15T00:00:00Z",
};

describe("resolvePlacement", () => {
  it("auto-reuses the agent bound to this OpenClaw session", () => {
    const result = resolvePlacement({
      params: { prompt: "continue" },
      session: { sessionId: "sess-1" },
      agents: [bound],
      envs,
      defaultEnv: "uklok-os",
      interactive: true,
    });
    expect(result).toEqual({ kind: "reuse", agentId: "bc-bound", reason: "session-bound" });
  });

  it("asks before launching when the user was not explicit", () => {
    const result = resolvePlacement({
      params: { prompt: "fix serializer" },
      session: { sessionId: "sess-new" },
      agents: [bound],
      envs,
      defaultEnv: "uklok-os",
      interactive: true,
    });
    expect(result.kind).toBe("ask");
    if (result.kind !== "ask") return;
    expect(result.ask.question).toContain("fresh agent");
    expect(result.ask.options.map((option) => option.id)).toEqual(["fresh", "reuse"]);
    expect(result.ask.sessions[0]?.label).toBe("UKLOK OS smoke");
  });

  it("asks which env after the user chooses fresh", () => {
    const result = resolvePlacement({
      params: { prompt: "fix", fresh: true },
      session: { sessionId: "sess-new" },
      agents: [],
      envs,
      interactive: true,
    });
    expect(result.kind).toBe("ask");
    if (result.kind !== "ask") return;
    expect(result.ask.question).toContain("Which ENV");
    expect(result.ask.options.map((option) => option.recall.env)).toEqual(["uklok-os", "payments"]);
  });

  it("launches when fresh and env are both explicit", () => {
    expect(
      resolvePlacement({
        params: { prompt: "fix", fresh: true, env: "payments" },
        session: { sessionId: "sess-new" },
        agents: [bound],
        envs,
        interactive: true,
      }),
    ).toEqual({ kind: "fresh", envId: "payments" });
  });

  it("lists named sessions when the user refuses a fresh agent", () => {
    const result = resolvePlacement({
      params: { prompt: "fix", fresh: false },
      session: { sessionId: "sess-new" },
      agents: [bound],
      envs,
      interactive: true,
    });
    expect(result.kind).toBe("ask");
    if (result.kind !== "ask") return;
    expect(result.ask.question).toContain("reuse");
    expect(result.ask.options[0]?.recall.agentId).toBe("bc-bound");
  });

  it("does not ask on the CLI — uses default env", () => {
    expect(
      resolvePlacement({
        params: { prompt: "smoke" },
        session: {},
        agents: [bound],
        envs,
        defaultEnv: "uklok-os",
        interactive: false,
      }),
    ).toEqual({ kind: "fresh", envId: "uklok-os" });
  });
});

describe("sessionLabel", () => {
  it("prefers the stored name", () => {
    expect(sessionLabel(bound)).toBe("UKLOK OS smoke");
  });
});
