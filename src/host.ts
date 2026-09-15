import { ConfigError } from "./errors.js";
import { DEFAULT_API_BASE_URL, PINNED_API_HOSTS } from "./version.js";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

export type HostPolicy = {
  allowInsecureHost?: boolean;
};

export function resolveApiBaseUrl(
  value: string | undefined,
  policy: HostPolicy = {},
): string {
  const raw = (value ?? DEFAULT_API_BASE_URL).trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ConfigError(`Invalid apiBaseUrl '${raw}'`);
  }

  const insecure = policy.allowInsecureHost === true;
  const loopback = LOOPBACK.has(parsed.hostname);

  if (parsed.username || parsed.password) {
    throw new ConfigError("apiBaseUrl must not include credentials");
  }
  if (parsed.protocol !== "https:") {
    if (!(insecure && parsed.protocol === "http:" && loopback)) {
      throw new ConfigError(
        `Refusing non-HTTPS API origin '${parsed.origin}'. Pin https://api.cursor.com.`,
      );
    }
  }
  if (!PINNED_API_HOSTS.includes(parsed.hostname)) {
    if (!(insecure && loopback)) {
      throw new ConfigError(
        `Refusing unpinned API host '${parsed.hostname}'. Allowed: ${PINNED_API_HOSTS.join(", ")}.`,
      );
    }
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new ConfigError("apiBaseUrl must be an origin (no path). Paths are /v1/…");
  }

  return parsed.origin;
}

export function isRedirectAllowed(from: string, location: string, policy: HostPolicy = {}): boolean {
  try {
    const next = new URL(location, from);
    resolveApiBaseUrl(next.origin, policy);
    return true;
  } catch {
    return false;
  }
}
