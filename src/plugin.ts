import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import {
  agentsAction,
  cancelAction,
  envsAction,
  launchAction,
  listAction,
  meAction,
  modelsAction,
  replyAction,
  statusAction,
  watchAction,
} from "./actions.js";
import { pluginConfigSchema } from "./config.js";
import { formatError } from "./errors.js";
import { registerHarvestService } from "./harvest.js";
import type { SessionRef } from "./placement.js";
import { createRuntime } from "./runtime.js";
import {
  agentsParamsSchema,
  cancelParamsSchema,
  emptyParamsSchema,
  envsParamsSchema,
  launchParamsSchema,
  listParamsSchema,
  replyParamsSchema,
  statusParamsSchema,
  watchParamsSchema,
} from "./tool-schemas.js";

function toolResult(value: unknown, failed = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    details: value,
    ...(failed ? { isError: true } : {}),
  };
}

function sessionFrom(toolContext: { sessionId?: string; sessionKey?: string }): SessionRef {
  return { sessionId: toolContext.sessionId, sessionKey: toolContext.sessionKey };
}

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

const plugin = defineToolPlugin({
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
        "Resolve then launch or reuse a Cloud agent. If the OpenClaw session is not already bound and the user did not say fresh/reuse + env/agent, returns phase=choose — ask the user with that tree, then recall this tool with the recall fields. Do not invent env payloads.",
      parameters: launchParamsSchema,
      factory({ config, toolContext }) {
        return {
          name: "cursor_cloud_launch",
          label: "Cursor Cloud Launch",
          description:
            "Resolve then launch or reuse a Cloud agent. phase=choose means ask the user; do not guess.",
          parameters: launchParamsSchema,
          execute: async (_id: string, params: Record<string, unknown>) => {
            try {
              const runtime = createRuntime(config);
              return toolResult(await launchAction(runtime, params as never, sessionFrom(toolContext)));
            } catch (error) {
              return toolResult(formatError(error), true);
            }
          },
        };
      },
    }),
    tool({
      name: "cursor_cloud_reply",
      label: "Cursor Cloud Reply",
      description:
        "Post a new user message on an existing bc-… (never rewrite the launch prompt). 409 if a run is active. model/effort/fast fail with model_locked.",
      parameters: replyParamsSchema,
      factory({ config, toolContext }) {
        return {
          name: "cursor_cloud_reply",
          label: "Cursor Cloud Reply",
          description:
            "New Cursor user message on the same bc-…. Returns followUpAccepted and the new runId. model/effort/fast → model_locked.",
          parameters: replyParamsSchema,
          execute: async (_id: string, params: Record<string, unknown>) => {
            try {
              const runtime = createRuntime(config);
              return toolResult(await replyAction(runtime, params as never, sessionFrom(toolContext)));
            } catch (error) {
              return toolResult(formatError(error), true);
            }
          },
        };
      },
    }),
    tool({
      name: "cursor_cloud_status",
      label: "Cursor Cloud Status",
      description:
        "Read lifecycle, final/partial result, messages[], artifacts[], and resolved { model, effort, fast, mode }. IDLE ≠ success.",
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
        "Start a detached waiter. Returns immediately. On terminal status it injects a notify into this OpenClaw session. Poll cursor_cloud_status for the transcript — watch is not the result.",
      parameters: watchParamsSchema,
      factory({ config, toolContext }) {
        return {
          name: "cursor_cloud_watch",
          label: "Cursor Cloud Watch",
          description:
            "Detached waiter that notifies this OpenClaw session when the run is terminal. Not the transcript.",
          parameters: watchParamsSchema,
          execute: async (_id: string, params: Record<string, unknown>) => {
            try {
              const runtime = createRuntime(config);
              return toolResult(await watchAction(runtime, params as never, sessionFrom(toolContext)));
            } catch (error) {
              return toolResult(formatError(error), true);
            }
          },
        };
      },
    }),
    tool({
      name: "cursor_cloud_envs",
      label: "Cursor Cloud Envs",
      description:
        "List locally registered Cloud environments (filled by plugin init harvest from GET /v1/agents). refresh:true forces a new harvest. Pass a listed id to launch.",
      parameters: envsParamsSchema,
      execute: (params, config) => runTool(config, async (runtime) => envsAction(runtime, params)),
    }),
    tool({
      name: "cursor_cloud_agents",
      label: "Cursor Cloud Agents",
      description:
        "Local named sessions: bc-… agents mapped to OpenClaw sessionId. Survives compact. Prefer launch, which reuses the bound session when it can.",
      parameters: agentsParamsSchema,
      execute: (params, config) => runTool(config, async (runtime) => agentsAction(runtime, params)),
    }),
    tool({
      name: "cursor_cloud_list",
      label: "Cursor Cloud List",
      description: "List recent Cloud agents for this API key. Optional; prefer cursor_cloud_agents.",
      parameters: listParamsSchema,
      optional: true,
      execute: (params, config) => runTool(config, (runtime) => listAction(runtime, params)),
    }),
    tool({
      name: "cursor_cloud_models",
      label: "Cursor Cloud Models",
      description:
        "List model ids, parameters, and labeled variants. Effort spellings map through the alias table onto each model's catalog value.",
      parameters: emptyParamsSchema,
      execute: (_params, config) => runTool(config, (runtime) => modelsAction(runtime)),
    }),
    tool({
      name: "cursor_cloud_me",
      label: "Cursor Cloud Auth Check",
      description:
        "First proof the gateway key works. Returns ok and key name, never email. Call before cursor_cloud_launch.",
      parameters: emptyParamsSchema,
      execute: (_params, config) => runTool(config, (runtime) => meAction(runtime)),
    }),
  ],
});

const previousRegister = plugin.register.bind(plugin);
plugin.register = ((api: Parameters<typeof previousRegister>[0]) => {
  previousRegister(api);
  registerHarvestService(api);
}) as typeof plugin.register;

export default plugin;
