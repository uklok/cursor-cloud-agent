import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const PACKAGE_NAME = "cursor-cloud-mcp";
export const VERSION: string = require("../package.json").version;
