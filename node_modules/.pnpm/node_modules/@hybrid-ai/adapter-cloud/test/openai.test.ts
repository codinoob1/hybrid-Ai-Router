import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("openai", () => ({ default: vi.fn() }));

import OpenAI from "openai";
import { openaiGenerate } from "../src/providers/openai.js";

const mockOpenAI = vi.mocked(OpenAI);

function fakeClient(reply: unknown = { choices: [{ message: { content: "local reply" } }] }) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue(reply),
      },
    },
  };
}

beforeEach(() => vi.clearAllMocks());

afterEach(() => mockOpenAI.mockReset());

describe("openaiGenerate", () => {
  it("returns the assistant content on the happy path", async () => {
    mockOpenAI.mockReturnValue(fakeClient() as any);

    const text = await openaiGenerate("hello", { provider: "openai", apiKey: "sk-test", model: "gpt-4o-mini" });

    expect(text).toBe("local reply");
    expect(mockOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-test",
      baseURL: "https://api.openai.com/v1",
      dangerouslyAllowBrowser: true,
    });
  });

  it("respects a custom baseUrl", async () => {
    mockOpenAI.mockReturnValue(fakeClient() as any);

    await openaiGenerate("hello", { provider: "openai", apiKey: "sk-test", model: "m", baseUrl: "https://llm.example.com/v1" });

    expect(mockOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-test",
      baseURL: "https://llm.example.com/v1",
      dangerouslyAllowBrowser: true,
    });
  });

  it("calls chat.completions.create with the model and messages", async () => {
    const client = fakeClient();
    mockOpenAI.mockReturnValue(client as any);

    await openaiGenerate("hello", { provider: "custom", apiKey: "secret", model: "m", baseUrl: "https://gateway.example.com/v1" });

    expect(client.chat.completions.create).toHaveBeenCalledWith({
      model: "m",
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it("propagates SDK errors for non-OK responses", async () => {
    const client = fakeClient();
    client.chat.completions.create.mockRejectedValue(Object.assign(new Error("invalid api key"), { status: 401 }));
    mockOpenAI.mockReturnValue(client as any);

    await expect(openaiGenerate("hello", { provider: "openai", apiKey: "bad", model: "gpt-4o-mini" })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("returns an empty string for an empty/malformed response", async () => {
    mockOpenAI.mockReturnValue(fakeClient({ choices: [{ message: {} }] }) as any);

    await expect(openaiGenerate("hello", { provider: "openai", apiKey: "sk-test", model: "gpt-4o-mini" })).resolves.toBe("");
  });
});