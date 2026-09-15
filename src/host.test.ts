import { describe, expect, it } from "vitest";
import { ConfigError } from "./errors.js";
import { resolveApiBaseUrl } from "./host.js";

describe("resolveApiBaseUrl", () => {
  it("pins api.cursor.com", () => {
    expect(resolveApiBaseUrl(undefined)).toBe("https://api.cursor.com");
    expect(resolveApiBaseUrl("https://api.cursor.com/")).toBe("https://api.cursor.com");
  });

  it("rejects other hosts", () => {
    expect(() => resolveApiBaseUrl("https://evil.example")).toThrow(ConfigError);
    expect(() => resolveApiBaseUrl("https://api.cursor.com.evil.example")).toThrow(ConfigError);
  });

  it("rejects credentials and paths", () => {
    expect(() => resolveApiBaseUrl("https://user:pass@api.cursor.com")).toThrow(ConfigError);
    expect(() => resolveApiBaseUrl("https://api.cursor.com/v1")).toThrow(ConfigError);
  });

  it("allows loopback only when opted in", () => {
    expect(() => resolveApiBaseUrl("http://127.0.0.1:9")).toThrow(ConfigError);
    expect(resolveApiBaseUrl("http://127.0.0.1:9", { allowInsecureHost: true })).toBe(
      "http://127.0.0.1:9",
    );
  });
});
