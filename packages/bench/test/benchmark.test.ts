import { describe, expect, it, vi } from "vitest";
import { runBenchmark } from "../src/benchmark.js";
import type { DeviceCapabilities, ModelSpec } from "@hybrid-ai/core";

function makeDeviceCapabilities(overrides: Partial<DeviceCapabilities> = {}): DeviceCapabilities {
  return {
    tier: "standard",
    webgpu: {
      available: true,
      fallbackAdapter: false,
      maxBufferSize: 2_147_483_648,
      maxStorageBufferBindingSize: 2_147_483_648,
    },
    wasm: { supported: true, simd: true, threads: false },
    deviceMemoryGiB: 16,
    cpuCores: 8,
    connection: {
      effectiveType: "4g",
      downlinkMbps: 10,
      saveData: false,
      modelDownloadRecommended: true,
    },
    reasons: [],
    ...overrides,
  };
}

function makeModelSpec(overrides: Partial<ModelSpec> = {}): ModelSpec {
  return {
    id: "test-model",
    label: "Test Model",
    params: "1B",
    runtime: "wasm",
    minTier: "light",
    downloadSizeMB: 100,
    ...overrides,
  };
}

function makeFakeAdapter(response: string, shouldFail = false) {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn().mockImplementation(async (prompt: string) => {
      if (shouldFail) throw new Error("generation failed");
      return response;
    }),
  };
}

