import { describe, expect, it } from "vitest";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import entry from "./plugin.js";

describe("cursor-cloud plugin", () => {
  it("declares coordinator tools and keeps destructive extras optional", () => {
    const meta = getToolPluginMetadata(entry);
    expect(meta?.id).toBe("cursor-cloud");
    expect(meta?.tools.map((tool) => tool.name)).toEqual([
      "cursor_cloud_launch",
      "cursor_cloud_reply",
      "cursor_cloud_status",
      "cursor_cloud_cancel",
      "cursor_cloud_watch",
      "cursor_cloud_list",
      "cursor_cloud_models",
      "cursor_cloud_me",
      "cursor_cloud_ledger",
    ]);
    expect(meta?.tools.filter((tool) => tool.optional).map((tool) => tool.name)).toEqual([
      "cursor_cloud_list",
      "cursor_cloud_models",
      "cursor_cloud_ledger",
    ]);
  });
});
