import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MLCEngine } from "@mlc-ai/web-llm";

vi.mock("@mlc-ai/web-llm", () => ({
  CreateMLCEngine: vi.fn(),
}));

import { CreateMLCEngine } from "@mlc-ai/web-llm";
import { WebLLMAdapter } from "../src/index.js";

const mockCreate = vi.mocked(CreateMLCEngine);

function fakeEngine(reply: unknown = { choices: [{ message: { content: "local reply" } }] }): MLCEngine {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue(reply),
      },
    },
  } as unknown as MLCEngine;
}

beforeEach(() => vi.clearAllMocks());

describe("WebLLMAdapter", () => {
  it("loads a model via CreateMLCEngine and forwards progress to the callback", async () => {
    mockCreate.mockResolvedValue(fakeEngine());
    const adapter = new WebLLMAdapter();
    const onProgress = vi.fn();

    await adapter.load("phi3-mini-q4f16", onProgress);

    expect(mockCreate).toHaveBeenCalledWith(
      "phi3-mini-q4f16",
      expect.objectContaining({ initProgressCallback: expect.any(Function) }),
    );

    const config = mockCreate.mock.calls[0][1] as {
      initProgressCallback: (report: { progress: number; text: string }) => void;
    };
    config.initProgressCallback({ progress: 0.5, text: "Downloading model" });
    expect(onProgress).toHaveBeenCalledWith(0.5, "Downloading model");
  });

  it("throws when generate is called before load", async () => {
    const adapter = new WebLLMAdapter();
    await expect(adapter.generate("hello")).rejects.toThrow("load()");
  });

  it("returns the assistant content from the engine", async () => {
    const engine = fakeEngine();
    mockCreate.mockResolvedValue(engine);
    const adapter = new WebLLMAdapter();
    await adapter.load("phi3-mini-q4f16");

    const text = await adapter.generate("hello");

    expect(text).toBe("local reply");
    expect(engine.chat.completions.create).toHaveBeenCalledWith({
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it("returns an empty string when the response has no content", async () => {
    mockCreate.mockResolvedValue(fakeEngine({ choices: [{ message: {} }] }));
    const adapter = new WebLLMAdapter();
    await adapter.load("phi3-mini-q4f16");

    expect(await adapter.generate("hello")).toBe("");
  });
});