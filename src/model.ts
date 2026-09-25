import { ConfigError } from "./errors.js";
import type { EffortLevel, ModelParam, ModelRecord, ModelVariant, ResolvedModel } from "./types.js";

export type ModelChoice = {
  model?: string;
  effort?: string;
  fast?: boolean;
  mode?: ResolvedModel["mode"];
};

const EFFORT_PARAM_IDS = new Set(["effort", "thinking", "reasoning"]);

export function normalizeEffort(value?: string): EffortLevel | undefined {
  const raw = value?.trim().toLowerCase();
  if (!raw) {
    return undefined;
  }
  if (raw === "low" || raw === "med" || raw === "high") {
    return raw;
  }
  if (raw === "medium" || raw === "mid") {
    return "med";
  }
  throw new ConfigError(`effort must be low, med, or high (got '${value}')`);
}

export function resolvedModelHint(model: string, effort?: EffortLevel, fast?: boolean): string {
  const base = model.replace(/^cursor-/, "");
  const parts = [base];
  if (effort) {
    parts.push(effort);
  }
  if (fast === true) {
    parts.push("fast");
  }
  return `cursor-${parts.join("-")}`;
}

export function findModel(catalog: ModelRecord[] | undefined, modelId: string): ModelRecord | undefined {
  const needle = modelId.trim().toLowerCase();
  return catalog?.find(
    (item) =>
      item.id.toLowerCase() === needle ||
      item.aliases?.some((alias) => alias.toLowerCase() === needle),
  );
}

export function resolveModelSelection(
  choice: ModelChoice,
  catalog?: ModelRecord[],
): { selection?: { id: string; params?: ModelParam[] }; resolved: ResolvedModel } {
  const effort = normalizeEffort(choice.effort);
  const fast = choice.fast;
  if ((effort || fast !== undefined) && !choice.model?.trim()) {
    throw new ConfigError("model is required when effort or fast is set");
  }
  if (!choice.model?.trim()) {
    return {
      resolved: {
        mode: choice.mode,
      },
    };
  }

  const modelId = choice.model.trim();
  const listed = findModel(catalog, modelId);
  const params: ModelParam[] = [];

  if (effort) {
    const mapped = mapEffortParam(listed, effort);
    if (listed && !mapped) {
      const available = (listed.parameters ?? []).map((item) => item.id).join(", ") || "none";
      throw new ConfigError(
        `Model '${listed.id}' has no effort/thinking parameter. Available: ${available}. Omit effort or pick a model that lists it.`,
      );
    }
    if (mapped) {
      params.push(mapped);
    } else {
      params.push({ id: "effort", value: effort });
    }
  }

  if (fast !== undefined) {
    const mapped = mapFastParam(listed, fast);
    if (listed && !mapped) {
      throw new ConfigError(`Model '${listed.id}' has no fast parameter. Omit fast or pick a model that lists it.`);
    }
    params.push(mapped ?? { id: "fast", value: fast ? "true" : "false" });
  }

  const selection = {
    id: listed?.id ?? modelId,
    ...(params.length > 0 ? { params } : {}),
  };
  return {
    selection,
    resolved: {
      model: selection.id,
      effort,
      fast,
      mode: choice.mode,
      id: resolvedModelHint(selection.id, effort, fast),
      params: params.length > 0 ? params : undefined,
    },
  };
}

function mapEffortParam(model: ModelRecord | undefined, effort: EffortLevel): ModelParam | undefined {
  const param = model?.parameters?.find((item) => EFFORT_PARAM_IDS.has(item.id.toLowerCase()));
  if (!param) {
    const variant = matchVariant(model, effort, undefined);
    const fromVariant = variant?.params?.find((item) => EFFORT_PARAM_IDS.has(item.id.toLowerCase()));
    return fromVariant;
  }
  const values = (param.values ?? []).map((item) => item.value.toLowerCase());
  const preferred =
    effort === "med"
      ? pickValue(values, ["med", "medium", "mid"])
      : effort === "low"
        ? pickValue(values, ["low", "minimal", "min"])
        : pickValue(values, ["high", "xhigh", "max"]);
  if (!preferred && values.length > 0) {
    throw new ConfigError(
      `Model '${model?.id}' effort '${effort}' is not in ${param.id} values: ${values.join(", ")}`,
    );
  }
  return { id: param.id, value: preferred ?? effort };
}

function mapFastParam(model: ModelRecord | undefined, fast: boolean): ModelParam | undefined {
  const param = model?.parameters?.find((item) => item.id.toLowerCase() === "fast");
  if (!param) {
    const variant = matchVariant(model, undefined, fast);
    return variant?.params?.find((item) => item.id.toLowerCase() === "fast");
  }
  const want = fast ? "true" : "false";
  const values = (param.values ?? []).map((item) => item.value.toLowerCase());
  if (values.length > 0 && !values.includes(want)) {
    throw new ConfigError(`Model '${model?.id}' does not accept fast=${want}`);
  }
  return { id: param.id, value: want };
}

function matchVariant(
  model: ModelRecord | undefined,
  effort?: EffortLevel,
  fast?: boolean,
): ModelVariant | undefined {
  if (!model?.variants?.length) {
    return undefined;
  }
  return model.variants.find((variant) => {
    const label = `${variant.displayName ?? ""} ${JSON.stringify(variant.params ?? [])}`.toLowerCase();
    const effortOk =
      !effort ||
      (effort === "med"
        ? /\bmed(ium)?\b|\bmid\b/.test(label)
        : new RegExp(`\\b${effort}\\b`).test(label));
    const fastOk = fast === undefined || (fast ? /\bfast\b|"true"/.test(label) : !/\bfast\b/.test(label) || /"false"/.test(label));
    return effortOk && fastOk;
  });
}

function pickValue(values: string[], preferred: string[]): string | undefined {
  for (const item of preferred) {
    const hit = values.find((value) => value === item);
    if (hit) {
      return hit;
    }
  }
  return undefined;
}

export function parseAgentModel(model: unknown): { id?: string; params?: ModelParam[] } {
  if (typeof model === "string" && model.trim()) {
    return { id: model.trim() };
  }
  if (model && typeof model === "object") {
    const record = model as { id?: unknown; params?: unknown };
    const id = typeof record.id === "string" ? record.id : undefined;
    const params = Array.isArray(record.params)
      ? record.params.filter(
          (item): item is ModelParam =>
            Boolean(item && typeof item === "object" && typeof (item as ModelParam).id === "string"),
        )
      : undefined;
    return { id, params };
  }
  return {};
}
