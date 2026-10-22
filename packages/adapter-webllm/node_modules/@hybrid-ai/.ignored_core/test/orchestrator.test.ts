import { afterEach, describe, expect, it, vi } from "vitest";
import { createRouter, type GenerateResult } from "../src/orchestrator.js";
import type { CloudRuntime, LocalRuntime } from "../src/types.js";

interface FakeNavigator {
  gpu?: { requestAdapter(): Promise<unknown> };
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { effectiveType?: string; downlink?: number; saveData?: boolean };
}

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function setNavigator(value: FakeNavigator): void {
  Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
}

afterEach(() => {
  if (originalNavigator) {
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  } else {
    Reflect.deleteProperty(globalThis, "navigator");
  }
  vi.restoreAllMocks();
});

function makeRuntime(response: string): LocalRuntime {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn().mockResolvedValue(response),
  };
}

function makeCloud(response = "cloud answer"): CloudRuntime {
  return { generate: vi.fn().mockResolvedValue(response) };
}

const standardNavigator: FakeNavigator = {
  gpu: {
    requestAdapter: async () => ({
      isFallbackAdapter: false,
      limits: { maxBufferSize: 2_147_483_648, maxStorageBufferBindingSize: 2_147_483_648 },
    }),
  },
  deviceMemory: 16,
  hardwareConcurrency: 8,
};

const lightNavigator: FakeNavigator = {
  deviceMemory: 4,
  hardwareConcurrency: 4,
};

const cloudOnlyNavigator: FakeNavigator = {
  deviceMemory: 16,
  hardwareConcurrency: 8,
  connection: { saveData: true },
};

describe("createRouter", () => {
  it("loads the picked model and returns a local result when quality passes", async () => {
    setNavigator(standardNavigator);
    const webgpu = makeRuntime("Yes, here is a detailed and useful answer for you.");
    const cloud = makeCloud();
    const router = createRouter({ adapters: { webgpu }, cloud });

    await router.init();
    const result = await router.generate("hello");

    expect(webgpu.load).toHaveBeenCalledWith("phi3-mini-q4f16");
    expect(cloud.generate).not.toHaveBeenCalled();
    expect(result).toEqual<GenerateResult>({
      text: "Yes, here is a detailed and useful answer for you.",
      source: "local",
      modelId: "phi3-mini-q4f16",
    });
  });

  it("falls back to cloud when the local response fails the quality check", async () => {
    setNavigator(standardNavigator);
    const webgpu = makeRuntime("ok");
    const cloud = makeCloud();
    const router = createRouter({ adapters: { webgpu }, cloud });

    await router.init();
    const result = await router.generate("hello");

    expect(webgpu.generate).toHaveBeenCalledWith("hello");
    expect(cloud.generate).toHaveBeenCalledWith("hello");
    expect(result).toEqual({ text: "cloud answer", source: "cloud" });
  });

  it("uses the WASM runtime for a light-tier device", async () => {
    setNavigator(lightNavigator);
    const wasm = makeRuntime("A concise but sufficiently long helpful response.");
    const cloud = makeCloud();
    const router = createRouter({ adapters: { wasm }, cloud });

    await router.init();
    const result = await router.generate("hello");

    expect(wasm.load).toHaveBeenCalledWith("qwen2.5-0.5b-q4f16");
    expect(result.source).toBe("local");
    expect(result.modelId).toBe("qwen2.5-0.5b-q4f16");
  });

  it("stays cloud-only when no adapter exists for the picked runtime", async () => {
    setNavigator(standardNavigator);
    const wasm = makeRuntime("ignored local response");
    const cloud = makeCloud();
    const router = createRouter({ adapters: { wasm }, cloud });

    await router.init();
    const result = await router.generate("hello");

    expect(wasm.generate).not.toHaveBeenCalled();
    expect(result).toEqual({ text: "cloud answer", source: "cloud" });
  });

  it("stays cloud-only when the device cannot run any local model", async () => {
    setNavigator(cloudOnlyNavigator);
    const wasm = makeRuntime("wasted local response");
    const cloud = makeCloud();
    const router = createRouter({ adapters: { wasm }, cloud });

    await router.init();
    const result = await router.generate("hello");

    expect(wasm.generate).not.toHaveBeenCalled();
    expect(result).toEqual({ text: "cloud answer", source: "cloud" });
  });

  it("routes through cloud when generate is called before init", async () => {
    setNavigator(lightNavigator);
    const cloud = makeCloud();
    const router = createRouter({ adapters: {}, cloud });

    const result = await router.generate("hello");

    expect(result).toEqual({ text: "cloud answer", source: "cloud" });
  });
});