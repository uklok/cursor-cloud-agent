import { ConfigError, PolicyError } from "./errors.js";
import { assertEnvId } from "./ids.js";
import type { CreateAgentRequest, EnvRecord, ResolvedConfig } from "./types.js";

export type LaunchRepo = {
  url: string;
  startingRef?: string;
  prUrl?: string;
};

export type LaunchTarget = {
  envId: string;
  record: EnvRecord;
  payload: Pick<CreateAgentRequest, "env" | "repos">;
  omittedRepo?: string;
};

export function normalizeRepoUrl(url: string): string {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new PolicyError(`Invalid repo URL '${url}'`);
  }
  if (parsed.protocol !== "https:") {
    throw new PolicyError("Repo URLs must be https://");
  }
  if (parsed.username || parsed.password) {
    throw new PolicyError("Repo URLs must not include credentials");
  }
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";
  parsed.search = "";
  let path = parsed.pathname.replace(/\/+$/, "");
  if (path.endsWith(".git")) {
    path = path.slice(0, -4);
  }
  parsed.pathname = path;
  return parsed.toString();
}

export function repoAllowed(url: string, allowRepos: string[] | undefined): boolean {
  const wanted = normalizeRepoUrl(url);
  return (allowRepos ?? []).some((entry) => {
    try {
      return normalizeRepoUrl(entry) === wanted;
    } catch {
      return false;
    }
  });
}

export function resolveLaunchTarget(
  config: ResolvedConfig,
  envId: string | undefined,
  repo?: LaunchRepo,
): LaunchTarget {
  const rawId = envId?.trim() || config.defaultEnv;
  if (!rawId) {
    throw new ConfigError(
      `Launch needs an env registry id. Known: ${knownEnvIds(config)}. Set defaultEnv or pass env.`,
    );
  }
  const id = assertEnvId(rawId);
  const record = config.envs[id];
  if (!record) {
    throw new ConfigError(`Unknown env '${id}'. Known: ${knownEnvIds(config)}`);
  }

  const payload: LaunchTarget["payload"] = {
    env: { type: record.type, name: record.name },
  };

  if (!repo?.url) {
    return { envId: id, record, payload };
  }

  const listed = repoAllowed(repo.url, record.allowRepos);
  if (record.type === "cloud") {
    if (!listed) {
      throw new PolicyError(
        `Refusing repo '${repo.url}' on named cloud env '${record.name}'. ` +
          `Omit repo and clone inside the environment` +
          (record.workdirRule ? ` (${record.workdirRule})` : "") +
          ". Only URLs in allowRepos may be mentioned, and they are still omitted on the wire.",
      );
    }
    return { envId: id, record, payload, omittedRepo: normalizeRepoUrl(repo.url) };
  }

  if (!listed && !config.allowReposOnLaunch) {
    throw new PolicyError(
      `Refusing repo '${repo.url}' on env '${id}'. Add it to allowRepos or enable allowReposOnLaunch.`,
    );
  }

  payload.repos = [
    {
      url: repo.url.trim(),
      startingRef: repo.startingRef?.trim() || undefined,
      prUrl: repo.prUrl?.trim() || undefined,
    },
  ];
  return { envId: id, record, payload };
}

export function knownEnvIds(config: ResolvedConfig): string {
  const ids = Object.keys(config.envs);
  return ids.length > 0 ? ids.join(", ") : "(none configured)";
}
