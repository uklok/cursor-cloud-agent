import { ConfigError } from "./errors.js";

const AGENT_ID = /^bc-[A-Za-z0-9-]+$/;
const RUN_ID = /^run-[A-Za-z0-9-]+$/;
const ENV_ID = /^[a-z0-9][a-z0-9._-]*$/;

export function assertAgentId(value: string): string {
  const id = value.trim();
  if (!AGENT_ID.test(id)) {
    throw new ConfigError(`Invalid agent id '${value}'. Expected bc-…`);
  }
  return id;
}

export function assertRunId(value: string): string {
  const id = value.trim();
  if (!RUN_ID.test(id)) {
    throw new ConfigError(`Invalid run id '${value}'. Expected run-…`);
  }
  return id;
}

export function assertEnvId(value: string): string {
  const id = value.trim();
  if (!ENV_ID.test(id)) {
    throw new ConfigError(
      `Invalid env registry id '${value}'. Use lowercase letters, digits, '.', '_' or '-'.`,
    );
  }
  return id;
}

export function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}
