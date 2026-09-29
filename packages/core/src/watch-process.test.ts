import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => ({
    unref: vi.fn(),
    pid: 11255,
  })),
}));

import { spawn } from "node:child_process";
import { spawnWatch } from "./watch-process.js";
import type { Runtime } from "./runtime.js";

describe("spawnWatch", () => {
  it("passes the originating session into the child env", () => {
    spawnWatch(
      {
        env: { CURSOR_API_KEY: "k" },
        config: {
          apiBaseUrl: "https://api.cursor.com",
          authScheme: "basic",
          apiKeyEnv: "CURSOR_API_KEY",
          envs: {},
          allowReposOnLaunch: false,
          watch: { pollIntervalMs: 1000, timeoutMs: 1000, maxPollIntervalMs: 1000 },
        },
        ledgerPath: "/tmp/agents.json",
        catalogPath: "/tmp/envs.json",
      } as unknown as Runtime,
      {
        agentId: "bc-1",
        runId: "run-1",
        session: { sessionId: "sess-1", sessionKey: "aipal@grok.uklok.ai" },
      },
    );
    const init = vi.mocked(spawn).mock.calls[0]?.[2] as { env?: NodeJS.ProcessEnv };
    expect(init.env?.OPENCLAW_CURSOR_CLOUD_SESSION_KEY).toBe("aipal@grok.uklok.ai");
    expect(init.env?.OPENCLAW_CURSOR_CLOUD_SESSION_ID).toBe("sess-1");
  });
});
