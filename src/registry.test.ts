import { describe, expect, it } from "vitest";
import { resolveConfig } from "./config.js";
import { ConfigError, PolicyError } from "./errors.js";
import { resolveLaunchTarget } from "./registry.js";

const config = resolveConfig({
  defaultEnv: "uklok-os",
  envs: {
    "uklok-os": {
      type: "cloud",
      name: "UKLOK OS",
      workdirRule: "SSH clone target to /tmp/<slug>",
      allowRepos: ["https://github.com/acme/listed.git"],
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
});
