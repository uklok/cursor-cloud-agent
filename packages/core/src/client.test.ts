import { describe, expect, it, vi } from "vitest";
import { CursorCloudClient } from "./client.js";
import { CursorCloudApiError } from "./errors.js";

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("CursorCloudClient", () => {
  it("sends Basic auth and an env-only create body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        agent: { id: "bc-1", latestRunId: "run-1", status: "ACTIVE" },
        run: { id: "run-1", status: "CREATING" },
      }),
    );
    const client = new CursorCloudClient({
      apiKey: "test-key",
      fetch: fetchImpl,
    });
    await client.createAgent({
      prompt: { text: "hello" },
      env: { type: "cloud", name: "UKLOK OS" },
    });
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.cursor.com/v1/agents");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe(`Basic ${Buffer.from("test-key:", "utf8").toString("base64")}`);
    expect(JSON.parse(String(init.body))).toEqual({
      prompt: { text: "hello" },
      env: { type: "cloud", name: "UKLOK OS" },
    });
  });

  it("retries GET 429 then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: "slow" }, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "bc-1", status: "IDLE" }));
    const client = new CursorCloudClient({ apiKey: "k", fetch: fetchImpl });
    const agent = await client.getAgent("bc-1");
    expect(agent.status).toBe("IDLE");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry POST failures", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500, { error: { code: "boom", message: "no" } }));
    const client = new CursorCloudClient({ apiKey: "k", fetch: fetchImpl });
    await expect(client.createRun("bc-1", { prompt: { text: "x" } })).rejects.toMatchObject({
      name: "CursorCloudApiError",
      httpStatus: 500,
      apiCode: "boom",
    } satisfies Partial<CursorCloudApiError>);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("lists artifacts and streams SSE events", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { items: [{ path: "artifacts/shot.png", sizeBytes: 12 }] }))
      .mockResolvedValueOnce(
        new Response('event: result\ndata: {"status":"FINISHED","text":"done"}\n\n', {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      );
    const client = new CursorCloudClient({ apiKey: "k", fetch: fetchImpl });
    const artifacts = await client.listArtifacts("bc-1");
    expect(artifacts.items[0]?.path).toBe("artifacts/shot.png");
    const events = [];
    for await (const event of client.streamRun("bc-1", "run-1")) {
      events.push(event);
    }
    expect(events[0]).toMatchObject({ event: "result", data: { status: "FINISHED", text: "done" } });
  });
});
