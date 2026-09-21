import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCloudAdapter } from "../src/index.js";
import { openaiGenerate } from "../src/providers/openai.js";
import { anthropicGenerate } from "../src/providers/anthropic.js";
import { geminiGenerate } from "../src/providers/gemini.js";

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

describe("openaiGenerate", () => {
  it("posts to /chat/completions with auth header and correct body", async () => {
    mockOk({ choices: [{ message: { content: "local reply" } }] });

    const text = await openaiGenerate("hello", { provider: "openai", apiKey: "sk-test", model: "gpt-4o-mini" });

    expect(text).toBe("local reply");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer sk-test");
    expect(JSON.parse(init.body as string)).toEqual({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it("respects a custom baseUrl", async () => {
    mockOk({ choices: [{ message: { content: "ok" } }] });

    await openaiGenerate("hello", { provider: "openai", apiKey: "sk-test", model: "m", baseUrl: "https://llm.example.com/v1/" });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://llm.example.com/v1/chat/completions");
  });

  it("omits the Authorization header for keyless custom endpoints", async () => {
    mockOk({ choices: [{ message: { content: "ok" } }] });

    await openaiGenerate("hello", { provider: "custom", model: "m", baseUrl: "https://llm.example.com/v1" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBeUndefined();
  });

  it("throws with the API error message on a non-OK response", async () => {
    mockError(401, "invalid api key");

    await expect(openaiGenerate("hello", { provider: "openai", apiKey: "bad", model: "gpt-4o-mini" })).rejects.toThrow(
      "OpenAI request failed (401): invalid api key",
    );
  });

  it("throws when the response has no content", async () => {
    mockOk({ choices: [{ message: {} }] });

    await expect(openaiGenerate("hello", { provider: "openai", apiKey: "sk-test", model: "gpt-4o-mini" })).rejects.toThrow(
      "choices[0].message.content",
    );
  });
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
});

describe("geminiGenerate", () => {
  it("posts to generateContent with the model and key in the URL", async () => {
    mockOk({ candidates: [{ content: { parts: [{ text: "gem " }, { text: "answer" }] } }] });

    const text = await geminiGenerate("hi", { provider: "gemini", apiKey: "key-123", model: "gemini-2.0-flash" });

    expect(text).toBe("gem answer");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=key-123",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
    });
  });

  it("throws with the API error message on a non-OK response", async () => {
    mockError(400, "bad request");

    await expect(geminiGenerate("hi", { provider: "gemini", apiKey: "key-123", model: "gemini-2.0-flash" })).rejects.toThrow(
      "Gemini request failed (400): bad request",
    );
  });
});

describe("createCloudAdapter", () => {
  it("routes custom config through the OpenAI client to the supplied baseUrl", async () => {
    mockOk({ choices: [{ message: { content: "custom reply" } }] });

    const adapter = createCloudAdapter({ provider: "custom", apiKey: "secret", model: "local-model", baseUrl: "https://gateway.example.com/v1" });
    const text = await adapter.generate("hello");

    expect(text).toBe("custom reply");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("routes openai config through the OpenAI client", async () => {
    mockOk({ choices: [{ message: { content: "openai reply" } }] });

    const adapter = createCloudAdapter({ provider: "openai", apiKey: "sk-test", model: "gpt-4o-mini" });
    await adapter.generate("hello");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });
});