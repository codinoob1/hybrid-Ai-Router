import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anthropicGenerate } from "../src/providers/anthropic.js";

const fetchMock = vi.fn();

function mockOk(body: unknown) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  });
}

function mockError(status: number, message: string) {
  fetchMock.mockResolvedValue({
    ok: false,
    status,
    statusText: "Error",
    json: async () => ({ error: { message } }),
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("anthropicGenerate", () => {
  it("posts to the Messages API with the right headers and body", async () => {
    mockOk({ content: [{ type: "text", text: "hello " }, { type: "text", text: "world" }] });

    const text = await anthropicGenerate("hi", { provider: "anthropic", apiKey: "sk-ant-test", model: "claude-haiku" });

    expect(text).toBe("hello world");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(JSON.parse(init.body as string)).toEqual({
      model: "claude-haiku",
      max_tokens: 1024,
      messages: [{ role: "user", content: "hi" }],
    });
  });

  it("throws with the API error message on a non-OK response", async () => {
    mockError(429, "rate limit hit");

    await expect(anthropicGenerate("hi", { provider: "anthropic", apiKey: "sk-ant-test", model: "claude-haiku" })).rejects.toThrow(
      "Anthropic request failed (429): rate limit hit",
    );
  });

  it("returns an empty string for an empty/malformed response", async () => {
    mockOk({ content: "not-an-array" });

    await expect(anthropicGenerate("hi", { provider: "anthropic", apiKey: "sk-ant-test", model: "claude-haiku" })).resolves.toBe("");
  });

  it("joins text blocks, ignoring non-text blocks", async () => {
    mockOk({ content: [{ type: "text", text: "only " }, { type: "tool_use", id: "x", name: "f", input: {} }] });

    const text = await anthropicGenerate("hi", { provider: "anthropic", apiKey: "sk-ant-test", model: "claude-haiku" });

    expect(text).toBe("only ");
  });
});