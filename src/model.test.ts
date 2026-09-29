import { describe, expect, it } from "vitest";
import { ConfigError } from "./errors.js";
import {
  decorateVariants,
  EFFORT_ALIASES,
  effortWireDefaults,
  normalizeEffort,
  presentModel,
  resolveModelSelection,
  resolvedModelHint,
} from "./model.js";

const grok46 = {
  id: "grok-4.6",
  displayName: "Grok 4.6",
  parameters: [
    {
      id: "effort",
      displayName: "Effort",
      values: [
        { value: "low", displayName: "Low" },
        { value: "medium", displayName: "Medium" },
        { value: "high", displayName: "High" },
        { value: "xhigh", displayName: "Extra High" },
      ],
    },
    {
      id: "fast",
      displayName: "Fast",
      values: [{ value: "false" }, { value: "true", displayName: "Fast" }],
    },
  ],
  variants: [
    { displayName: "Grok 4.6", params: [{ id: "effort", value: "low" }, { id: "fast", value: "false" }] },
    { displayName: "Grok 4.6", params: [{ id: "effort", value: "medium" }, { id: "fast", value: "false" }] },
    { displayName: "Grok 4.6", isDefault: true, params: [{ id: "effort", value: "high" }, { id: "fast", value: "true" }] },
    { displayName: "Grok 4.6", params: [{ id: "effort", value: "xhigh" }, { id: "fast", value: "true" }] },
  ],
};

const grok47 = {
  id: "grok-4.7",
  displayName: "Grok 4.7",
  parameters: [
    {
      id: "context",
      values: [
        { value: "256k", displayName: "256K" },
        { value: "500k", displayName: "500K" },
      ],
    },
    {
      id: "reasoning_effort",
      values: [
        { value: "low" },
        { value: "medium" },
        { value: "high" },
        { value: "xhigh" },
      ],
    },
    { id: "fast", values: [{ value: "false" }, { value: "true" }] },
  ],
  variants: [
    {
      displayName: "Grok 4.7  High Fast",
      isDefault: true,
      params: [
        { id: "context", value: "500k" },
        { id: "reasoning_effort", value: "high" },
        { id: "fast", value: "true" },
      ],
    },
  ],
};

describe("resolveModelSelection", () => {
  it("sends grok-4.6 effort=med as Cursor medium and keeps default fast", () => {
    const resolved = resolveModelSelection({ model: "grok-4.6", effort: "med" }, [grok46]);
    expect(resolved.selection).toEqual({
      id: "grok-4.6",
      params: [
        { id: "effort", value: "medium" },
        { id: "fast", value: "true" },
      ],
    });
    expect(resolved.resolved).toMatchObject({
      model: "grok-4.6",
      effort: "med",
      fast: true,
      id: "cursor-grok-4.6-med-fast",
    });
  });

  it("accepts medium and xhigh and can unset fast", () => {
    const resolved = resolveModelSelection({ model: "grok-4.6", effort: "medium", fast: false }, [grok46]);
    expect(resolved.selection?.params).toEqual([
      { id: "effort", value: "medium" },
      { id: "fast", value: "false" },
    ]);
    expect(resolved.resolved.effort).toBe("med");
    expect(resolved.resolved.fast).toBe(false);
    expect(resolved.resolved.id).toBe("cursor-grok-4.6-med");
  });

  it("maps grok-4.7 effort onto reasoning_effort and keeps default context", () => {
    const resolved = resolveModelSelection({ model: "grok-4.7", effort: "med", fast: false }, [grok47]);
    expect(resolved.selection?.params).toEqual([
      { id: "context", value: "500k" },
      { id: "reasoning_effort", value: "medium" },
      { id: "fast", value: "false" },
    ]);
  });

  it("sends medium when there is no catalog (Cursor rejects med)", () => {
    const resolved = resolveModelSelection({ model: "grok-4.6", effort: "med" });
    expect(resolved.selection?.params).toEqual([{ id: "effort", value: "medium" }]);
  });

  it("rejects effort when the model has no matching parameter", () => {
    expect(() =>
      resolveModelSelection({ model: "composer-2", effort: "med" }, [
        { id: "composer-2", parameters: [{ id: "fast", values: [{ value: "true" }, { value: "false" }] }] },
      ]),
    ).toThrow(ConfigError);
  });

  it("maps every alias in the table and uses the first alias as the wire default", () => {
    for (const [level, aliases] of Object.entries(EFFORT_ALIASES)) {
      for (const alias of aliases) {
        expect(normalizeEffort(alias)).toBe(level);
      }
    }
    expect(effortWireDefaults().med).toBe(EFFORT_ALIASES.med[0]);
    expect(() => normalizeEffort("turbo")).toThrow(ConfigError);
  });

  it("labels duplicate variant names from params", () => {
    const names = decorateVariants(grok46).map((item) => item.displayName);
    expect(names).toContain("Grok 4.6 Medium");
    expect(names).toContain("Grok 4.6 Extra High Fast");
    expect(presentModel(grok46).toolEffort).toEqual({
      low: "low",
      med: "medium",
      high: "high",
      xhigh: "xhigh",
    });
    expect(resolvedModelHint("grok-4.6", "xhigh", true)).toBe("cursor-grok-4.6-xhigh-fast");
  });
});
