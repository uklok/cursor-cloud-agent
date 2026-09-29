# cursor-cloud-agent

Three packages, one coordinator. Coding work runs on **Cursor Cloud Agents** (`bc-…`), not on the host.

| Package | npm | Role |
| --- | --- | --- |
| `packages/core` | `cursor-cloud-core` | API client, harvest, launch/reply/status/watch, `cursor-cloud` CLI |
| `packages/plugin` | `openclaw-plugin-cursor-cloud` | OpenClaw `cursor_cloud_*` tools + skill |
| `packages/mcp` | `cursor-cloud-mcp` | Stdio MCP server for the same tools |

**Not the door:** `agent -p` on the coordinator, or `repos` together with a named cloud env.

Official API: [Cloud Agents API v1](https://cursor.com/docs/cloud-agent/api/endpoints). Host pin: `https://api.cursor.com`. Key: `CURSOR_API_KEY`, never in git.

## You are done when

1. `cursor_cloud_me` (or `cursor-cloud me`) returns `ok: true` and a key name.
2. A **new** OpenClaw chat can see `cursor_cloud_launch`, **or** an MCP client lists the same tools.
3. `cursor_cloud_envs` lists a **base** env and any **project** envs.
4. Launch returns `agent.id` (`bc-…`) and `agent.url`. Follow-ups use `cursor_cloud_reply`.
5. A finished run is judged by `proof.prUrls` (or an exact blocker). `IDLE` only means follow-ups are accepted.

## OpenClaw plugin

```bash
npx -y openclaw-plugin-cursor-cloud@0.3.0 setup
# from this checkout:
./scripts/install-gateway.sh
```

`setup` links **this repo’s `packages/plugin`**, enables the plugin and `cursor-cloud` skill, and adds `cursor-cloud` to `tools.alsoAllow`. It does not write keys.

```bash
CURSOR_API_KEY=...   # gateway EnvironmentFile — not openclaw.json
```

Restart the gateway. Open a **new** chat.

```bash
openclaw plugins install npm:openclaw-plugin-cursor-cloud@0.3.0 --force --accept-capabilities
```

Gateway config: merge `packages/plugin/examples/gateway-plugin.json` into `plugins.entries.cursor-cloud`.

## MCP server

```json
{
  "mcpServers": {
    "cursor-cloud": {
      "command": "cursor-cloud-mcp",
      "env": { "CURSOR_API_KEY": "${CURSOR_API_KEY}" }
    }
  }
}
```

See `packages/mcp/examples/mcp.json`. Same config file as the CLI: `CURSOR_CLOUD_CONFIG` or `~/.config/openclaw-cursor-cloud/config.json` (`packages/core/examples/cli-config.json`).

`openclaw-cursor-cloud mcp` still delegates to `cursor-cloud-mcp`.

## CLI

```bash
export CURSOR_API_KEY=...
cursor-cloud me
cursor-cloud envs --refresh
cursor-cloud launch --env base --prompt "Smoke the env, then stop."
cursor-cloud reply --agent-id bc-… --prompt "Continue on the same branch."
```

Launch: `model` plus optional `effort` and `fast`. Effort spellings go through one alias table; the table's preferred value is what the catalog receives (`med` prefers `medium`). Reply cannot change those (`model_locked`).

## Environments and tools

The model passes a **registry id** (`env: "payments"`), never an invented `{ type, name }`. Harvest (plugin init or `envs --refresh`) fills named envs from `GET /v1/agents`. Unnamed dashboard envs are skipped.

Always-on tools: launch, reply, status, cancel, watch, me, envs, agents, models. Optional: list.

`cursor_cloud_status` returns final/partial result, `messages[]`, and short-lived artifact download refs. Watch is not the transcript.

Skill: `packages/plugin/skills/cursor-cloud/SKILL.md`.

## Versioning

Workspace packages share the semver. `./scripts/release.sh <semver>` bumps all three. Authors: `CONTRIBUTING.md`.

## License

MIT
