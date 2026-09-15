#!/usr/bin/env bash
# Bump package metadata for a release. Does not publish or push.
# Usage: ./scripts/release.sh 0.1.1
set -euo pipefail

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "usage: $0 <semver>" >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

VERSION="$version" node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from "node:fs";

const version = process.env.VERSION;
if (!version) {
  throw new Error("VERSION is required");
}
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const previous = pkg.version;
pkg.version = version;
pkg.openclaw = pkg.openclaw ?? {};
pkg.openclaw.install = pkg.openclaw.install ?? {};
pkg.openclaw.install.npmSpec = `${pkg.name}@${version}`;
writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

const manifest = JSON.parse(readFileSync("openclaw.plugin.json", "utf8"));
manifest.version = version;
writeFileSync("openclaw.plugin.json", `${JSON.stringify(manifest, null, 2)}\n`);

const date = new Date().toISOString().slice(0, 10);
const changelog = readFileSync("CHANGELOG.md", "utf8");
if (!changelog.includes(`## ${version}`)) {
  writeFileSync(
    "CHANGELOG.md",
    changelog.replace(
      "# Changelog\n",
      `# Changelog\n\n## ${version}\n\n- Release ${version} (from ${previous}) on ${date}.\n`,
    ),
  );
}
console.log(`${previous} -> ${version}`);
EOF

npm install --package-lock-only
echo "Next: git add -u && git commit && git tag v${version} && git push --follow-tags"
echo "Then: npm publish --access public   and/or   clawhub package publish ."
