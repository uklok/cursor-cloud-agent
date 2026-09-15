import { composePrompt, proofFromRun } from "./brief.js";
import { CursorCloudApiError } from "./errors.js";
import { assertAgentId, assertRunId } from "./ids.js";
import { readLedger, upsertLedger } from "./ledger.js";
import { isWatchLocked, tryAcquireWatchLock } from "./lock.js";
import { notifyValues, runNotifyCommand } from "./notify.js";
import { defaultLockDir } from "./paths.js";
import { resolveLaunchTarget } from "./registry.js";
import type { Runtime } from "./runtime.js";
import type { ConversationMode } from "./types.js";
import { watchRun } from "./waiter.js";
import { spawnWatch } from "./watch-process.js";

export type LaunchParams = {
  prompt: string;
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

export async function launchAction(runtime: Runtime, params: LaunchParams) {
  const target = resolveLaunchTarget(
    runtime.config,
    params.env,
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
  upsertLedger(
    {
      agentId,
      runId,
      envId: target.envId,
      name: created.agent.name ?? params.name,
      url: created.agent.url,
      lastRunStatus: created.run.status,
    },
    runtime.ledgerPath,
  );
  const watch = params.watch === false ? undefined : startWatch(runtime, { agentId, runId });
  return {
    ok: true as const,
    next: "Do not block this turn. Use cursor_cloud_reply on this agentId for follow-ups. Treat IDLE as follow-ups accepted, not success — read proof.prUrls.",
    envId: target.envId,
    env: target.payload.env,
    omittedRepo: target.omittedRepo,
    agent: summarizeAgent(created.agent),
    run: summarizeRun(created.run),
    watch,
  };
}

export async function replyAction(runtime: Runtime, params: ReplyParams) {
  const agentId = assertAgentId(params.agentId);
  try {
    const created = await runtime.client.createRun(agentId, {
      prompt: { text: params.prompt },
      mode: params.mode,
    });
    const runId = created.run.id;
    upsertLedger({ agentId, runId, lastRunStatus: created.run.status }, runtime.ledgerPath);
    const watch = params.watch === false ? undefined : startWatch(runtime, { agentId, runId });
    return {
      ok: true as const,
      next: "Follow-up enqueued on the same agent. Do not launch a new bc-… unless this stream is dead.",
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
  return { ok: true as const, items: readLedger(runtime.ledgerPath) };
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
