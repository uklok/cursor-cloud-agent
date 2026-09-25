import { listArtifactRefs } from "./artifacts.js";
import { composePrompt, proofFromRun } from "./brief.js";
import { CursorCloudApiError, FollowUpError, ModelLockedError } from "./errors.js";
import { assertAgentId, assertRunId } from "./ids.js";
import { ensureHarvested } from "./harvest.js";
import { agentsForTarget, readLedger, upsertLedger } from "./ledger.js";
import { parseAgentModel, resolveModelSelection } from "./model.js";
import { resolvePlacement, sessionLabel, type SessionRef } from "./placement.js";
import { isWatchLocked, tryAcquireWatchLock } from "./lock.js";
import { notifyValues, resolveWatchSession, runNotifyCommand } from "./notify.js";
import { defaultLockDir } from "./paths.js";
import { fetchEnvCatalog, mergeCatalogIntoConfig, readEnvCatalog, writeEnvCatalog } from "./env-catalog.js";
import { inferEnvRole, listRegisteredEnvs, resolveLaunchTarget } from "./registry.js";
import type { ArtifactRef, ConversationMode, EnvRole, ResolvedModel } from "./types.js";
import type { Runtime } from "./runtime.js";
import {
  classifyResult,
  loadTranscript,
  saveTranscript,
  type TranscriptState,
} from "./transcript.js";
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
  effort?: string;
  fast?: boolean;
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
  model?: string;
  effort?: string;
  fast?: boolean;
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
      {
        agentId: placement.agentId,
        prompt: params.prompt,
        mode: params.mode,
        model: params.model,
        effort: params.effort,
        fast: params.fast,
        watch: params.watch,
      },
      session,
    );
  }

  const catalog =
    params.effort || params.fast !== undefined
      ? ((await runtime.client.listModels()).items ?? [])
      : undefined;
  const model = resolveModelSelection(
    { model: params.model, effort: params.effort, fast: params.fast, mode: params.mode },
    catalog,
  );

  const target = resolveLaunchTarget(
    runtime.config,
    placement.envId,
    params.repo ? { url: params.repo, startingRef: params.startingRef } : undefined,
  );
  const created = await runtime.client.createAgent(
    {
      prompt: { text: composePrompt(params.prompt, target.record, target.omittedRepo) },
      name: params.name,
      model: model.selection,
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
  persistSnapshot(runtime, {
    agentId,
    runId,
    envId: target.envId,
    envName: target.record.name,
    envRole: inferEnvRole(target.record),
    project: target.record.project,
    repo: target.omittedRepo,
    name: created.agent.name ?? params.sessionName ?? params.name,
    url: created.agent.url,
    session,
    lastRunStatus: created.run.status,
    resolved: model.resolved,
    followUpAccepted: false,
  });
  const watch = params.watch === false ? undefined : startWatch(runtime, { agentId, runId, session });
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
    resolved: model.resolved,
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
  if (params.model || params.effort || params.fast !== undefined) {
    throw new ModelLockedError(
      `Follow-up cannot change model, effort, or fast on ${agentId}. POST /v1/agents/{id}/runs has no model field. Omit those fields, or launch a fresh agent.`,
    );
  }
  const existing = await runtime.client.getAgent(agentId);
  const previousRunId = existing.latestRunId;
  try {
    const created = await runtime.client.createRun(agentId, {
      prompt: { text: params.prompt },
      mode: params.mode,
    });
    const runId = created.run.id;
    const followUpAccepted = Boolean(runId && runId !== previousRunId);
    if (!followUpAccepted) {
      throw new FollowUpError(
        `Follow-up was not accepted as a new Cursor run on ${agentId}. previousRunId=${previousRunId ?? "none"} runId=${runId ?? "none"}.`,
      );
    }
    persistSnapshot(runtime, {
      agentId,
      runId,
      url: existing.url,
      name: existing.name,
      session,
      lastRunStatus: created.run.status,
      followUpAccepted: true,
      previousRunId,
      resolved: { mode: params.mode },
    });
    const watch = params.watch === false ? undefined : startWatch(runtime, { agentId, runId, session });
    return {
      ok: true as const,
      phase: "reused" as const,
      next: "New user message enqueued on the same agent (POST /v1/agents/{id}/runs). Do not launch a new bc-… unless this stream is dead. Watch is not the transcript.",
      session,
      agent: { id: agentId },
      run: summarizeRun(created.run),
      previousRunId,
      followUpAccepted: true,
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
  const ledger = readLedger(runtime.ledgerPath).find((item) => item.agentId === agentId);
  const transcript = runId ? loadTranscript(runtime.ledgerPath, runId) : undefined;
  const artifacts = await listArtifactRefs(runtime.client, agentId).catch(() => [] as ArtifactRef[]);
  const classified = classifyResult({
    runStatus: run?.status,
    result: run?.result,
    transcript,
  });
  const resolved = resolveStatusModel(agent, ledger);
  if (run) {
    persistSnapshot(runtime, {
      agentId,
      runId: run.id,
      url: agent.url,
      name: agent.name,
      lastRunStatus: run.status,
      resolved,
      followUpAccepted: ledger?.runId === run.id ? ledger.followUpAccepted : undefined,
    });
  }
  return {
    ok: true as const,
    next: "IDLE means follow-ups are accepted, not success. Prefer run.result (final), run.resultPartial, messages, and artifacts over watch.",
    agent: summarizeAgent(agent),
    run: run
      ? {
          ...summarizeRun(run),
          result: classified.result ?? run.result,
          resultPartial: classified.resultPartial,
          resultTruncated: classified.resultTruncated,
        }
      : undefined,
    messages: transcript?.messages ?? [],
    artifacts,
    resolved,
    followUpAccepted: ledger?.runId === run?.id ? Boolean(ledger?.followUpAccepted) : false,
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
  persistSnapshot(runtime, { agentId, runId, lastRunStatus: "CANCELLED" });
  return { ok: true as const, agent: { id: agentId }, run: { id: cancelled.id, runStatus: "CANCELLED" } };
}

export async function watchAction(
  runtime: Runtime,
  params: { agentId: string; runId?: string; foreground?: boolean },
  session: SessionRef = {},
) {
  const agentId = assertAgentId(params.agentId);
  const runId = params.runId ? assertRunId(params.runId) : undefined;
  if (params.foreground) {
    return watchForeground(runtime, { agentId, runId, session });
  }
  return {
    ok: true as const,
    next: "Waiter started. It will notify this OpenClaw session on terminal status. Poll cursor_cloud_status for the transcript; do not treat watch as the result.",
    ...startWatch(runtime, { agentId, runId, session }),
  };
}

export async function watchForeground(
  runtime: Runtime,
  params: { agentId: string; runId?: string; session?: SessionRef },
) {
  const session = resolveWatchSession(runtime, params.agentId, params.session);
  const lock = tryAcquireWatchLock(params.agentId, defaultLockDir());
  if (!lock.acquired) {
    return { ok: true as const, watching: false, alreadyWatching: true, agent: { id: params.agentId } };
  }
  try {
    let transcript: TranscriptState | undefined = loadTranscript(runtime.ledgerPath, params.runId);
    const { agent, run, transcript: watched } = await watchRun(runtime.client, {
      agentId: params.agentId,
      runId: params.runId,
      watch: runtime.config.watch,
      transcript,
      onTick: ({ agent: current, run: currentRun, transcript: tickTranscript }) => {
        persistSnapshot(runtime, {
          agentId: current.id,
          runId: currentRun.id,
          url: current.url,
          name: current.name,
          session,
          lastRunStatus: currentRun.status,
        });
        if (tickTranscript) {
          saveTranscript(runtime.ledgerPath, tickTranscript);
          transcript = tickTranscript;
        }
      },
    });
    if (watched) {
      saveTranscript(runtime.ledgerPath, watched);
      transcript = watched;
    }
    persistSnapshot(runtime, {
      agentId: agent.id,
      runId: run.id,
      url: agent.url,
      name: agent.name,
      session,
      lastRunStatus: run.status,
    });
    const values = notifyValues(agent, run);
    const notify = await runNotifyCommand(runtime.config.watch.notifyCommand, values, {
      env: runtime.env,
      session,
    });
    return {
      ok: true as const,
      watching: false,
      agent: summarizeAgent(agent),
      run: summarizeRun(run),
      messages: transcript?.messages ?? [],
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
    next: "Account history from GET /v1/agents. cursor_cloud_agents is the local bind catalog and stays empty until a launch from this plugin.",
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
    const catalog = readEnvCatalog(runtime.catalogPath);
    fetchedAt = catalog.fetchedAt || undefined;
    unnamedSkipped = catalog.unnamedSkipped;
  }
  const listed = listRegisteredEnvs(config, params);
  return {
    ok: true as const,
    path: runtime.catalogPath,
    fetchedAt,
    unnamedSkipped,
    next: "Pass a listed id to cursor_cloud_launch. Catalog is filled at plugin init. Unnamed dashboard envs cannot be launched by env.name and are skipped. Use a project env when allowRepos matches; use the base env to clone.",
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
      : "Local bind catalog is empty until this plugin launches (or replies) a bc-…. cursor_cloud_list still sees account history.",
    items: items.map((item) => ({ ...item, label: sessionLabel(item) })),
  };
}

export async function modelsAction(runtime: Runtime) {
  const models = await runtime.client.listModels();
  return {
    ok: true as const,
    next: "Pass model as the item id (grok-4.6). Express Grok 4.6 Med as model=grok-4.6 effort=med, not a separate id. fast is a boolean param. Defaults: omit effort/fast to use Cursor's variant.",
    effort: ["low", "med", "high"],
    fast: [false, true],
    items: (models.items ?? []).map((model) => ({
      id: model.id,
      displayName: model.displayName,
      description: model.description,
      aliases: model.aliases,
      parameters: model.parameters,
      variants: model.variants,
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

function startWatch(runtime: Runtime, input: { agentId: string; runId?: string; session?: SessionRef }) {
  if (isWatchLocked(input.agentId)) {
    return { watching: false, alreadyWatching: true, agentId: input.agentId, runId: input.runId };
  }
  const handle = spawnWatch(runtime, input);
  persistSnapshot(runtime, {
    agentId: input.agentId,
    runId: input.runId,
    session: input.session,
    watchPid: handle.pid,
  });
  return handle;
}

function persistSnapshot(
  runtime: Runtime,
  input: {
    agentId: string;
    runId?: string;
    envId?: string;
    envName?: string;
    envRole?: EnvRole;
    project?: string;
    repo?: string;
    name?: string;
    url?: string;
    session?: SessionRef;
    lastRunStatus?: string;
    lastEventId?: string;
    followUpAccepted?: boolean;
    previousRunId?: string;
    resolved?: ResolvedModel;
    watchPid?: number;
  },
) {
  upsertLedger(
    {
      agentId: input.agentId,
      runId: input.runId,
      envId: input.envId,
      envName: input.envName,
      envRole: input.envRole,
      project: input.project,
      repo: input.repo,
      name: input.name,
      url: input.url,
      sessionId: input.session?.sessionId,
      sessionKey: input.session?.sessionKey,
      lastRunStatus: input.lastRunStatus,
      lastEventId: input.lastEventId,
      followUpAccepted: input.followUpAccepted,
      previousRunId: input.previousRunId,
      requestedModel: input.resolved?.model,
      requestedEffort: input.resolved?.effort,
      requestedFast: input.resolved?.fast,
      requestedMode: input.resolved?.mode,
      resolvedModelId: input.resolved?.id,
      watchPid: input.watchPid,
    },
    runtime.ledgerPath,
  );
}

function resolveStatusModel(
  agent: { model?: unknown },
  ledger: ReturnType<typeof readLedger>[number] | undefined,
): ResolvedModel {
  const parsed = parseAgentModel(agent.model);
  return {
    model: ledger?.requestedModel ?? parsed.id,
    effort: ledger?.requestedEffort as ResolvedModel["effort"],
    fast: ledger?.requestedFast,
    mode: ledger?.requestedMode,
    id: ledger?.resolvedModelId ?? parsed.id,
    params: parsed.params,
  };
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
