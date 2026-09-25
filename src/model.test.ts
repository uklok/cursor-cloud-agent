import { describe, expect, it } from "vitest";
import { ConfigError } from "./errors.js";
import { resolveModelSelection, resolvedModelHint } from "./model.js";

const grok = {
  id: "grok-4.6",
  parameters: [
    {
      id: "effort",
      values: [{ value: "low" }, { value: "med" }, { value: "high" }],
    },
    {
      id: "fast",
      values: [{ value: "true" }, { value: "false" }],
    },
  ],
};

describe("resolveModelSelection", () => {
  it("round-trips grok-4.6 + effort=med", () => {
    const resolved = resolveModelSelection({ model: "grok-4.6", effort: "med" }, [grok]);
    expect(resolved.selection).toEqual({
      id: "grok-4.6",
      params: [{ id: "effort", value: "med" }],
    });
    expect(resolved.resolved).toMatchObject({
      model: "grok-4.6",
      effort: "med",
      id: "cursor-grok-4.6-med",
    });
  });

  it("maps med onto a catalog that only lists medium", () => {
    const resolved = resolveModelSelection(
      { model: "grok-4.6", effort: "med" },
      [
        {
          id: "grok-4.6",
          parameters: [{ id: "thinking", values: [{ value: "low" }, { value: "medium" }, { value: "high" }] }],
        },
      ],
    );
    expect(resolved.selection?.params).toEqual([{ id: "thinking", value: "medium" }]);
    expect(resolved.resolved.effort).toBe("med");
    expect(resolved.resolved.id).toBe("cursor-grok-4.6-med");
  });

  it("sends fast=false when requested", () => {
    const resolved = resolveModelSelection({ model: "grok-4.6", fast: false }, [grok]);
    expect(resolved.selection?.params).toEqual([{ id: "fast", value: "false" }]);
    expect(resolved.resolved.fast).toBe(false);
    expect(resolvedModelHint("grok-4.6", undefined, true)).toBe("cursor-grok-4.6-fast");
  });

  it("rejects effort when the model has no matching parameter", () => {
    expect(() =>
      resolveModelSelection({ model: "composer-2", effort: "med" }, [
        { id: "composer-2", parameters: [{ id: "fast", values: [{ value: "true" }, { value: "false" }] }] },
      ]),
    ).toThrow(ConfigError);
  });
});
