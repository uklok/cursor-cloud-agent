import { describe, expect, it, vi } from "vitest";
import { handle } from "./mcp.js";
import type { Runtime } from "./runtime.js";

describe("mcp", () => {
  it("lists tools and calls launch through the runtime", async () => {
    const listed = await handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }, () => {
      throw new Error("unused");
    });
    const tools = (listed?.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.map((tool) => tool.name)).toContain("cursor_cloud_launch");

    const createAgent = vi.fn().mockResolvedValue({
      agent: { id: "bc-1", latestRunId: "run-1" },
      run: { id: "run-1", status: "CREATING" },
    });
    const runtime = {
      client: { createAgent },
      config: {
        apiBaseUrl: "https://api.cursor.com",
        authScheme: "basic",
        apiKeyEnv: "CURSOR_API_KEY",
        defaultEnv: "demo",
        envs: { demo: { type: "cloud", name: "Demo" } },
        allowReposOnLaunch: false,
        watch: { pollIntervalMs: 1000, timeoutMs: 1000, maxPollIntervalMs: 1000 },
      },
      env: { CURSOR_API_KEY: "k" },
      ledgerPath: "/tmp/ledger-unused",
    } as unknown as Runtime;
    vi.spyOn(await import("./ledger.js"), "upsertLedger").mockReturnValue([]);
    const called = await handle(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "cursor_cloud_launch",
          arguments: { prompt: "hi", watch: false },
        },
      },
      () => runtime,
    );
    expect(JSON.stringify(called)).toContain("bc-1");
    expect(createAgent).toHaveBeenCalled();
  });
});
