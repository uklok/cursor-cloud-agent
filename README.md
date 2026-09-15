# openclaw-plugin-cursor-cloud

OpenClaw plugin, CLI, and stdio MCP server that **delegate coding work to Cursor Cloud Agents on named saved environments**.

The coordinator stays on your OpenClaw host. The implementer is a Cloud agent (`bc-…`). This package talks to the official [Cloud Agents API v1](https://cursor.com/docs/cloud-agent/api/endpoints). It does **not** run `agent -p` and it does **not** treat a local Cursor CLI worker as a named Cloud environment.

## Why this exists

`POST /v1/agents` can target a saved environment:

```json
{ "env": { "type": "cloud", "name": "Production" } }
```

`env` and `repos` are mutually exclusive for a named Cursor-hosted environment. Community wrappers often expose `repos` and omit `env`, then block the tool turn for up to ten minutes. That cannot target a saved env whose primary repo is not the product under change, and it is a bad fit for an OpenClaw coordinator turn.

This package:

- Resolves a **registry id** → `{ type, name }` so the model cannot invent env payloads
- **Omits `repos`** on named `cloud` environments (even when the URL is allowlisted)
- Returns **immediately** from launch/reply; a detached waiter polls and notifies
- Pins the API host to `api.cursor.com`
- Reads `CURSOR_API_KEY` from the process environment, never from git

## Install (OpenClaw)

```bash
npm install
npm run plugin:build
openclaw plugins install --link .
openclaw plugins enable cursor-cloud
```

Put the key on the **gateway** environment, not in `openclaw.json`:

```bash
# systemd EnvironmentFile, or equivalent
CURSOR_API_KEY=...
```

Plugin config (`plugins.entries.cursor-cloud.config`):

```json
{
  "defaultEnv": "prod",
  "envs": {
    "prod": {
      "type": "cloud",
      "name": "Production",
      "workdirRule": "SSH clone the target repo to /tmp/<slug> when it is not the environment primary.",
      "skillsPath": "~/.cursor/skills"
    }
  }
}
```

See `examples/openclaw.snippet.json`. Restart or reload the gateway after install.

## Tools

Default (always offered):

| Tool | API |
| --- | --- |
| `cursor_cloud_launch` | `POST /v1/agents` |
| `cursor_cloud_reply` | `POST /v1/agents/{id}/runs` |
| `cursor_cloud_status` | `GET` agent + latest run |
| `cursor_cloud_cancel` | `POST …/runs/{runId}/cancel` |
| `cursor_cloud_watch` | Detached poll until terminal |

Optional (allowlist explicitly): `cursor_cloud_list`, `cursor_cloud_models`, `cursor_cloud_me`, `cursor_cloud_ledger`.

Not shipped: archive, delete, artifact download URLs, GitHub repository listing.

`IDLE` on the durable agent means follow-ups are accepted. Success is a PR/MR URL on the run record (`proof.prUrls`).

## CLI

```bash
export CURSOR_API_KEY=...
cp examples/plugin-config.json ~/.config/openclaw-cursor-cloud/config.json

openclaw-cursor-cloud launch --env prod --prompt "Smoke the env, then stop."
openclaw-cursor-cloud reply --agent-id bc-… --prompt "Continue on the same branch."
openclaw-cursor-cloud status --agent-id bc-…
openclaw-cursor-cloud watch --agent-id bc-… --run-id run-…
```

Notify when a watched run finishes:

```bash
# env vars: CURSOR_CLOUD_AGENT_ID, CURSOR_CLOUD_RUN_STATUS, CURSOR_CLOUD_PR_URL, CURSOR_CLOUD_RESULT, …
export OPENCLAW_NOTIFY=1
# or set watch.notifyCommand in config. Safe placeholders: {agentId} {runId} {runStatus} {url} {prUrl}
```

Result text is **not** interpolated into the command line.

## MCP

```bash
openclaw-cursor-cloud mcp
```

Same tools, JSON-RPC stdio, no extra runtime dependency.

## What this is not

- Not an official Cursor or OpenClaw package.
- Not a wrapper around `@eyueldk/cursor-cloud-agent-mcp`. Endpoints were checked against current v1 docs and reimplemented.
- Not `@cursor/sdk` `Agent.create({ cloud: { repos } })`. Named saved envs need `env.name` on REST.
- Not `agent worker` registration. Starting a Cloud worker on a shared guest is a tenancy decision, not a default.

## Publish

```bash
npm test
npm run plugin:validate
npm pack
# clawhub package publish . --dry-run
```

ClawHub is the preferred OpenClaw discovery surface; npm works as `openclaw-plugin-cursor-cloud`.

## License

MIT
