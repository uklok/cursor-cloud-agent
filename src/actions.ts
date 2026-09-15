import { composePrompt, proofFromRun } from "./brief.js";
import { CursorCloudApiError } from "./errors.js";
import { assertAgentId, assertRunId } from "./ids.js";
import { ensureHarvested } from "./harvest.js";
import { agentsForTarget, readLedger, upsertLedger } from "./ledger.js";
import { resolvePlacement, sessionLabel, type SessionRef } from "./placement.js";
import { isWatchLocked, tryAcquireWatchLock } from "./lock.js";
import { notifyValues, runNotifyCommand } from "./notify.js";
import { defaultLockDir } from "./paths.js";
import { fetchEnvCatalog, mergeCatalogIntoConfig, readEnvCatalog, writeEnvCatalog } from "./env-catalog.js";
import { inferEnvRole, listRegisteredEnvs, resolveLaunchTarget } from "./registry.js";
import type { EnvRole } from "./types.js";
import type { Runtime } from "./runtime.js";
import type { ConversationMode } from "./types.js";
import { watchRun } from "./waiter.js";
import { spawnWatch } from "./watch-process.js";

export type LaunchParams = {
  prompt: string;
  fresh?: boolean;
  agentId?: string;
  sessionName?: string;
  env?: string;
  name?: string;
  model?: string;
  mode?: ConversationMode;
  repo?: string;
  startingRef?: string;
  autoCreatePR?: boolean;
  watch?: boolean;
  idempotencyKey?: string;
};

export type ReplyParams = {
  agentId: string;
  prompt: string;
  mode?: ConversationMode;
  watch?: boolean;
};

export async function launchAction(
  runtime: Runtime,
  params: LaunchParams,
  session: SessionRef = {},
) {
  await ensureHarvested(runtime);
  const envs = listRegisteredEnvs(runtime.config).items;
  const agents = readLedger(runtime.ledgerPath);
  const placement = resolvePlacement({
    params: {
      prompt: params.prompt,
      fresh: params.fresh,
      env: params.env,
      agentId: params.agentId,
      sessionName: params.sessionName ?? params.name,
    },
    session,
    agents,
    envs,
    defaultEnv: runtime.config.defaultEnv,
    interactive: Boolean(session.sessionId || session.sessionKey),
  });
  if (placement.kind === "ask") {
    return {
      ok: true as const,
      phase: "choose" as const,
      next: "Ask the user using ask.question and ask.options. Then recall cursor_cloud_launch with the chosen recall fields. Do not invent an env or bc-….",
      session,
      ask: placement.ask,
    };
  }
  if (placement.kind === "reuse") {
    return replyAction(
      runtime,
      { agentId: placement.agentId, prompt: params.prompt, mode: params.mode, watch: params.watch },
      session,
    );
  }
  const target = resolveLaunchTarget(
    runtime.config,
    placement.envId,
    params.repo ? { url: params.repo, startingRef: params.startingRef } : undefined,
  );
  const created = await runtime.client.createAgent(
    {
      prompt: { text: composePrompt(params.prompt, target.record, target.omittedRepo) },
      name: params.name,
      model: params.model ? { id: params.model } : undefined,
      mode: params.mode,
      autoCreatePR: params.autoCreatePR,
      ...target.payload,
    },
    { idempotencyKey: params.idempotencyKey },
  );
  const agentId = created.agent.id;
  const runId = created.run.id ?? created.agent.latestRunId;
  const existing = agentsForTarget(runtime.ledgerPath, {
    envId: target.envId,
    repo: target.omittedRepo,
    project: target.record.project,
  }).filter((item) => item.agentId !== agentId);
  upsertLedger(
    {
      agentId,
      runId,
      envId: target.envId,
      envName: target.record.name,
      envRole: inferEnvRole(target.record),
      project: target.record.project,
      repo: target.omittedRepo,
      name: created.agent.name ?? params.sessionName ?? params.name,
      url: created.agent.url,
      sessionId: session.sessionId,
      sessionKey: session.sessionKey,
      lastRunStatus: created.run.status,
    },
    runtime.ledgerPath,
  );
  const watch = params.watch === false ? undefined : startWatch(runtime, { agentId, runId });
  return {
    ok: true as const,
    next: existing.length
      ? "New bc-… launched. Other sessions already have agents for this env — prefer cursor_cloud_reply on those ids unless this is a new stream. Do not wait in this turn."
      : "Do not block this turn. Use cursor_cloud_reply on this agentId for follow-ups. Treat IDLE as follow-ups accepted, not success — read proof.prUrls.",
    phase: "launched" as const,
    session,
    envId: target.envId,
    envRole: inferEnvRole(target.record),
    env: target.payload.env,
    omittedRepo: target.omittedRepo,
    agent: summarizeAgent(created.agent),
    run: summarizeRun(created.run),
    existing,
    watch,
  };
}

