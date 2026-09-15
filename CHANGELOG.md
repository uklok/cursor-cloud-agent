# Changelog

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
