# Changelog

## 0.1.0

- OpenClaw `defineToolPlugin` with launch, reply, status, cancel, and watch.
- Env registry that omits `repos` on named Cursor-hosted cloud environments.
- HTTP client for Cursor Cloud Agents API v1, pinned to `api.cursor.com`.
- Detached waiter with backoff, per-agent lock, and notify-on-terminal.
- CLI and stdio MCP surfaces sharing the same actions.
- Optional list / models / me / ledger tools. No archive, delete, or artifact URLs.
