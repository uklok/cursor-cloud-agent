import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../openclaw.plugin.json", import.meta.url);
const manifest = JSON.parse(readFileSync(path, "utf8"));
if (!Array.isArray(manifest.skills) || !manifest.skills.includes("./skills")) {
  manifest.skills = ["./skills"];
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}
