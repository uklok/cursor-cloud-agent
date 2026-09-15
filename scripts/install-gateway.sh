#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [[ ! -f dist/cli.js ]]; then
  npm install
  npm run plugin:build
fi

exec node "$root/dist/cli.js" setup --source link
