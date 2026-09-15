import { Type, type Static } from "typebox";
import { ConfigError } from "./errors.js";
import { resolveApiBaseUrl } from "./host.js";
import { assertEnvId } from "./ids.js";
import type { EnvRecord, PluginConfig, ResolvedConfig, WatchConfig } from "./types.js";
import { DEFAULT_API_BASE_URL } from "./version.js";

export const envRecordSchema = Type.Object(
  {
    type: Type.Union([Type.Literal("cloud"), Type.Literal("pool"), Type.Literal("machine")]),
    name: Type.String({
      minLength: 1,
      description: "Saved Cursor environment, pool, or machine name (exact dashboard match).",
    }),
    allowRepos: Type.Optional(
      Type.Array(
        Type.String({
          description: "Exact repo URL already listed on this environment.",
        }),
      ),
    ),
    workdirRule: Type.Optional(
      Type.String({
        description: "How the Cloud agent should place work when the env primary repo is not the target.",
      }),
    ),
    skillsPath: Type.Optional(Type.String({ description: "Org skills path inside the environment." })),
    note: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const pluginConfigSchema = Type.Object(
  {
    apiBaseUrl: Type.Optional(
      Type.String({
        description: "Pinned Cursor API origin. Default https://api.cursor.com.",
      }),
    ),
    authScheme: Type.Optional(Type.Union([Type.Literal("basic"), Type.Literal("bearer")])),
    apiKeyEnv: Type.Optional(
      Type.String({
        description: "Environment variable that holds the Cursor API key. Default CURSOR_API_KEY.",
      }),
    ),
    defaultEnv: Type.Optional(
      Type.String({
        description: "Registry id used when launch omits env.",
      }),
    ),
    envs: Type.Optional(Type.Record(Type.String(), envRecordSchema)),
    allowReposOnLaunch: Type.Optional(
      Type.Boolean({
        description: "Allow a repo URL on pool/machine launches even when the env has no allowRepos. Default false.",
      }),
    ),
    watch: Type.Optional(
      Type.Object(
        {
          pollIntervalMs: Type.Optional(Type.Integer({ minimum: 1000 })),
          timeoutMs: Type.Optional(Type.Integer({ minimum: 1000 })),
          maxPollIntervalMs: Type.Optional(Type.Integer({ minimum: 1000 })),
          notifyCommand: Type.Optional(
            Type.String({
              description:
                "Shell command run when a watched run becomes terminal. Safe placeholders: {agentId} {runId} {runStatus} {url} {prUrl}. Result text is passed via CURSOR_CLOUD_RESULT.",
            }),
          ),
        },
        { additionalProperties: false },
      ),
    ),
    ledgerPath: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export type PluginConfigSchema = Static<typeof pluginConfigSchema>;

export const DEFAULT_WATCH: WatchConfig = {
  pollIntervalMs: 15_000,
  timeoutMs: 45 * 60 * 1000,
  maxPollIntervalMs: 60_000,
};

export function resolveConfig(
  raw: PluginConfig | undefined,
  options: { allowInsecureHost?: boolean } = {},
): ResolvedConfig {
  const config = raw ?? {};
  const envs: Record<string, EnvRecord> = {};
  for (const [id, record] of Object.entries(config.envs ?? {})) {
    const envId = assertEnvId(id);
    if (!record?.type || !record.name?.trim()) {
      throw new ConfigError(`Env '${id}' needs type and name`);
    }
    envs[envId] = {
      type: record.type,
      name: record.name.trim(),
      allowRepos: record.allowRepos?.map((url) => url.trim()).filter(Boolean),
      workdirRule: record.workdirRule?.trim() || undefined,
      skillsPath: record.skillsPath?.trim() || undefined,
      note: record.note?.trim() || undefined,
    };
  }

  const defaultEnv = config.defaultEnv?.trim() || undefined;
  if (defaultEnv) {
    assertEnvId(defaultEnv);
    if (!envs[defaultEnv]) {
      throw new ConfigError(`defaultEnv '${defaultEnv}' is not in envs`);
    }
  }

  const watch: WatchConfig = {
    pollIntervalMs: config.watch?.pollIntervalMs ?? DEFAULT_WATCH.pollIntervalMs,
    timeoutMs: config.watch?.timeoutMs ?? DEFAULT_WATCH.timeoutMs,
    maxPollIntervalMs: config.watch?.maxPollIntervalMs ?? DEFAULT_WATCH.maxPollIntervalMs,
    notifyCommand: config.watch?.notifyCommand?.trim() || undefined,
  };
  if (watch.maxPollIntervalMs < watch.pollIntervalMs) {
    throw new ConfigError("watch.maxPollIntervalMs must be >= watch.pollIntervalMs");
  }

  return {
    apiBaseUrl: resolveApiBaseUrl(config.apiBaseUrl ?? DEFAULT_API_BASE_URL, options),
    authScheme: config.authScheme ?? "basic",
    apiKeyEnv: config.apiKeyEnv?.trim() || "CURSOR_API_KEY",
    defaultEnv,
    envs,
    allowReposOnLaunch: config.allowReposOnLaunch === true,
    watch,
    ledgerPath: config.ledgerPath?.trim() || undefined,
  };
}

export function publicConfig(config: ResolvedConfig): PluginConfig {
  return {
    apiBaseUrl: config.apiBaseUrl,
    authScheme: config.authScheme,
    apiKeyEnv: config.apiKeyEnv,
    defaultEnv: config.defaultEnv,
    envs: config.envs,
    allowReposOnLaunch: config.allowReposOnLaunch,
    watch: config.watch,
    ledgerPath: config.ledgerPath,
  };
}
