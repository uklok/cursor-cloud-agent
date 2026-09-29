import { ConfigError } from "./errors.js";
import type { EffortLevel, ModelParam, ModelRecord, ModelVariant, ResolvedModel } from "./types.js";

export type ModelChoice = {
  model?: string;
  effort?: string;
  fast?: boolean;
  mode?: ResolvedModel["mode"];
};

/** Preferred catalog value first, then accepted spellings. Tool level is the key. */
export const EFFORT_ALIASES: Record<EffortLevel, readonly string[]> = {
  low: ["low", "minimal", "min"],
  med: ["medium", "med", "mid"],
  high: ["high"],
  xhigh: ["xhigh", "extra_high", "extrahigh", "extra-high", "max"],
};

const EFFORT_PARAM_PATTERNS = {
  exact: ["effort", "thinking", "reasoning"],
  suffixes: ["_effort"],
  includes: ["thinking"],
};

export const TOOL_EFFORT_LEVELS = Object.keys(EFFORT_ALIASES) as EffortLevel[];

export function effortInputValues(): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const aliases of Object.values(EFFORT_ALIASES)) {
    for (const alias of aliases) {
      if (!seen.has(alias)) {
        seen.add(alias);
        values.push(alias);
      }
    }
  }
  return values;
}

export function effortWireDefaults(): Record<EffortLevel, string> {
  return Object.fromEntries(TOOL_EFFORT_LEVELS.map((level) => [level, EFFORT_ALIASES[level][0]])) as Record<
    EffortLevel,
    string
  >;
}

export function isEffortParamId(id: string): boolean {
  const raw = id.trim().toLowerCase();
  return (
    EFFORT_PARAM_PATTERNS.exact.includes(raw) ||
    EFFORT_PARAM_PATTERNS.suffixes.some((suffix) => raw.endsWith(suffix)) ||
    EFFORT_PARAM_PATTERNS.includes.some((part) => raw.includes(part))
  );
}

function matchEffort(raw: string): EffortLevel | undefined {
  return (Object.entries(EFFORT_ALIASES) as [EffortLevel, readonly string[]][]).find(([, aliases]) =>
    aliases.includes(raw),
  )?.[0];
}

export function normalizeEffort(value?: string): EffortLevel | undefined {
  const raw = value?.trim().toLowerCase();
  if (!raw) {
    return undefined;
  }
  const match = matchEffort(raw);
  if (match) {
    return match;
  }
  throw new ConfigError(`effort must be ${TOOL_EFFORT_LEVELS.join(", ")} (got '${value}')`);
}

export function cursorEffortValue(effort: EffortLevel, available?: string[]): string {
  const preferred = EFFORT_ALIASES[effort];
  if (available?.length) {
    const hit = pickValue(
      available.map((item) => item.toLowerCase()),
      preferred,
    );
    if (!hit) {
      throw new ConfigError(`effort '${effort}' is not in catalog values: ${available.join(", ")}`);
    }
    const exact = available.find((item) => item.toLowerCase() === hit);
    return exact ?? hit;
  }
  return preferred[0];
}

export function toolEffortFromCursor(value?: string): EffortLevel | undefined {
  const raw = value?.trim().toLowerCase();
  if (!raw) {
    return undefined;
  }
  return matchEffort(raw);
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
  const params = buildParams(listed, effort, fast);
  const sentEffort = toolEffortFromCursor(params.find((item) => isEffortParamId(item.id))?.value);
  const sentFast = params.find((item) => item.id.toLowerCase() === "fast")?.value;
  const resolvedEffort = effort ?? sentEffort;
  const resolvedFast = fast ?? (sentFast === undefined ? undefined : sentFast === "true");
  const selection = {
    id: listed?.id ?? modelId,
    ...(params.length > 0 ? { params } : {}),
  };
  return {
    selection,
    resolved: {
      model: selection.id,
      effort: resolvedEffort,
      fast: resolvedFast,
      mode: choice.mode,
      id: resolvedModelHint(selection.id, resolvedEffort, resolvedFast),
      params: params.length > 0 ? params : undefined,
    },
  };
}

