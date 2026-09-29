export type SseEvent = {
  event: string;
  data: unknown;
  id?: string;
};

export function consumeSse(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const chunks = buffer.split("\n\n");
  const rest = chunks.pop() ?? "";
  for (const chunk of chunks) {
    const parsed = parseSseBlock(chunk);
    if (parsed) {
      events.push(parsed);
    }
  }
  return { events, rest };
}

export function parseSseBlock(block: string): SseEvent | undefined {
  let event = "message";
  let id: string | undefined;
  const dataLines: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) {
      continue;
    }
    const idx = line.indexOf(":");
    const field = idx === -1 ? line : line.slice(0, idx);
    const value = idx === -1 ? "" : line.slice(idx + 1).replace(/^ /, "");
    if (field === "event") {
      event = value || "message";
    } else if (field === "id") {
      id = value || undefined;
    } else if (field === "data") {
      dataLines.push(value);
    }
  }
  if (dataLines.length === 0 && event === "message" && !id) {
    return undefined;
  }
  const raw = dataLines.join("\n");
  let data: unknown = raw;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }
  return { event, data, id };
}