export async function replyAction(
  runtime: Runtime,
  params: ReplyParams,
  session: SessionRef = {},
) {
  const agentId = assertAgentId(params.agentId);
  try {
    const created = await runtime.client.createRun(agentId, {
      prompt: { text: params.prompt },
      mode: params.mode,
    });
    const runId = created.run.id;
    upsertLedger(
      {
        agentId,
        runId,
        lastRunStatus: created.run.status,
        sessionId: session.sessionId,
        sessionKey: session.sessionKey,
      },
      runtime.ledgerPath,
    );
    const watch = params.watch === false ? undefined : startWatch(runtime, { agentId, runId });
    return {
      ok: true as const,
      phase: "reused" as const,
      next: "Follow-up enqueued on the same agent. Do not launch a new bc-… unless this stream is dead.",
      session,
      agent: { id: agentId },
      run: summarizeRun(created.run),
      watch,
    };
  } catch (error) {
    if (error instanceof CursorCloudApiError && error.httpStatus === 409) {
      throw new CursorCloudApiError(
        409,
        `Agent ${agentId} is busy. Call cursor_cloud_status, wait, or cursor_cloud_cancel the active run.`,
        { apiCode: error.apiCode, details: error.details, cause: error },
      );
    }
    throw error;
  }
}

export async function statusAction(
  runtime: Runtime,
  params: { agentId: string; runId?: string },
) {
  const agentId = assertAgentId(params.agentId);
  const agent = await runtime.client.getAgent(agentId);
  const runId = params.runId ? assertRunId(params.runId) : agent.latestRunId;
  const run = runId ? await runtime.client.getRun(agentId, runId) : undefined;
  if (run) {
    upsertLedger(
      {
        agentId,
        runId: run.id,
        url: agent.url,
        name: agent.name,
        lastRunStatus: run.status,
      },
      runtime.ledgerPath,
    );
  }
  return {
    ok: true as const,
    agent: summarizeAgent(agent),
    run: run ? summarizeRun(run) : undefined,
    proof: run ? proofFromRun(run) : undefined,
  };
}

export async function cancelAction(
  runtime: Runtime,
  params: { agentId: string; runId?: string },
) {
  const agentId = assertAgentId(params.agentId);
  const runId = params.runId
    ? assertRunId(params.runId)
    : (await runtime.client.getAgent(agentId)).latestRunId;
  if (!runId) {
    throw new CursorCloudApiError(409, `No run to cancel on ${agentId}`);
  }
  const cancelled = await runtime.client.cancelRun(agentId, runId);
  upsertLedger({ agentId, runId, lastRunStatus: "CANCELLED" }, runtime.ledgerPath);
  return { ok: true as const, agent: { id: agentId }, run: { id: cancelled.id, runStatus: "CANCELLED" } };
}

export async function watchAction(
  runtime: Runtime,
  params: { agentId: string; runId?: string; foreground?: boolean },
) {
  const agentId = assertAgentId(params.agentId);
  const runId = params.runId ? assertRunId(params.runId) : undefined;
  if (params.foreground) {
    return watchForeground(runtime, { agentId, runId });
  }
  return {
    ok: true as const,
    ...startWatch(runtime, { agentId, runId }),
  };
}

