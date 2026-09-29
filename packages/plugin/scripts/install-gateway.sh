#!/usr/bin/env bash
set -euo pipefail

plugin="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "$plugin/../.." && pwd)"

if [[ ! -f "$plugin/dist/cli.js" ]]; then
  (cd "$root" && npm install && npm run plugin:build)
fi

exec node "$plugin/dist/cli.js" setup --source link