function buildParams(
  model: ModelRecord | undefined,
  effort?: EffortLevel,
  fast?: boolean,
): ModelParam[] {
  if (!effort && fast === undefined) {
    return [];
  }

  const effortParam = effort ? mapEffortParam(model, effort) : undefined;
  if (effort && model && !effortParam) {
    const available = (model.parameters ?? []).map((item) => item.id).join(", ") || "none";
    throw new ConfigError(
      `Model '${model.id}' has no effort/thinking parameter. Available: ${available}. Omit effort or pick a model that lists it.`,
    );
  }

  const fastParam = fast !== undefined ? mapFastParam(model, fast) : undefined;
  if (fast !== undefined && model && !fastParam) {
    throw new ConfigError(`Model '${model.id}' has no fast parameter. Omit fast or pick a model that lists it.`);
  }

  if (!model) {
    const params: ModelParam[] = [];
    if (effort && effortParam) {
      params.push(effortParam);
    } else if (effort) {
      params.push({ id: "effort", value: cursorEffortValue(effort) });
    }
    if (fastParam) {
      params.push(fastParam);
    } else if (fast !== undefined) {
      params.push({ id: "fast", value: fast ? "true" : "false" });
    }
    return params;
  }

  const defaults = model.variants?.find((item) => item.isDefault)?.params ?? [];
  const merged = new Map(defaults.map((item) => [item.id, { ...item }]));
  if (effortParam) {
    merged.set(effortParam.id, effortParam);
  }
  if (fastParam) {
    merged.set(fastParam.id, fastParam);
  }
  return [...merged.values()];
}

function mapEffortParam(model: ModelRecord | undefined, effort: EffortLevel): ModelParam | undefined {
  const param = model?.parameters?.find((item) => isEffortParamId(item.id));
  if (!param) {
    return undefined;
  }
  const values = (param.values ?? []).map((item) => item.value);
  return { id: param.id, value: cursorEffortValue(effort, values.length > 0 ? values : undefined) };
}

function mapFastParam(model: ModelRecord | undefined, fast: boolean): ModelParam | undefined {
  const param = model?.parameters?.find((item) => item.id.toLowerCase() === "fast");
  if (!param) {
    return undefined;
  }
  const want = fast ? "true" : "false";
  const values = (param.values ?? []).map((item) => item.value.toLowerCase());
  if (values.length > 0 && !values.includes(want)) {
    throw new ConfigError(`Model '${model?.id}' does not accept fast=${want}`);
  }
  return { id: param.id, value: want };
}

function pickValue(values: readonly string[], preferred: readonly string[]): string | undefined {
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

export function decorateVariants(model: ModelRecord): ModelVariant[] {
  const variants = model.variants ?? [];
  const counts = new Map<string, number>();
  for (const variant of variants) {
    const name = cleanLabel(variant.displayName) || model.displayName || model.id;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return variants.map((variant) => {
    const base = cleanLabel(variant.displayName) || model.displayName || model.id;
    if ((counts.get(base) ?? 0) <= 1) {
      return { ...variant, displayName: base };
    }
    return {
      ...variant,
      displayName: labelFromParams(model.displayName || model.id, variant.params, model.parameters),
    };
  });
}

export function presentModel(model: ModelRecord) {
  const effortParam = model.parameters?.find((item) => isEffortParamId(item.id));
  const effortValues = effortParam?.values?.map((item) => item.value);
  const toolEffort: Partial<Record<EffortLevel, string>> = {};
  for (const effort of TOOL_EFFORT_LEVELS) {
    try {
      toolEffort[effort] = cursorEffortValue(effort, effortValues);
    } catch {
      // Model does not list this tool effort.
    }
  }
  return {
    id: model.id,
    displayName: model.displayName,
    description: model.description,
    aliases: model.aliases,
    parameters: model.parameters,
    variants: decorateVariants(model),
    effortParam: effortParam?.id,
    effortValues,
    toolEffort,
  };
}

export function labelFromParams(
  base: string,
  params: ModelParam[] | undefined,
  definitions?: ModelRecord["parameters"],
): string {
  const parts = [cleanLabel(base)];
  for (const param of params ?? []) {
    const definition = definitions?.find((item) => item.id === param.id);
    const value = definition?.values?.find((item) => item.value === param.value);
    const label = cleanLabel(value?.displayName || param.value);
    if (param.id.toLowerCase() === "fast") {
      if (param.value === "true" && label) {
        parts.push(label === "true" ? "Fast" : label);
      }
      continue;
    }
    if (label) {
      parts.push(label);
    }
  }
  return parts.filter(Boolean).join(" ");
}

function cleanLabel(value?: string): string {
  return (value ?? "").replace(/\u200b/g, "").replace(/\s+/g, " ").trim();
}
