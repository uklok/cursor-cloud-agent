import { CursorCloudApiError } from "./errors.js";
import { resolveApiBaseUrl, type HostPolicy } from "./host.js";
import type {
  AgentRecord,
  AuthScheme,
  CreateAgentRequest,
  CreateAgentResponse,
  CreateRunRequest,
  CreateRunResponse,
  ModelRecord,
  RunRecord,
} from "./types.js";
import { consumeSse, type SseEvent } from "./sse.js";
import { USER_AGENT } from "./version.js";

export type FetchLike = typeof fetch;

export type CursorCloudClientOptions = HostPolicy & {
  apiKey: string;
  apiBaseUrl?: string;
  authScheme?: AuthScheme;
  fetch?: FetchLike;
  timeoutMs?: number;
};

type RequestOptions = {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export class CursorCloudClient {
  readonly apiBaseUrl: string;
  private readonly apiKey: string;
  private readonly authScheme: AuthScheme;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly hostPolicy: HostPolicy;

  constructor(options: CursorCloudClientOptions) {
    if (!options.apiKey?.trim()) {
      throw new CursorCloudApiError(401, "Cursor API key is empty");
    }
    this.hostPolicy = { allowInsecureHost: options.allowInsecureHost };
    this.apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, this.hostPolicy);
    this.apiKey = options.apiKey;
    this.authScheme = options.authScheme ?? "basic";
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async createAgent(
    request: CreateAgentRequest,
    options?: { idempotencyKey?: string; signal?: AbortSignal },
  ): Promise<CreateAgentResponse> {
    return this.request<CreateAgentResponse>("POST", "/v1/agents", {
      body: request,
      idempotencyKey: options?.idempotencyKey,
      signal: options?.signal,
    });
  }

  async getAgent(agentId: string, signal?: AbortSignal): Promise<AgentRecord> {
    return this.request<AgentRecord>("GET", `/v1/agents/${encodeURIComponent(agentId)}`, { signal });
  }

  async listAgents(
    params: { limit?: number; cursor?: string } = {},
    signal?: AbortSignal,
  ): Promise<{ items: AgentRecord[]; nextCursor?: string }> {
    return this.request("GET", "/v1/agents", {
      query: { limit: params.limit, cursor: params.cursor },
      signal,
    });
  }

  async createRun(
    agentId: string,
    request: CreateRunRequest,
    signal?: AbortSignal,
  ): Promise<CreateRunResponse> {
    return this.request<CreateRunResponse>(
      "POST",
      `/v1/agents/${encodeURIComponent(agentId)}/runs`,
      { body: request, signal },
    );
  }

  async getRun(agentId: string, runId: string, signal?: AbortSignal): Promise<RunRecord> {
    return this.request<RunRecord>(
      "GET",
      `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`,
      { signal },
    );
  }

  async listRuns(
    agentId: string,
    params: { limit?: number; cursor?: string } = {},
    signal?: AbortSignal,
  ): Promise<{ items: RunRecord[]; nextCursor?: string }> {
    return this.request("GET", `/v1/agents/${encodeURIComponent(agentId)}/runs`, {
      query: { limit: params.limit, cursor: params.cursor },
      signal,
    });
  }

  async cancelRun(agentId: string, runId: string, signal?: AbortSignal): Promise<{ id: string }> {
    return this.request("POST", `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/cancel`, {
      signal,
    });
  }

  async getMe(signal?: AbortSignal): Promise<{
    apiKeyName?: string;
    createdAt?: string;
    userId?: number;
    userEmail?: string;
  }> {
    return this.request("GET", "/v1/me", { signal });
  }

  async listModels(signal?: AbortSignal): Promise<{ items: ModelRecord[] }> {
    return this.request("GET", "/v1/models", { signal });
  }

  async listArtifacts(
    agentId: string,
    signal?: AbortSignal,
  ): Promise<{ items: Array<{ path?: string; sizeBytes?: number; updatedAt?: string }> }> {
    return this.request("GET", `/v1/agents/${encodeURIComponent(agentId)}/artifacts`, { signal });
  }

  async getArtifactDownload(
    agentId: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<{ url: string; expiresAt?: string }> {
    return this.request("GET", `/v1/agents/${encodeURIComponent(agentId)}/artifacts/download`, {
      query: { path },
      signal,
    });
  }

  async *streamRun(
    agentId: string,
    runId: string,
    options: { lastEventId?: string; signal?: AbortSignal; timeoutMs?: number } = {},
  ): AsyncGenerator<SseEvent> {
    const url = new URL(
      `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/stream`,
      `${this.apiBaseUrl}/`,
    );
    const headers = new Headers({
      Accept: "text/event-stream",
      "User-Agent": USER_AGENT,
      Authorization: this.authorizationHeader(),
    });
    if (options.lastEventId) {
      headers.set("Last-Event-ID", options.lastEventId);
    }
    const { signal, cleanup } = mergeTimeout(options.signal, options.timeoutMs ?? this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers,
        signal,
        redirect: "error",
      });
    } catch (error) {
      cleanup();
      if (error instanceof CursorCloudApiError) {
        throw error;
      }
      throw new CursorCloudApiError(
        0,
        `Network error GET ${url.pathname}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    if (!response.ok) {
      cleanup();
      throw await apiErrorFromResponse(response, "GET", url.pathname);
    }
    if (!response.body) {
      cleanup();
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const consumed = consumeSse(buffer);
        buffer = consumed.rest;
        for (const event of consumed.events) {
          yield event;
        }
        if (done) {
          break;
        }
      }
    } finally {
      cleanup();
      reader.releaseLock();
    }
  }

  private async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path, `${this.apiBaseUrl}/`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = new Headers({
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      Authorization: this.authorizationHeader(),
    });
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    if (options.idempotencyKey) {
      headers.set("Idempotency-Key", options.idempotencyKey);
    }

    const maxAttempts = method === "GET" ? 4 : 1;
    let attempt = 0;
    while (true) {
      attempt += 1;
      const { signal, cleanup } = mergeTimeout(options.signal, this.timeoutMs);
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal,
          redirect: "error",
        });
      } catch (error) {
        cleanup();
        if (error instanceof CursorCloudApiError) {
          throw error;
        }
        throw new CursorCloudApiError(0, `Network error ${method} ${path}: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        });
      }
      cleanup();

      const retryable = method === "GET" && (response.status === 429 || response.status >= 500);
      if (retryable && attempt < maxAttempts) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      if (!response.ok) {
        throw await apiErrorFromResponse(response, method, path);
      }
      if (response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    }
  }

  private authorizationHeader(): string {
    if (this.authScheme === "bearer") {
      return `Bearer ${this.apiKey}`;
    }
    return `Basic ${Buffer.from(`${this.apiKey}:`, "utf8").toString("base64")}`;
  }
}