describe("runBenchmark", () => {
  it("probes the device and benchmarks the picked model", async () => {
    const probe = vi.fn().mockResolvedValue(makeDeviceCapabilities({ tier: "light" }));
    const registry: ModelSpec[] = [makeModelSpec({ id: "qwen-0.5b", runtime: "wasm", minTier: "light" })];
    const adapter = makeFakeAdapter("This is a sufficiently long and useful answer.");
    const adapters = { wasm: adapter };

    const result = await runBenchmark(
      { prompts: ["Hello"], modelIds: ["pick"], output: "table" },
      { probe, registry, adapters },
    );

    expect(probe).toHaveBeenCalledTimes(1);
    expect(adapter.load).toHaveBeenCalledWith("qwen-0.5b");
    expect(adapter.generate).toHaveBeenCalledWith("Hello");
    expect(result.tier).toBe("light");
    expect(result.models.length).toBe(1);
    expect(result.models[0].eligible).toBe(true);
    expect(result.models[0].passRate).toBe(1);
    expect(result.models[0].avgLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.models[0].avgWordsPerSec).toBeGreaterThan(0);
  });

  it("skips ineligible models without calling load", async () => {
    const probe = vi.fn().mockResolvedValue(makeDeviceCapabilities({ tier: "none" }));
    const registry: ModelSpec[] = [makeModelSpec({ minTier: "standard" })];
    const adapter = makeFakeAdapter("answer");
    const adapters = { wasm: adapter };

    const result = await runBenchmark(
      { prompts: ["Hello"], modelIds: ["all"], output: "table" },
      { probe, registry, adapters },
    );

    expect(result.models.length).toBe(1);
    expect(result.models[0].eligible).toBe(false);
    expect(result.models[0].skipReason).toBeDefined();
    expect(adapter.load).not.toHaveBeenCalled();
    expect(adapter.generate).not.toHaveBeenCalled();
  });

  it("benchmarks all eligible models when modelIds is ['all']", async () => {
    const probe = vi.fn().mockResolvedValue(makeDeviceCapabilities());
    const registry: ModelSpec[] = [
      makeModelSpec({ id: "model-a", runtime: "wasm", minTier: "light", downloadSizeMB: 100 }),
      makeModelSpec({ id: "model-b", runtime: "wasm", minTier: "light", downloadSizeMB: 200 }),
    ];
    const adapterA = makeFakeAdapter("Answer A that is long enough.");
    const adapterB = makeFakeAdapter("Answer B that is also long enough.");
    const adapters = {
      wasm: {
        load: vi.fn().mockResolvedValue(undefined),
        generate: vi.fn().mockImplementation(async (prompt: string) => {
          if (prompt.includes("A")) return "Answer A that is long enough.";
          return "Answer B that is also long enough.";
        }),
      },
    };

    const result = await runBenchmark(
      { prompts: ["Hello"], modelIds: ["all"], output: "table" },
      { probe, registry, adapters },
    );

    expect(result.models.length).toBe(2);
    expect(result.models[0].modelId).toBe("model-a");
    expect(result.models[1].modelId).toBe("model-b");
  });

  it("records load errors and skips generation", async () => {
    const probe = vi.fn().mockResolvedValue(makeDeviceCapabilities());
    const registry: ModelSpec[] = [makeModelSpec()];
    const loadError = new Error("model not found");
    const adapters = {
      wasm: {
        load: vi.fn().mockRejectedValue(loadError),
        generate: vi.fn(),
      },
    };

    const result = await runBenchmark(
      { prompts: ["Hello"], modelIds: ["pick"], output: "table" },
      { probe, registry, adapters },
    );

    expect(result.models[0].eligible).toBe(true);
    expect(result.models[0].loadError).toBe("model not found");
    expect(result.models[0].prompts.length).toBe(0);
  });

  it("scores quality pass/fail correctly", async () => {
    const probe = vi.fn().mockResolvedValue(makeDeviceCapabilities({ tier: "light" }));
    const registry: ModelSpec[] = [makeModelSpec({ runtime: "wasm", minTier: "light" })];
    const adapters = {
      wasm: {
        load: vi.fn().mockResolvedValue(undefined),
        generate: vi.fn().mockImplementation(async (prompt: string) => {
          if (prompt === "short") return "ok";
          if (prompt === "loop") return "one two three four five six seven eight nine ten eleven twelve hello world foo bar baz qux hello world foo bar baz qux";
          return "This is a normal and sufficiently long response for testing.";
        }),
      },
    };

    const result = await runBenchmark(
      { prompts: ["short", "loop", "normal"], modelIds: ["pick"], output: "table" },
      { probe, registry, adapters },
    );

    const model = result.models[0];
    const short = model.prompts.find((p) => p.prompt === "short");
    const loop = model.prompts.find((p) => p.prompt === "loop");
    const normal = model.prompts.find((p) => p.prompt === "normal");

    expect(short?.pass).toBe(false);
    expect(short?.reason).toBe("Response too short");
    expect(loop?.pass).toBe(false);
    expect(loop?.reason).toBe("Repeated loop detected");
    expect(normal?.pass).toBe(true);
  });

  it("includes cloud comparison results when cloud adapter is provided", async () => {
    const probe = vi.fn().mockResolvedValue(makeDeviceCapabilities());
    const registry: ModelSpec[] = [makeModelSpec()];
    const adapter = makeFakeAdapter("This is a local answer that is long enough.");
    const cloudGenerate = vi.fn().mockResolvedValue("This is a cloud answer that is long enough.");
    const adapters = { wasm: adapter };

    const result = await runBenchmark(
      {
        prompts: ["Hello"],
        modelIds: ["pick"],
        output: "table",
        cloud: { generate: cloudGenerate },
      },
      { probe, registry, adapters },
    );

    expect(cloudGenerate).toHaveBeenCalledWith("Hello");
    const pr = result.models[0].prompts[0];
    expect(pr.cloudLatencyMs).toBeGreaterThanOrEqual(0);
    expect(pr.cloudWordsPerSec).toBeGreaterThan(0);
  });

  it("returns ineligible models (marked as not eligible) when no models pass", async () => {
    const probe = vi.fn().mockResolvedValue(makeDeviceCapabilities({ tier: "none" }));
    const registry: ModelSpec[] = [makeModelSpec({ minTier: "standard" })];
    const adapters = { wasm: makeFakeAdapter("answer") };

    const result = await runBenchmark(
      { prompts: ["Hello"], modelIds: ["all"], output: "table" },
      { probe, registry, adapters },
    );

    expect(result.models.length).toBe(1);
    expect(result.models[0].eligible).toBe(false);
    expect(result.models[0].skipReason).toBeDefined();
    expect(adapters.wasm.load).not.toHaveBeenCalled();
    expect(adapters.wasm.generate).not.toHaveBeenCalled();
  });

  it("supports custom model IDs not in registry", async () => {
    const probe = vi.fn().mockResolvedValue(makeDeviceCapabilities({ tier: "light" }));
    const registry: ModelSpec[] = [];
    const adapter = makeFakeAdapter("Custom model response that is long enough.");
    const adapters = { wasm: adapter };

    const result = await runBenchmark(
      { prompts: ["Hello"], modelIds: ["custom-model"], output: "table" },
      { probe, registry, adapters },
    );

    expect(result.models.length).toBe(1);
    expect(result.models[0].modelId).toBe("custom-model");
    expect(result.models[0].eligible).toBe(true);
  });
});
