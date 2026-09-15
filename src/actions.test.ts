import { describe, expect, it, vi } from "vitest";
import { launchAction, replyAction } from "./actions.js";
import { PolicyError } from "./errors.js";
import type { Runtime } from "./runtime.js";
import { resolveConfig } from "./config.js";

function runtime(createAgent: ReturnType<typeof vi.fn>, createRun?: ReturnType<typeof vi.fn>): Runtime {
  return {
    client: {
      createAgent,
      createRun: createRun ?? vi.fn(),
      getAgent: vi.fn(),
      getRun: vi.fn(),
      cancelRun: vi.fn(),
      listAgents: vi.fn().mockResolvedValue({ items: [] }),
      listModels: vi.fn(),
      getMe: vi.fn(),
    } as never,
    config: resolveConfig({
      defaultEnv: "uklok-os",
      envs: {
        "uklok-os": {
          type: "cloud",
          name: "UKLOK OS",
          workdirRule: "SSH clone target to /tmp/<slug>",
          skillsPath: "~/.cursor/skills",
        },
      },
    }),
    env: { CURSOR_API_KEY: "test" },
    ledgerPath: "/tmp/does-not-write-here-if-mocked",
    catalogPath: "/tmp/does-not-write-catalog",
  };
}

describe("launchAction", () => {
  it("sends env and no repos, and composes a senior brief", async () => {
    const createAgent = vi.fn().mockResolvedValue({
      agent: { id: "bc-1", url: "https://cursor.com/agents/bc-1", latestRunId: "run-1" },
      run: { id: "run-1", status: "CREATING" },
    });
    vi.spyOn(await import("./ledger.js"), "upsertLedger").mockReturnValue([]);
    vi.spyOn(await import("./watch-process.js"), "spawnWatch").mockReturnValue({
      watching: true,
      pid: 9,
      command: ["node", "watch"],
    });
    const result = await launchAction(runtime(createAgent), {
      prompt: "Fix the serializer",
      watch: false,
    });
    const body = createAgent.mock.calls[0][0];
    expect(body.env).toEqual({ type: "cloud", name: "UKLOK OS" });
    expect(body.repos).toBeUndefined();
    expect(body.prompt.text).toContain("SSH clone target to /tmp/<slug>");
    expect(body.prompt.text).toContain("Fix the serializer");
    expect(result.agent.id).toBe("bc-1");
    expect(result.ok).toBe(true);
  });

  it("refuses a repo on the named cloud env", async () => {
    const createAgent = vi.fn();
    await expect(
      launchAction(runtime(createAgent), {
        prompt: "x",
        repo: "https://github.com/acme/other",
        watch: false,
      }),
    ).rejects.toBeInstanceOf(PolicyError);
    expect(createAgent).not.toHaveBeenCalled();
  });
});

describe("replyAction", () => {
  it("posts a run on the same agent", async () => {
    const createRun = vi.fn().mockResolvedValue({ run: { id: "run-2", status: "CREATING" } });
    vi.spyOn(await import("./ledger.js"), "upsertLedger").mockReturnValue([]);
    const result = await replyAction(runtime(vi.fn(), createRun), {
      agentId: "bc-00000000-0000-0000-0000-000000000001",
      prompt: "also tests",
      watch: false,
    });
    expect(createRun).toHaveBeenCalledWith("bc-00000000-0000-0000-0000-000000000001", {
      prompt: { text: "also tests" },
      mode: undefined,
    });
    expect(result.run.id).toBe("run-2");
  });
});