function mergeTimeout(
  parent: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  parent?.addEventListener("abort", onAbort, { once: true });
  if (parent?.aborted) {
    controller.abort();
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 30_000);
    }
  }
  return Math.min(500 * 2 ** (attempt - 1), 8_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiErrorFromResponse(response: Response, method: string, path: string): Promise<CursorCloudApiError> {
  const text = await response.text();
  let details: unknown = text || undefined;
  if (text) {
    try {
      details = JSON.parse(text);
    } catch {
      details = text;
    }
  }
  const { apiCode, message } = extractApiError(details);
  const suffix = message ?? (typeof details === "string" ? details.slice(0, 240) : response.statusText);
  return new CursorCloudApiError(
    response.status,
    `${response.status} ${method} ${path}${suffix ? `: ${suffix}` : ""}`,
    { apiCode, details },
  );
}

function extractApiError(details: unknown): { apiCode?: string; message?: string } {
  if (!details || typeof details !== "object") {
    return { message: typeof details === "string" ? details : undefined };
  }
  const record = details as Record<string, unknown>;
  const nested = record.error;
  if (nested && typeof nested === "object") {
    const error = nested as Record<string, unknown>;
    return {
      apiCode: asString(error.code) ?? asString(record.code),
      message: asString(error.message) ?? asString(record.message),
    };
  }
  return {
    apiCode: asString(record.code) ?? asString(record.error),
    message: asString(record.message),
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
