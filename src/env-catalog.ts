import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CursorCloudClient } from "./client.js";
import { envIdFromName } from "./ids.js";
import { defaultEnvCatalogPath, ensureDir } from "./paths.js";
import { inferEnvRole, normalizeRepoUrl } from "./registry.js";
import type { AgentRecord, EnvRecord, EnvRole, EnvType, ResolvedConfig } from "./types.js";

export type CatalogEnv = {
  id: string;
  type: EnvType;
  name: string;
  role: EnvRole;
  project?: string;
  allowRepos: string[];
  seenAgentIds: string[];
};

export type EnvCatalog = {
  fetchedAt: string;
  source: string;
  unnamedSkipped: number;
  items: CatalogEnv[];
};

const SOURCE = "GET /v1/agents + GET /v1/agents/{id}";
const MAX_PAGES = 3;

export function readEnvCatalog(path = defaultEnvCatalogPath()): EnvCatalog {
  if (!existsSync(path)) {
    return { fetchedAt: "", source: SOURCE, unnamedSkipped: 0, items: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as EnvCatalog;
    return {
      fetchedAt: parsed.fetchedAt ?? "",
      source: parsed.source ?? SOURCE,
      unnamedSkipped: parsed.unnamedSkipped ?? 0,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { fetchedAt: "", source: SOURCE, unnamedSkipped: 0, items: [] };
  }
}

export function writeEnvCatalog(catalog: EnvCatalog, path = defaultEnvCatalogPath()): EnvCatalog {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  return catalog;
}

export async function fetchEnvCatalog(
  client: CursorCloudClient,
  now = new Date(),
): Promise<EnvCatalog> {
  const agents: AgentRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const listed = await client.listAgents({ limit: 20, cursor });
    for (const item of listed.items ?? []) {
      const full = item.env?.name && item.repos ? item : await client.getAgent(item.id);
      agents.push(full);
    }
    if (!listed.nextCursor) {
      break;
    }
    cursor = listed.nextCursor;
  }
  return catalogFromAgents(agents, now);
}

export function catalogFromAgents(agents: AgentRecord[], now = new Date()): EnvCatalog {
  const grouped = new Map<string, CatalogEnv>();
  let unnamedSkipped = 0;
  for (const agent of agents) {
    const type = (agent.env?.type as EnvType | undefined) ?? "cloud";
    const name = agent.env?.name?.trim();
    if (!name) {
      unnamedSkipped += 1;
      continue;
    }
    const id = envIdFromName(name);
    const key = `${type}:${id}`;
    const repos = (agent.repos ?? [])
      .map((repo) => repo.url)
      .filter((url): url is string => Boolean(url))
      .map((url) => {
        try {
          return normalizeRepoUrl(url);
        } catch {
          return url.trim();
        }
      });
    const current = grouped.get(key);
    if (!current) {
      const allowRepos = unique(repos);
      const role: EnvRole = allowRepos.length > 0 ? "project" : "base";
      grouped.set(key, {
        id,
        type,
        name,
        role,
        project: role === "project" ? id : undefined,
        allowRepos,
        seenAgentIds: [agent.id],
      });
      continue;
    }
    current.allowRepos = unique([...current.allowRepos, ...repos]);
    if (!current.seenAgentIds.includes(agent.id)) {
      current.seenAgentIds.push(agent.id);
    }
    if (current.allowRepos.length > 0 && current.role === "base") {
      current.role = "project";
      current.project = current.project ?? current.id;
    }
  }
  return {
    fetchedAt: now.toISOString(),
    source: SOURCE,
    unnamedSkipped,
    items: [...grouped.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function mergeCatalogIntoConfig(config: ResolvedConfig, catalog: EnvCatalog): ResolvedConfig {
  const envs: Record<string, EnvRecord> = { ...config.envs };
  for (const item of catalog.items) {
    const existing = envs[item.id];
    if (!existing) {
      envs[item.id] = {
        type: item.type,
        name: item.name,
        role: item.role,
        project: item.project,
        allowRepos: item.allowRepos.length > 0 ? item.allowRepos : undefined,
      };
      continue;
    }
    envs[item.id] = {
      ...existing,
      name: existing.name || item.name,
      role: existing.role ?? inferEnvRole({ ...existing, role: item.role, allowRepos: item.allowRepos }),
      project: existing.project ?? item.project,
      allowRepos: unique([...(existing.allowRepos ?? []), ...item.allowRepos]),
    };
  }
  return { ...config, envs };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
