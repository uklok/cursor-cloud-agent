# Changelog

## 0.2.0

- `cursor_cloud_launch` accepts `effort` (`low|med|high`) and `fast` and sends them as `model.params`.
- `cursor_cloud_models` is always on and returns parameters/variants. Express Grok 4.6 Med as `grok-4.6` + `effort=med`.
- `cursor_cloud_reply` posts a new user message (`POST /v1/agents/{id}/runs`). `model`/`effort`/`fast` fail with `model_locked`. Returns `followUpAccepted`.
- `cursor_cloud_status` returns `run.result` (final), `run.resultPartial`, `messages[]`, `artifacts[]` (short-lived download refs), and `resolved { model, effort, fast, mode }`.
- Watch notifies the originating OpenClaw session (`openclaw agent --session-key/--session-id`) and updates `agents.json` on every tick. Watch is not the transcript.

## 0.1.0

- OpenClaw `defineToolPlugin` with launch, reply, status, cancel, watch, and me.
- Env registry that omits `repos` on named Cursor-hosted cloud environments.
- HTTP client for Cursor Cloud Agents API v1, pinned to `api.cursor.com`.
- Detached waiter with backoff, per-agent lock, and notify-on-terminal.
- CLI, stdio MCP, and `setup` for one-command gateway install.
- Plugin skill `cursor-cloud` declared in the manifest; first proof is `cursor_cloud_me` then a `bc-…`.
- Local `agents.json` registry of launched `bc-…` ids (survives new chats).
- Plugin init harvests named environments from `GET /v1/agents` into `envs.json`.
- `cursor_cloud_launch` maps OpenClaw `sessionId` to `bc-…` and returns a choose-tree when placement is not explicit.
- Optional list / models tools. No archive, delete, or artifact URLs.
