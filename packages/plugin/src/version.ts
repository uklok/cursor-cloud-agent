import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const PACKAGE_NAME = "openclaw-plugin-cursor-cloud";
export const VERSION: string = require("../package.json").version;
