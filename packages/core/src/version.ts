import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const PACKAGE_NAME = "cursor-cloud-core";
export const VERSION: string = require("../package.json").version;
export const USER_AGENT = `${PACKAGE_NAME}/${VERSION}`;
export const DEFAULT_API_BASE_URL = "https://api.cursor.com";
export const PINNED_API_HOSTS = Object.freeze(["api.cursor.com"]);
