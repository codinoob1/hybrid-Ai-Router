import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn(),
}));

import { pipeline } from "@huggingface/transformers";
import { HuggingFaceRuntime } from "../src/index.js";

const mockPipeline = vi.mocked(pipeline);

function fakeGenerator(reply: unknown = {
  generated_text: [
    { role: "user", content: "hello" },
    { role: "assistant", content: "local reply" },
  ],
}) {
  return vi.fn(async () => [reply]);
}

beforeEach(() => vi.clearAllMocks());

describe("HuggingFaceRuntime", () => {
  it("loads a model via pipeline and reports download progress", async () => {
    mockPipeline.mockResolvedValue(fakeGenerator() as any);
    const runtime = new HuggingFaceRuntime();
    const onProgress = vi.fn();

    await runtime.load("onnx-community/Qwen2.5-0.5B-Instruct", onProgress);

    expect(mockPipeline).toHaveBeenCalledWith(
      "text-generation",
      "onnx-community/Qwen2.5-0.5B-Instruct",
      expect.objectContaining({ dtype: "q8", device: "wasm", progress_callback: expect.any(Function) }),
    );

    const options = mockPipeline.mock.calls[0][2] as {
      progress_callback: (info: { status: string; progress: number; file: string }) => void;
    };
    options.progress_callback({ status: "progress", progress: 75, file: "onnx/model.onnx" });
    expect(onProgress).toHaveBeenCalledWith(0.75, "onnx/model.onnx");
  });

  it("throws when generate is called before load", async () => {
    const runtime = new HuggingFaceRuntime();
    await expect(runtime.generate("hello")).rejects.toThrow("load()");
  });

  it("rejects load with a meaningful error for an invalid model ID", async () => {
    mockPipeline.mockRejectedValue(new Error("Model not found: invalid-model-xyz"));
    const runtime = new HuggingFaceRuntime();

    await expect(runtime.load("invalid-model-xyz")).rejects.toThrow("Model not found: invalid-model-xyz");
  });

  it("returns the last assistant message from the chat output", async () => {
    mockPipeline.mockResolvedValue(fakeGenerator() as any);
    const runtime = new HuggingFaceRuntime();
    await runtime.load("onnx-community/Qwen2.5-0.5B-Instruct");

    const text = await runtime.generate("hello");

    expect(text).toBe("local reply");
  });

  it("returns an empty string when the chat output has no content", async () => {
    mockPipeline.mockResolvedValue(
      fakeGenerator({ generated_text: [{ role: "user", content: [] }] }) as any,
    );
    const runtime = new HuggingFaceRuntime();
    await runtime.load("onnx-community/Qwen2.5-0.5B-Instruct");

    expect(await runtime.generate("hello")).toBe("");
  });
});