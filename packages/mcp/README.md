# cursor-cloud-mcp

Stdio MCP server for the same `cursor_cloud_*` tools as the OpenClaw plugin.

```json
{
  "mcpServers": {
    "cursor-cloud": {
      "command": "cursor-cloud-mcp",
      "env": {
        "CURSOR_API_KEY": "${CURSOR_API_KEY}"
      }
    }
  }
}
```

Config: `CURSOR_CLOUD_CONFIG` or `~/.config/openclaw-cursor-cloud/config.json` (see `cursor-cloud-core` examples).
