import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import {
  cancelAction,
  launchAction,
  ledgerAction,
  listAction,
  meAction,
  modelsAction,
  replyAction,
  statusAction,
  watchAction,
} from "./actions.js";
import { pluginConfigSchema } from "./config.js";
import { formatError } from "./errors.js";
import { createRuntime } from "./runtime.js";
import {
  cancelParamsSchema,
  emptyParamsSchema,
  launchParamsSchema,
  listParamsSchema,
  replyParamsSchema,
  statusParamsSchema,
  watchParamsSchema,
} from "./tool-schemas.js";

async function runTool<T>(
  config: unknown,
  execute: (runtime: ReturnType<typeof createRuntime>) => Promise<T>,
): Promise<T | ReturnType<typeof formatError>> {
  try {
    return await execute(createRuntime(config as never));
  } catch (error) {
    return formatError(error);
  }
}

export default defineToolPlugin({
  id: "cursor-cloud",
  name: "Cursor Cloud",
  description:
    "Launch and coordinate Cursor Cloud Agents on named saved environments. Does not run coding work on the OpenClaw host.",
  configSchema: pluginConfigSchema,
  tools: (tool) => [
    tool({
      name: "cursor_cloud_launch",
      label: "Cursor Cloud Launch",
      description:
        "Create a Cursor Cloud agent on a registered environment and enqueue the first run. Pass a registry env id, never a free-form env payload. Do not pass repo unless that exact URL is in allowRepos; named cloud environments still omit repos on the wire. Returns immediately with agentId (bc-…) and runId. Follow-ups must use cursor_cloud_reply on the same agentId.",
      parameters: launchParamsSchema,
      execute: (params, config) => runTool(config, (runtime) => launchAction(runtime, params)),
    }),
    tool({
      name: "cursor_cloud_reply",
      label: "Cursor Cloud Reply",
      description:
        "Send a follow-up prompt to an existing bc-… agent. Prefer this over launch. Returns 409 if a run is already active.",
      parameters: replyParamsSchema,
      execute: (params, config) => runTool(config, (runtime) => replyAction(runtime, params)),
    }),
    tool({
      name: "cursor_cloud_status",
      label: "Cursor Cloud Status",
      description:
        "Read durable agent lifecycle plus the latest (or specified) run. IDLE means follow-ups are accepted, not that the change succeeded — inspect proof.prUrls and run.result.",
      parameters: statusParamsSchema,
      execute: (params, config) => runTool(config, (runtime) => statusAction(runtime, params)),
    }),
    tool({
      name: "cursor_cloud_cancel",
      label: "Cursor Cloud Cancel",
      description:
        "Cancel the active run on a bc-… agent. Terminal. Continue with cursor_cloud_reply on the same agent, not a new launch.",
      parameters: cancelParamsSchema,
      execute: (params, config) => runTool(config, (runtime) => cancelAction(runtime, params)),
    }),
    tool({
      name: "cursor_cloud_watch",
      label: "Cursor Cloud Watch",
      description:
        "Start a detached waiter for a run. Returns immediately. The waiter polls until the run is terminal and then runs notifyCommand / OPENCLAW_NOTIFY. Do not block a tool turn waiting for Cloud.",
      parameters: watchParamsSchema,
      execute: (params, config) => runTool(config, (runtime) => watchAction(runtime, params)),
    }),
    tool({
      name: "cursor_cloud_list",
      label: "Cursor Cloud List",
      description: "List recent Cloud agents for this API key. Optional; prefer the local ledger.",
      parameters: listParamsSchema,
      optional: true,
      execute: (params, config) => runTool(config, (runtime) => listAction(runtime, params)),
    }),
    tool({
      name: "cursor_cloud_models",
      label: "Cursor Cloud Models",
      description: "List model ids accepted by POST /v1/agents. Optional.",
      parameters: emptyParamsSchema,
      optional: true,
      execute: (_params, config) => runTool(config, (runtime) => modelsAction(runtime)),
    }),
    tool({
      name: "cursor_cloud_me",
      label: "Cursor Cloud Auth Check",
      description: "Check that CURSOR_API_KEY is valid. Does not return email.",
      parameters: emptyParamsSchema,
      execute: (_params, config) => runTool(config, (runtime) => meAction(runtime)),
    }),
    tool({
      name: "cursor_cloud_ledger",
      label: "Cursor Cloud Ledger",
      description: "Local recent bc-… ids launched from this host. Optional.",
      parameters: emptyParamsSchema,
      optional: true,
      execute: (_params, config) => runTool(config, async (runtime) => ledgerAction(runtime)),
    }),
  ],
});