export async function watchForeground(
  runtime: Runtime,
  params: { agentId: string; runId?: string },
) {
  const lock = tryAcquireWatchLock(params.agentId, defaultLockDir());
  if (!lock.acquired) {
    return { ok: true as const, watching: false, alreadyWatching: true, agent: { id: params.agentId } };
  }
  try {
    const { agent, run } = await watchRun(runtime.client, {
      agentId: params.agentId,
      runId: params.runId,
      watch: runtime.config.watch,
    });
    upsertLedger(
      {
        agentId: agent.id,
        runId: run.id,
        url: agent.url,
        name: agent.name,
        lastRunStatus: run.status,
      },
      runtime.ledgerPath,
    );
    const values = notifyValues(agent, run);
    const notify = await runNotifyCommand(runtime.config.watch.notifyCommand, values, {
      env: runtime.env,
    });
    return {
      ok: true as const,
      watching: false,
      agent: summarizeAgent(agent),
      run: summarizeRun(run),
      proof: proofFromRun(run),
      notify,
    };
  } finally {
    lock.release?.();
  }
}

export async function listAction(runtime: Runtime, params: { limit?: number } = {}) {
  const listed = await runtime.client.listAgents({ limit: Math.min(params.limit ?? 10, 20) });
  return {
    ok: true as const,
    items: (listed.items ?? []).map(summarizeAgent),
    nextCursor: listed.nextCursor,
  };
}

export async function envsAction(
  runtime: Runtime,
  params: { role?: EnvRole; project?: string; repo?: string; refresh?: boolean } = {},
) {
  let config = runtime.config;
  let fetchedAt: string | undefined;
  let unnamedSkipped = 0;
  if (params.refresh) {
    const catalog = await fetchEnvCatalog(runtime.client);
    writeEnvCatalog(catalog, runtime.catalogPath);
    config = mergeCatalogIntoConfig(runtime.config, catalog);
    runtime.config = config;
    fetchedAt = catalog.fetchedAt;
    unnamedSkipped = catalog.unnamedSkipped;
  } else {
    await ensureHarvested(runtime);
    config = runtime.config;
    fetchedAt = readEnvCatalog(runtime.catalogPath).fetchedAt || undefined;
  }
  const listed = listRegisteredEnvs(config, params);
  return {
    ok: true as const,
    path: runtime.catalogPath,
    fetchedAt,
    unnamedSkipped,
    next: "Pass a listed id to cursor_cloud_launch. Catalog is filled at plugin init. Use a project env when allowRepos matches; use the base env to clone.",
    ...listed,
  };
}

export function agentsAction(
  runtime: Runtime,
  params: { env?: string; project?: string; repo?: string } = {},
) {
  const items = agentsForTarget(runtime.ledgerPath, {
    envId: params.env,
    project: params.project,
    repo: params.repo,
  });
  return {
    ok: true as const,
    path: runtime.ledgerPath,
    next: items.length
      ? "Reply on an existing bc-… for the same env or project. Launch only for a new stream."
      : "No local agents yet. After cursor_cloud_me, launch with a listed env id.",
    items: items.map((item) => ({ ...item, label: sessionLabel(item) })),
  };
}

export async function modelsAction(runtime: Runtime) {
  const models = await runtime.client.listModels();
  return {
    ok: true as const,
    items: (models.items ?? []).map((model) => ({
      id: model.id,
      displayName: model.displayName,
      aliases: model.aliases,
    })),
  };
}

export async function meAction(runtime: Runtime) {
  const me = await runtime.client.getMe();
  return {
    ok: true as const,
    apiKeyName: me.apiKeyName,
    createdAt: me.createdAt,
    scoped: me.userId ? "user" : "service",
  };
}

export function ledgerAction(runtime: Runtime) {
  return agentsAction(runtime);
}

function startWatch(runtime: Runtime, input: { agentId: string; runId?: string }) {
  if (isWatchLocked(input.agentId)) {
    return { watching: false, alreadyWatching: true, agentId: input.agentId, runId: input.runId };
  }
  return spawnWatch(runtime, input);
}

function summarizeAgent(agent: {
  id: string;
  name?: string;
  status?: string;
  url?: string;
  latestRunId?: string;
  env?: { type?: string; name?: string };
}) {
  return {
    id: agent.id,
    name: agent.name,
    lifecycle: agent.status,
    url: agent.url,
    latestRunId: agent.latestRunId,
    env: agent.env,
  };
}

function summarizeRun(run: {
  id: string;
  agentId?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  durationMs?: number;
  result?: string;
  git?: { branches?: Array<{ repoUrl?: string; branch?: string; prUrl?: string }> };
}) {
  return {
    id: run.id,
    agentId: run.agentId,
    runStatus: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    durationMs: run.durationMs,
    result: run.result,
    git: run.git,
  };
}
