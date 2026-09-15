import type { LedgerEntry } from "./ledger.js";
import type { ListedEnv } from "./registry.js";

export type SessionRef = {
  sessionId?: string;
  sessionKey?: string;
};

export type LaunchChoice = {
  prompt: string;
  fresh?: boolean;
  env?: string;
  agentId?: string;
  sessionName?: string;
};

export type ChoiceOption = {
  id: string;
  label: string;
  recall: LaunchChoice;
};

export type PlacementAsk = {
  question: string;
  options: ChoiceOption[];
  envs: Array<{ id: string; label: string; role: string }>;
  sessions: Array<{
    agentId: string;
    label: string;
    envId?: string;
    sessionId?: string;
    url?: string;
  }>;
};

export type Placement =
  | { kind: "fresh"; envId: string }
  | { kind: "reuse"; agentId: string; reason: "explicit" | "session-bound" }
  | { kind: "ask"; ask: PlacementAsk };

export function resolvePlacement(input: {
  params: LaunchChoice;
  session: SessionRef;
  agents: LedgerEntry[];
  envs: ListedEnv[];
  defaultEnv?: string;
  interactive: boolean;
}): Placement {
  const { params, session, agents, envs, defaultEnv, interactive } = input;
  if (params.agentId?.trim()) {
    return { kind: "reuse", agentId: params.agentId.trim(), reason: "explicit" };
  }

  if (!interactive) {
    return {
      kind: "fresh",
      envId: params.env?.trim() || defaultEnv || requiredEnv(envs),
    };
  }

  if (params.fresh === true) {
    if (params.env?.trim()) {
      return { kind: "fresh", envId: params.env.trim() };
    }
    return { kind: "ask", ask: envAsk(params, envs) };
  }

  if (params.fresh === false) {
    return { kind: "ask", ask: reuseAsk(params, agents, envs) };
  }

  const bound = agents.filter(
    (item) => session.sessionId && item.sessionId === session.sessionId,
  );
  if (bound.length === 1 && !params.env) {
    return { kind: "reuse", agentId: bound[0].agentId, reason: "session-bound" };
  }

  return { kind: "ask", ask: rootAsk(params, agents, envs, bound) };
}

export function sessionLabel(entry: Pick<LedgerEntry, "name" | "envId" | "sessionId" | "agentId">): string {
  if (entry.name?.trim()) {
    return entry.name.trim();
  }
  const env = entry.envId ?? "cloud";
  const short = entry.sessionId?.slice(0, 8) ?? entry.agentId.slice(3, 11);
  return `${env} · ${short}`;
}

function rootAsk(
  params: LaunchChoice,
  agents: LedgerEntry[],
  envs: ListedEnv[],
  bound: LedgerEntry[],
): PlacementAsk {
  const sessions = namedSessions(agents);
  return {
    question: "Do you want to run this on a fresh agent?",
    options: [
      {
        id: "fresh",
        label: "Yes — start a new Cloud agent",
        recall: { prompt: params.prompt, fresh: true, sessionName: params.sessionName },
      },
      {
        id: "reuse",
        label: "No — reuse a named session",
        recall: { prompt: params.prompt, fresh: false, sessionName: params.sessionName },
      },
      ...bound.map((item) => ({
        id: item.agentId,
        label: `Reuse this chat's ${sessionLabel(item)}`,
        recall: { prompt: params.prompt, agentId: item.agentId },
      })),
    ],
    envs: envChoices(envs),
    sessions,
  };
}

function envAsk(params: LaunchChoice, envs: ListedEnv[]): PlacementAsk {
  return {
    question: "Which ENV should the new agent use?",
    options: envs.map((env) => ({
      id: env.id,
      label: `${env.name} (${env.role}${env.isDefault ? ", default" : ""})`,
      recall: { prompt: params.prompt, fresh: true, env: env.id, sessionName: params.sessionName },
    })),
    envs: envChoices(envs),
    sessions: [],
  };
}

function reuseAsk(params: LaunchChoice, agents: LedgerEntry[], envs: ListedEnv[]): PlacementAsk {
  const sessions = namedSessions(agents);
  return {
    question: "Which of the following agents do you want to reuse?",
    options: sessions.map((item) => ({
      id: item.agentId,
      label: item.label,
      recall: { prompt: params.prompt, agentId: item.agentId },
    })),
    envs: envChoices(envs),
    sessions,
  };
}

function namedSessions(agents: LedgerEntry[]) {
  return agents.map((item) => ({
    agentId: item.agentId,
    label: sessionLabel(item),
    envId: item.envId,
    sessionId: item.sessionId,
    url: item.url,
  }));
}

function envChoices(envs: ListedEnv[]) {
  return envs.map((env) => ({
    id: env.id,
    label: `${env.name} (${env.role})`,
    role: env.role,
  }));
}

function requiredEnv(envs: ListedEnv[]): string {
  const fallback = envs.find((env) => env.isDefault) ?? envs[0];
  if (!fallback) {
    throw new Error("No registered environments. Wait for plugin init harvest or add envs to plugin config.");
  }
  return fallback.id;
}
