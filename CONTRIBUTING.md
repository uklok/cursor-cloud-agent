# Contributing

## Layout

| Path | Role |
| --- | --- |
| `packages/core` | `cursor-cloud-core` — API client, harvest, actions, CLI |
| `packages/plugin` | `openclaw-plugin-cursor-cloud` — OpenClaw tools, skill, setup |
| `packages/mcp` | `cursor-cloud-mcp` — stdio MCP server |
| `packages/core/src/client.ts` | Cursor Cloud Agents API v1 |
| `packages/core/src/actions.ts` | launch/reply/status/cancel/watch |
| `packages/plugin/src/plugin.ts` | `defineToolPlugin` |
| `packages/mcp/src/mcp.ts` | JSON-RPC tools/list + tools/call |

Re-read [Cursor Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints) when changing the client. Do not copy community MCP source into this tree.

## Checks

```bash
npm install
npm test
npm run build
npm run plugin:build
npm run plugin:validate
```

Commit `packages/plugin/openclaw.plugin.json` when tool names or config schema change.

## Release

1. `./scripts/release.sh <semver>`
2. Commit the version bump (`chore: release <semver>`).
3. Tag `v<semver>` and push the tag.
4. Publish **core**, then **mcp**, then **plugin** (`npm publish --access public` in each package).
5. `clawhub package publish packages/plugin` when the ClawHub owner is ready.

## Rules that should not regress

1. API host stays pinned to `api.cursor.com`.
2. Named `cloud` environments never send `repos`.
3. Tools return immediately. Waiting belongs to `watch`.
4. API keys come from the environment, never from git or plugin config.
5. Do not add archive/delete/artifact tools to the default set.
6. Operator and skill first proof stay `cursor_cloud_me` then a `bc-…`.
7. Launched-agent JSON stays off git (`agents.json` / `state/`).
8. Core has no OpenClaw or MCP dependency. Plugin and MCP both depend on core only.
