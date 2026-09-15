# Security

## Report a vulnerability

Open a private security advisory on the repository, or email the maintainers
listed on the latest release. Do not file a public issue for a key leak,
auth bypass, or host-pinning failure.

## What this package will never do

- Store a Cursor API key in git, npm, or plugin config.
- Send `repos` together with a named Cursor-hosted cloud environment.
- Follow redirects off `api.cursor.com`.
- Download artifacts or permanently delete agents in the default tool set.
- Interpolate run result text into a shell command line.

## Operational rules

1. Put `CURSOR_API_KEY` in the OpenClaw gateway environment (systemd
   `EnvironmentFile`, secret manager, or your host equivalent). The plugin
   only reads the variable named by `apiKeyEnv`.
2. Keep `apiBaseUrl` on `https://api.cursor.com` unless you are running the
   test suite with `CURSOR_CLOUD_ALLOW_INSECURE_HOST=1`.
3. Register environments by id. The model must not invent `env.type` /
   `env.name` payloads.
4. Treat `IDLE` as “follow-ups accepted,” not “the change is good.” Read
   `proof.prUrls` on the run record.
5. Do not put secrets in Cloud prompts, `envVars`, issues, or notify text.

## Default blast radius

Default tools: launch, reply, status, cancel, watch, me, envs, agents.

Optional tools (must be allowlisted): list, models.

The local agent JSON stores `bc-…` ids, env/project/repo, and run status — not API keys or prompt text.

Not shipped: archive, delete, artifact download URLs, GitHub repo listing.
