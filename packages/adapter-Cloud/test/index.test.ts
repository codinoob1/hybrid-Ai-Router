import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/providers/openai.js", () => ({ openaiGenerate: vi.fn() }));
vi.mock("../src/providers/anthropic.js", () => ({ anthropicGenerate: vi.fn() }));
vi.mock("../src/providers/gemini.js", () => ({ geminiGenerate: vi.fn() }));

import { createCloudAdapter } from "../src/index.js";
import { openaiGenerate } from "../src/providers/openai.js";
import { anthropicGenerate } from "../src/providers/anthropic.js";
import { geminiGenerate } from "../src/providers/gemini.js";

const mockOpenai = vi.mocked(openaiGenerate);
const mockAnthropic = vi.mocked(anthropicGenerate);
const mockGemini = vi.mocked(geminiGenerate);

afterEach(() => vi.clearAllMocks());

describe("createCloudAdapter dispatcher", () => {
  it("routes openai config to the openai provider and no other", async () => {
    mockOpenai.mockResolvedValue("openai reply");

    const adapter = createCloudAdapter({ provider: "openai", apiKey: "sk-test", model: "gpt-4o-mini" });
    const text = await adapter.generate("hello");

    expect(text).toBe("openai reply");
    expect(mockOpenai).toHaveBeenCalledTimes(1);
    expect(mockOpenai).toHaveBeenCalledWith("hello", expect.objectContaining({ provider: "openai" }));
    expect(mockAnthropic).not.toHaveBeenCalled();
    expect(mockGemini).not.toHaveBeenCalled();
  });

  it("routes custom config through the OpenAI-shaped client specifically", async () => {
    mockOpenai.mockResolvedValue("gateway reply");

    const adapter = createCloudAdapter({ provider: "custom", apiKey: "secret", model: "m", baseUrl: "https://gateway.example.com/v1" });
    const text = await adapter.generate("hello");

    expect(text).toBe("gateway reply");
    expect(mockOpenai).toHaveBeenCalledTimes(1);
    expect(mockOpenai).toHaveBeenCalledWith("hello", expect.objectContaining({ provider: "custom" }));
    expect(mockAnthropic).not.toHaveBeenCalled();
    expect(mockGemini).not.toHaveBeenCalled();
  });

  it("routes anthropic config to the anthropic provider and no other", async () => {
    mockAnthropic.mockResolvedValue("claude reply");

    const adapter = createCloudAdapter({ provider: "anthropic", apiKey: "sk-ant-test", model: "claude-haiku" });
    const text = await adapter.generate("hi");

    expect(text).toBe("claude reply");
    expect(mockAnthropic).toHaveBeenCalledTimes(1);
    expect(mockAnthropic).toHaveBeenCalledWith("hi", expect.objectContaining({ provider: "anthropic" }));
    expect(mockOpenai).not.toHaveBeenCalled();
    expect(mockGemini).not.toHaveBeenCalled();
  });

  it("routes gemini config to the gemini provider and no other", async () => {
    mockGemini.mockResolvedValue("gemini reply");

    const adapter = createCloudAdapter({ provider: "gemini", apiKey: "key-123", model: "gemini-2.0-flash" });
    const text = await adapter.generate("hi");

    expect(text).toBe("gemini reply");
    expect(mockGemini).toHaveBeenCalledTimes(1);
    expect(mockGemini).toHaveBeenCalledWith("hi", expect.objectContaining({ provider: "gemini" }));
    expect(mockOpenai).not.toHaveBeenCalled();
    expect(mockAnthropic).not.toHaveBeenCalled();
  });

  it("throws for an unknown provider", async () => {
    const adapter = createCloudAdapter({ provider: "unknown" } as any);

    await expect(adapter.generate("hi")).rejects.toThrow("Unknown cloud provider");
  });
});