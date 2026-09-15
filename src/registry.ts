import { ConfigError, PolicyError } from "./errors.js";
import { assertEnvId } from "./ids.js";
import type { CreateAgentRequest, EnvRecord, EnvRole, ResolvedConfig } from "./types.js";

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

export function inferEnvRole(record: EnvRecord): EnvRole {
  if (record.role === "base" || record.role === "project") {
    return record.role;
  }
  return record.allowRepos && record.allowRepos.length > 0 ? "project" : "base";
}

export type ListedEnv = {
  id: string;
  role: EnvRole;
  type: EnvRecord["type"];
  name: string;
  project?: string;
  allowRepos: string[];
  workdirRule?: string;
  skillsPath?: string;
  note?: string;
  isDefault: boolean;
};

export function listRegisteredEnvs(
  config: ResolvedConfig,
  filter: { role?: EnvRole; project?: string; repo?: string } = {},
): { items: ListedEnv[]; recommended?: string; defaultEnv?: string } {
  const wantedRepo = filter.repo?.trim() ? normalizeRepoUrl(filter.repo) : undefined;
  const items = Object.entries(config.envs)
    .map(([id, record]) => toListedEnv(id, record, config.defaultEnv))
    .filter((item) => {
      if (filter.role && item.role !== filter.role) return false;
      if (filter.project && item.project !== filter.project) return false;
      if (wantedRepo && item.role === "project" && !item.allowRepos.includes(wantedRepo)) {
        return false;
      }
      return true;
    });
  return {
    items,
    recommended: recommendEnvId(config, filter.repo),
    defaultEnv: config.defaultEnv,
  };
}

export function recommendEnvId(config: ResolvedConfig, repo?: string): string | undefined {
  if (repo?.trim()) {
    const allocated = allocateEnvId(config, repo);
    if (allocated) {
      return allocated;
    }
  }
  return config.defaultEnv;
}

export function allocateEnvId(config: ResolvedConfig, repoUrl: string): string | undefined {
  const matches = Object.entries(config.envs).filter(
    ([, record]) => inferEnvRole(record) === "project" && repoAllowed(repoUrl, record.allowRepos),
  );
  if (matches.length === 1) {
    return matches[0][0];
  }
  if (matches.length > 1) {
    const ids = matches.map(([id]) => id);
    if (config.defaultEnv && ids.includes(config.defaultEnv)) {
      return config.defaultEnv;
    }
    throw new ConfigError(`Repo matches multiple project envs: ${ids.join(", ")}. Pass env.`);
  }
  return undefined;
}

function toListedEnv(id: string, record: EnvRecord, defaultEnv?: string): ListedEnv {
  return {
    id,
    role: inferEnvRole(record),
    type: record.type,
    name: record.name,
    project: record.project,
    allowRepos: (record.allowRepos ?? []).map((url) => {
      try {
        return normalizeRepoUrl(url);
      } catch {
        return url;
      }
    }),
    workdirRule: record.workdirRule,
    skillsPath: record.skillsPath,
    note: record.note,
    isDefault: defaultEnv === id,
  };
}

export function resolveLaunchTarget(
  config: ResolvedConfig,
  envId: string | undefined,
  repo?: LaunchRepo,
): LaunchTarget {
  const allocated = !envId?.trim() && repo?.url ? allocateEnvId(config, repo.url) : undefined;
  const rawId = envId?.trim() || allocated || config.defaultEnv;
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
