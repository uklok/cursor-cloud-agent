# openclaw-plugin-cursor-cloud

OpenClaw plugin that delegates coding work to **Cursor Cloud Agents on named saved environments**. Also a CLI and stdio MCP server.

**Door:** `cursor_cloud_*` tools and the `cursor-cloud` skill.  
**Implementer:** a Cloud agent (`bc-…`).  
**Not the door:** `agent -p` (runs here), or `repos` together with a named cloud env.

Official API: [Cloud Agents API v1](https://cursor.com/docs/cloud-agent/api/endpoints). Host pin: `https://api.cursor.com`. Key: `CURSOR_API_KEY` on the gateway environment, never in git.

## You are done when

1. `cursor_cloud_me` (or `openclaw-cursor-cloud me`) returns `ok: true` and a key name.
2. A **new** chat can see `cursor_cloud_launch`.
3. `cursor_cloud_envs` lists a **base** env (clone the target) and any **project** envs (repos already loaded).
4. `cursor_cloud_launch` with a listed id returns `agent.id` (`bc-…`) and `agent.url`. A later chat reads `cursor_cloud_agents` and replies on that id.
5. A finished run is judged by `proof.prUrls` (or an exact blocker). `IDLE` only means follow-ups are accepted.

## Install

One command after npm publish:

```bash
npx -y openclaw-plugin-cursor-cloud@0.2.0 setup
```

From this checkout:

```bash
./scripts/install-gateway.sh
```

`setup` installs the plugin, enables it, enables the `cursor-cloud` skill, and adds `cursor-cloud` to `tools.alsoAllow`. It does not write keys.

Then:

```bash
# gateway EnvironmentFile — not openclaw.json
CURSOR_API_KEY=...
```

Restart the gateway. Open a new chat. Run the first proof above.

Pinned install without `npx` (still needs the key, env registry, restart, new chat):

```bash
openclaw plugins install npm:openclaw-plugin-cursor-cloud@0.2.0 --force --accept-capabilities
```

After a ClawHub publish, use `clawhub:<org>/openclaw-plugin-cursor-cloud` the same way.

## Register an environment

The model passes a **registry id** (`env: "payments"`), never an invented `{ type, name }`.

- **base** — bootstrap env. Clone the target when it is not the env primary.
- **project** — repos already loaded and prepared. Set `allowRepos` to those URLs and a `project` key.

Plugin init (gateway startup service) harvests named environments from documented `GET /v1/agents` + `GET /v1/agents/{id}` into `~/.local/state/openclaw-cursor-cloud/envs.json`. Official v1 has no environment-list route. Unnamed dashboard fallbacks cannot be launched by `env.name` and are skipped. `cursor_cloud_envs` reads that catalog; `refresh: true` only forces a new harvest.

`cursor_cloud_launch` is the placement operation. OpenClaw gives the plugin `sessionId` (new on `/new` and `/reset`, kept across compact). If this chat is already bound to a `bc-…`, launch reuses it. If the user was not explicit, launch returns `phase: choose` — ask that tree, then recall with the option's `recall` fields. The CLI skips the ask and uses `defaultEnv`.

Gateway: merge `examples/gateway-plugin.json` into `plugins.entries.cursor-cloud`.  
CLI: copy `examples/cli-config.json` to `~/.config/openclaw-cursor-cloud/config.json`.  
Allowlist only: `examples/instance-enable.batch.json`.

Named `cloud` envs omit `repos` on the wire even when `allowRepos` lists a URL.

Launched `bc-…` ids are written to `~/.local/state/openclaw-cursor-cloud/agents.json` (or `$XDG_STATE_HOME/...`). That file is not git. Override with `ledgerPath` (for example `state/agents.json` in a checkout — `state/` is gitignored).

## Tools

Always on: `cursor_cloud_launch`, `cursor_cloud_reply`, `cursor_cloud_status`, `cursor_cloud_cancel`, `cursor_cloud_watch`, `cursor_cloud_me`, `cursor_cloud_envs`, `cursor_cloud_agents`, `cursor_cloud_models`.

Optional until `setup` / `tools.alsoAllow`: `cursor_cloud_list`.

`cursor_cloud_status` returns final/partial result, `messages[]`, and short-lived artifact download refs. It does not download artifact bytes onto the coordinator.

Not shipped: archive, delete, GitHub repository listing.

When to call which: `skills/cursor-cloud/SKILL.md`.

## CLI and MCP

```bash
export CURSOR_API_KEY=...
openclaw-cursor-cloud me
openclaw-cursor-cloud envs --refresh
openclaw-cursor-cloud agents
openclaw-cursor-cloud launch --env base --prompt "Smoke the env, then stop."
openclaw-cursor-cloud reply --agent-id bc-… --prompt "Continue on the same branch."
openclaw-cursor-cloud mcp
```

MCP (`examples/mcp.json`) uses the same CLI config as above unless `CURSOR_CLOUD_CONFIG` is set.

Watch notify: the waiter injects `openclaw agent --session-key` / `--session-id` for the originating chat. Override with `watch.notifyCommand`. Safe placeholders: `{agentId} {runId} {runStatus} {url} {prUrl}`. Result text stays in `CURSOR_CLOUD_RESULT`, not the command line. Watch is not the transcript — poll `cursor_cloud_status`.

Launch: `model` plus optional `effort` and `fast`. Effort spellings go through one alias table; the table's preferred value is what the catalog receives (`med` prefers `medium`). Reply cannot change those (`model_locked`). Default when `effort`/`fast` are omitted: the model's own variant (often fast).

## Versioning

`package.json` and `openclaw.plugin.json` share the semver. Authors: `CONTRIBUTING.md`.

## License

MIT
