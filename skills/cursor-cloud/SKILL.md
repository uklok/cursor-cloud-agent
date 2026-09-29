---
name: cursor-cloud
description: >-
  Delegate a code change, investigation, or merge request to a Cursor Cloud
  saved environment with cursor_cloud_launch. Use when the user names a saved
  env or defaultEnv is set. If launch returns phase=choose, ask the user that
  tree and recall the tool — do not invent an env or bc-…. Leave local CLI
  coding and narrow remote lookups alone.
---

# Cursor Cloud

You are the coordinator. The Cloud agent is the implementer. The door is
`cursor_cloud_*`. The plugin owns harvest, session↔agent mapping, and
placement. If an older note says `CloudAgent` or `agent -p`, use these tools
instead.

## First proof

1. `cursor_cloud_me` → `ok: true`. If this fails, the key is not on the gateway.
2. `cursor_cloud_envs` lists the catalog filled at **plugin init** (GET /v1/agents harvest; v1 has no `/environments` route). Do not run a shell to populate it.
3. `cursor_cloud_launch` with the user prompt. Do not pass `fresh`/`env`/`agentId` unless the user already chose.
4. If the result `phase` is `choose`, ask the user `ask.question` and the `ask.options` labels. Then recall `cursor_cloud_launch` with that option's `recall` fields.
5. When `phase` is `launched` or `reused`, give the human `agent.id` (`bc-…`) and `agent.url`. Do not wait in this turn. Watch notify is not the transcript.
6. Pass `effort` as a spelling from the alias table (`low`, `med`, `high`, `xhigh`, or a catalog alias such as `medium`). The table picks the value that model lists. Example: `model=grok-4.6` and `effort=med` sends `medium` when that value is listed. Omit `fast` to keep the model default. Do not pass model, effort, or fast on `cursor_cloud_reply` (`model_locked`).

## Placement (plugin-owned)

Same chat / compact (`sessionId` unchanged): the plugin reuses the bound agent.
`/new` or `/reset` mints a new `sessionId` — the plugin asks again.

Tree when the user was not explicit:

1. Do you want to run this on a **fresh** agent?
   - Yes → which **ENV** (base = clone; project = repos already loaded)
   - No → which **named session** (label + `bc-…`)

Do not invent `{ type, name }` or a `bc-…`.

## Applies when

- A code change, investigation, or merge request should run on a saved Cloud env.
- The user names a registry id, or `defaultEnv` is configured.

## Does not apply when

- Narrow read-only lookup via a remote API.
- Pure chat with no Cloud work.
- The user requires local-machine-only work.

## Constraints

1. Pass a registry env id from `ask.envs` / `cursor_cloud_envs`. Never invent `{ type, name }`.
2. Pass `repo` only when that URL is in `allowRepos`. Named cloud envs still omit `repos` on the API.
3. Follow-ups: `cursor_cloud_reply` with the new user text only. Same `bc-…`. Never rewrite the launch prompt. If you pass `model`/`effort`/`fast`, the tool fails `model_locked`.
4. No secrets in prompts. Local JSON stores ids and session labels, not prompt text.
5. Do not block a tool turn waiting for Cloud. Do not treat watch as the result.
6. `cursor_cloud_agents` is empty until this plugin launches a `bc-…`. `cursor_cloud_list` is account history. Harvest skips unnamed envs. `IDLE` is not success.

## Prompt (every real run)

In this order: role; repo HTTPS + preferred SSH + starting ref; workdir rule; issues + order; org-skills path; done-when; out of scope. When the env is new, read [references/smoke.md](references/smoke.md) first.

## Done when

- The human has `agent.id` (`bc-…`) and `agent.url`.
- Completion leads with `proof.prUrls` or an exact blocker. `IDLE` is not success.
- Later nudges reused the same id, including after compact.
- Proof of a finished turn comes from `cursor_cloud_status`: `run.result` (final), `run.resultPartial` / `messages[]`, `artifacts[]`, `resolved`.
