---
name: cursor-cloud
description: >-
  Use when an OpenClaw agent must delegate a code change, investigation, or
  merge request to a Cursor Cloud saved environment. Launch once, reply on the
  same bc-…, omit repos on named cloud envs, and never wait in a tool turn.
---

# Cursor Cloud coordinator

**You are the coordinator.** The Cursor Cloud agent is the senior implementer.

Use the `cursor_cloud_*` tools from plugin `cursor-cloud`. Do not implement the
change on this host. Do not shell out to `agent -p` to target a named saved
environment — that CLI does not launch named Cloud envs.

## Applies when

- Non-trivial code change, investigation, or merge request.
- The user names a saved environment, or `defaultEnv` is configured.
- The environment's primary repo may not be the repo under change.

## Does not apply when

- Narrow read-only lookup via a remote API.
- Pure chat with no code change.
- The user requires local-machine-only work.

## Hard constraints

1. Pass a **registry env id** (`env: "prod"`), never a free-form `{ type, name }` object you invented.
2. **Never** pass `repo` unless that exact URL is in the env's `allowRepos`. Named cloud environments still omit `repos` on the API.
3. Prefer **`cursor_cloud_reply`** on the same `bc-…`. Launch only for a new stream.
4. Every prompt seeds: role, repo + preferred clone URL + starting ref, workdir rule, issues + order, org-skills path, done-when, out of scope.
5. No secrets in prompts.
6. Do not block a tool turn waiting for Cloud. Launch/reply start a detached watcher by default. Use `cursor_cloud_status` if you need a snapshot.

## Senior brief (every real run)

1. Role — “You are the senior … for …”
2. Repo to own — HTTPS + preferred SSH + starting ref
3. Workdir rule — separate path when env primary ≠ target
4. Issues owned + attack order
5. Org skills — apply under the configured skills path
6. Done when — MR/PR URL / tests / counts
7. Out of scope

## Deliver to the human

- Opening ack with `agentId` (`bc-…`) and the Cursor agent URL.
- On completion, lead with the proof URL from `proof.prUrls`. `IDLE` means follow-ups are accepted, not that the change is good.
- Continue with `cursor_cloud_reply` on the same id.
