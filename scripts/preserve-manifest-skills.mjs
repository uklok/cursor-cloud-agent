import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../openclaw.plugin.json", import.meta.url);
const manifest = JSON.parse(readFileSync(path, "utf8"));
let dirty = false;
if (!Array.isArray(manifest.skills) || !manifest.skills.includes("./skills")) {
  manifest.skills = ["./skills"];
  dirty = true;
}
if (!Array.isArray(manifest.categories) || manifest.categories.length === 0) {
  manifest.categories = ["tools"];
  dirty = true;
}
if (dirty) {
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}
