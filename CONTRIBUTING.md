# Contributing

## Layout

| Path | Role |
| --- | --- |
| `src/client.ts` | Cursor Cloud Agents API v1 |
| `src/registry.ts` | Env ids → `env` payload; base vs project allocation |
| `src/ledger.ts` | Local `agents.json` of launched `bc-…` |
| `src/env-catalog.ts` | Harvest named envs from `GET /v1/agents` |
| `src/harvest.ts` | Gateway init harvest service |
| `src/placement.ts` | Fresh vs reuse; session-bound agents |
| `src/actions.ts` | Shared launch/reply/status/cancel/watch |
| `src/plugin.ts` | OpenClaw tools |
| `src/cli.ts` / `src/mcp.ts` | Other surfaces |
| `src/setup.ts` | One-command gateway install |
| `skills/cursor-cloud/` | Agent door and first-proof |
| `examples/gateway-plugin.json` | Gateway plugin config |
| `examples/cli-config.json` | CLI config |

Re-read [Cursor Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints) when changing the client. Do not copy community MCP source into this tree.

## Checks

```bash
npm install
npm test
npm run plugin:build
npm run plugin:validate
```

Commit the generated `openclaw.plugin.json` when tool names or config schema change.

## Release

1. `./scripts/release.sh <semver>`
2. Commit the version bump (`chore: release <semver>`).
3. Tag `v<semver>` and push the tag (publishes npm when `NPM_TOKEN` is set).
4. `clawhub package publish .` when the ClawHub owner is ready.
5. After ClawHub exists, set `package.json#openclaw.install.clawhubSpec`.

## Rules that should not regress

1. API host stays pinned to `api.cursor.com`.
2. Named `cloud` environments never send `repos`.
3. Tools return immediately. Waiting belongs to `watch`.
4. API keys come from the environment, never from git or plugin config.
5. Do not add archive/delete/artifact tools to the default set.
6. Operator and skill first proof stay `cursor_cloud_me` then a `bc-…`.
7. Launched-agent JSON stays off git (`agents.json` / `state/`).
