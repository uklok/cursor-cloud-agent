import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./version.js";
import { PLUGIN_ID, installArgs, mergeAllowlist, setupGateway } from "./setup.js";

describe("setup helpers", () => {
  it("appends the plugin id to alsoAllow once", () => {
    expect(mergeAllowlist(["browser"], PLUGIN_ID)).toEqual(["browser", "cursor-cloud"]);
    expect(mergeAllowlist(["cursor-cloud"], PLUGIN_ID)).toEqual(["cursor-cloud"]);
    expect(mergeAllowlist(null, PLUGIN_ID)).toEqual(["cursor-cloud"]);
  });

  it("builds a link or pinned npm install", () => {
    expect(installArgs("link", "/tmp/plugin")).toEqual([
      "plugins",
      "install",
      "--link",
      "--force",
      "--accept-capabilities",
      "--acknowledge-install-policy-warning",
      "/tmp/plugin",
    ]);
    expect(installArgs("npm", "/unused", "0.1.0")).toEqual([
      "plugins",
      "install",
      `npm:${PACKAGE_NAME}@0.1.0`,
      "--force",
      "--accept-capabilities",
      "--acknowledge-install-policy-warning",
    ]);
    expect(installArgs("skip", "/unused")).toEqual([]);
  });

  it("installs, merges alsoAllow, and enables the skill", async () => {
    const calls: string[][] = [];
    const result = await setupGateway({
      source: "skip",
      run: async (args) => {
        calls.push(args);
        if (args[1] === "get") {
          return JSON.stringify(["browser"]);
        }
        return "";
      },
    });
    expect(result.alsoAllow).toEqual(["browser", "cursor-cloud"]);
    expect(calls.some((args) => args[0] === "config" && args[1] === "set" && args[2] === "tools.alsoAllow")).toBe(true);
    expect(calls.some((args) => args[2] === "skills.entries.cursor-cloud")).toBe(true);
  });
});
