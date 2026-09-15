import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogFromAgents, mergeCatalogIntoConfig, writeEnvCatalog } from "./env-catalog.js";
import { resolveConfig } from "./config.js";

describe("catalogFromAgents", () => {
  it("registers a named project env from loaded repos and skips unnamed agents", () => {
    const catalog = catalogFromAgents(
      [
        {
          id: "bc-1",
          env: { type: "cloud", name: "Payments" },
          repos: [{ url: "https://github.com/acme/payments" }],
        },
        {
          id: "bc-2",
          env: { type: "cloud" },
          repos: [{ url: "https://github.com/acme/other" }],
        },
        {
          id: "bc-3",
          env: { type: "cloud", name: "UKLOK OS" },
        },
      ],
      new Date("2026-09-15T12:00:00Z"),
    );
    expect(catalog.unnamedSkipped).toBe(1);
    expect(catalog.items).toEqual([
      {
        id: "payments",
        type: "cloud",
        name: "Payments",
        role: "project",
        project: "payments",
        allowRepos: ["https://github.com/acme/payments"],
        seenAgentIds: ["bc-1"],
      },
      {
        id: "uklok-os",
        type: "cloud",
        name: "UKLOK OS",
        role: "base",
        project: undefined,
        allowRepos: [],
        seenAgentIds: ["bc-3"],
      },
    ]);
  });
});

describe("mergeCatalogIntoConfig", () => {
  it("keeps an explicit base role and adds harvested project envs", () => {
    const config = resolveConfig({
      defaultEnv: "uklok-os",
      envs: {
        "uklok-os": { type: "cloud", name: "UKLOK OS", role: "base" },
      },
    });
    const path = join(mkdtempSync(join(tmpdir(), "cursor-cloud-")), "envs.json");
    const catalog = writeEnvCatalog(
      catalogFromAgents([
        {
          id: "bc-9",
          env: { type: "cloud", name: "UKLOK OS" },
          repos: [{ url: "https://github.com/raw-ideas/cursor-flow" }],
        },
        {
          id: "bc-8",
          env: { type: "cloud", name: "Billing" },
          repos: [{ url: "https://github.com/acme/billing" }],
        },
      ]),
      path,
    );
    const merged = mergeCatalogIntoConfig(config, catalog);
    expect(merged.envs["uklok-os"]?.role).toBe("base");
    expect(merged.envs.billing).toMatchObject({
      role: "project",
      allowRepos: ["https://github.com/acme/billing"],
    });
  });
});
