import { describe, expect, it } from "vitest";
import { resolveConfig } from "./config.js";
import { ConfigError, PolicyError } from "./errors.js";
import { listRegisteredEnvs, recommendEnvId, resolveLaunchTarget } from "./registry.js";

const config = resolveConfig({
  defaultEnv: "uklok-os",
  envs: {
    "uklok-os": {
      type: "cloud",
      name: "UKLOK OS",
      role: "base",
      workdirRule: "SSH clone target to /tmp/<slug>",
      allowRepos: ["https://github.com/acme/listed.git"],
    },
    "acme-app": {
      type: "cloud",
      name: "Acme App",
      role: "project",
      project: "acme-app",
      allowRepos: ["https://github.com/acme/app"],
      workdirRule: "Use the repo already loaded on this environment.",
    },
    "forge-pool": {
      type: "pool",
      name: "sandbox",
      allowRepos: ["https://github.com/acme/payments"],
    },
  },
});

describe("resolveLaunchTarget", () => {
  it("omits repos on a named cloud env", () => {
    const target = resolveLaunchTarget(config, "uklok-os");
    expect(target.payload).toEqual({ env: { type: "cloud", name: "UKLOK OS" } });
    expect(target.payload.repos).toBeUndefined();
  });

  it("omits an allowlisted repo on a named cloud env", () => {
    const target = resolveLaunchTarget(config, "uklok-os", {
      url: "https://GitHub.com/acme/listed.git/",
    });
    expect(target.payload.repos).toBeUndefined();
    expect(target.omittedRepo).toBe("https://github.com/acme/listed");
  });

  it("refuses an unlisted repo on a named cloud env", () => {
    expect(() =>
      resolveLaunchTarget(config, "uklok-os", { url: "https://github.com/acme/other" }),
    ).toThrow(PolicyError);
  });

  it("allows a listed repo on a pool", () => {
    const target = resolveLaunchTarget(config, "forge-pool", {
      url: "https://github.com/acme/payments",
      startingRef: "main",
    });
    expect(target.payload.repos).toEqual([
      { url: "https://github.com/acme/payments", startingRef: "main", prUrl: undefined },
    ]);
  });

  it("uses defaultEnv", () => {
    expect(resolveLaunchTarget(config, undefined).envId).toBe("uklok-os");
  });

  it("rejects unknown env ids", () => {
    expect(() => resolveLaunchTarget(config, "nope")).toThrow(ConfigError);
  });

  it("allocates a project env when env is omitted and repo matches", () => {
    const target = resolveLaunchTarget(config, undefined, { url: "https://github.com/acme/app" });
    expect(target.envId).toBe("acme-app");
    expect(target.payload).toEqual({ env: { type: "cloud", name: "Acme App" } });
    expect(target.omittedRepo).toBe("https://github.com/acme/app");
  });
});

describe("listRegisteredEnvs", () => {
  it("marks the base default and recommends a project env for a loaded repo", () => {
    const listed = listRegisteredEnvs(config, { repo: "https://github.com/acme/app" });
    expect(listed.defaultEnv).toBe("uklok-os");
    expect(listed.recommended).toBe("acme-app");
    expect(listed.items.find((item) => item.id === "uklok-os")?.role).toBe("base");
    expect(listed.items.find((item) => item.id === "acme-app")).toMatchObject({
      role: "project",
      project: "acme-app",
    });
  });

  it("recommends the base when no project env owns the repo", () => {
    expect(recommendEnvId(config)).toBe("uklok-os");
    expect(recommendEnvId(config, "https://github.com/acme/unknown")).toBe("uklok-os");
  });
});
