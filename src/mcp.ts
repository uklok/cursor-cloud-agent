import { createInterface } from "node:readline";
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
import { formatError } from "./errors.js";
import { loadCliConfig } from "./load-config.js";
import { createRuntime, type Runtime } from "./runtime.js";
import {
  cancelParamsSchema,
  emptyParamsSchema,
  jsonSchema,
  launchParamsSchema,
  listParamsSchema,
  replyParamsSchema,
  statusParamsSchema,
  watchParamsSchema,
} from "./tool-schemas.js";
import { PACKAGE_NAME, VERSION } from "./version.js";

type JsonRpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

const TOOLS = [
  {
    name: "cursor_cloud_launch",
    description: "Create a Cursor Cloud agent on a registered environment.",
    inputSchema: jsonSchema(launchParamsSchema),
  },
  {
    name: "cursor_cloud_reply",
    description: "Follow up on an existing bc-… agent.",
    inputSchema: jsonSchema(replyParamsSchema),
  },
  {
    name: "cursor_cloud_status",
    description: "Read agent lifecycle and the latest run.",
    inputSchema: jsonSchema(statusParamsSchema),
  },
  {
    name: "cursor_cloud_cancel",
    description: "Cancel the active run on a bc-… agent.",
    inputSchema: jsonSchema(cancelParamsSchema),
  },
  {
    name: "cursor_cloud_watch",
    description: "Start a detached waiter. Returns immediately.",
    inputSchema: jsonSchema(watchParamsSchema),
  },
  {
    name: "cursor_cloud_list",
    description: "List recent Cloud agents.",
    inputSchema: jsonSchema(listParamsSchema),
  },
  {
    name: "cursor_cloud_models",
    description: "List Cloud model ids.",
    inputSchema: jsonSchema(emptyParamsSchema),
  },
  {
    name: "cursor_cloud_me",
    description: "Check API key validity without returning email.",
    inputSchema: jsonSchema(emptyParamsSchema),
  },
  {
    name: "cursor_cloud_ledger",
    description: "Local recent bc-… ledger.",
    inputSchema: jsonSchema(emptyParamsSchema),
  },
];

export async function startMcpServer(
  runtimeFactory: () => Runtime = () => createRuntime(loadCliConfig()),
): Promise<void> {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let message: JsonRpc;
    try {
      message = JSON.parse(trimmed) as JsonRpc;
    } catch {
      writeRpc({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } });
      continue;
    }
    const result = await handle(message, runtimeFactory);
    if (result) {
      writeRpc(result);
    }
  }
}

export async function handle(
  message: JsonRpc,
  runtimeFactory: () => Runtime,
): Promise<Record<string, unknown> | undefined> {
  if (message.id === undefined && message.method?.startsWith("notifications/")) {
    return undefined;
  }
  try {
    const result = await dispatch(message, runtimeFactory);
    return { jsonrpc: "2.0", id: message.id ?? null, result };
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id: message.id ?? null,
      error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
    };
  }
}

async function dispatch(message: JsonRpc, runtimeFactory: () => Runtime): Promise<unknown> {
  switch (message.method) {
    case "initialize":
      return {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: PACKAGE_NAME, version: VERSION },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call":
      return callTool(runtimeFactory(), String(message.params?.name ?? ""), (message.params?.arguments ?? {}) as Record<string, unknown>);
    default:
      throw new Error(`Unsupported method '${message.method ?? ""}'`);
  }
}

async function callTool(runtime: Runtime, name: string, args: Record<string, unknown>) {
  try {
    const result = await invoke(runtime, name, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: isFailedResult(result),
    };
  } catch (error) {
    const formatted = formatError(error);
    return {
      content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }],
      isError: true,
    };
  }
}

async function invoke(runtime: Runtime, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "cursor_cloud_launch":
      return launchAction(runtime, args as never);
    case "cursor_cloud_reply":
      return replyAction(runtime, args as never);
    case "cursor_cloud_status":
      return statusAction(runtime, args as never);
    case "cursor_cloud_cancel":
      return cancelAction(runtime, args as never);
    case "cursor_cloud_watch":
      return watchAction(runtime, args as never);
    case "cursor_cloud_list":
      return listAction(runtime, args as never);
    case "cursor_cloud_models":
      return modelsAction(runtime);
    case "cursor_cloud_me":
      return meAction(runtime);
    case "cursor_cloud_ledger":
      return ledgerAction(runtime);
    default:
      throw new Error(`Unknown tool '${name}'`);
  }
}

function isFailedResult(result: unknown): boolean {
  return Boolean(result && typeof result === "object" && "ok" in result && (result as { ok?: unknown }).ok === false);
}

function writeRpc(message: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
