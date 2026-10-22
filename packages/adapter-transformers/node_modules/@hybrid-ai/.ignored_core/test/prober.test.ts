import { describe, expect, it } from "vitest";
import { probeDevice } from "../src/prober.js";

describe("probeDevice", () => {
  it("selects standard when WebGPU and strong device hints are present", async () => {
    const result = await probeDevice({
      navigator: {
        gpu: { requestAdapter: async () => ({ limits: { maxBufferSize: 1_000_000_000 } }) },
        deviceMemory: 16,
        hardwareConcurrency: 8,
      },
    });
    expect(result.tier).toBe("standard");
    expect(result.webgpu.available).toBe(true);
  });

  it("selects light without WebGPU when WASM SIMD and modest hardware are available", async () => {
    const result = await probeDevice({ navigator: { deviceMemory: 4, hardwareConcurrency: 4 } });
    expect(result.wasm.simd).toBe(true);
    expect(result.tier).toBe("light");
  });

  it("selects none for a low-memory device", async () => {
    const result = await probeDevice({ navigator: { deviceMemory: 2, hardwareConcurrency: 4 } });
    expect(result.tier).toBe("none");
  });

  it("does not treat a fallback WebGPU adapter as standard", async () => {
    const result = await probeDevice({
      navigator: {
        gpu: { requestAdapter: async () => ({ isFallbackAdapter: true }) },
        deviceMemory: 16,
        hardwareConcurrency: 8,
      },
    });
    expect(result.webgpu.available).toBe(true);
    expect(result.webgpu.fallbackAdapter).toBe(true);
    expect(result.tier).not.toBe("standard");
    expect(result.tier).toBe("light");
  });

  it("does not crash when requestAdapter() throws and falls back to the wasm probe", async () => {
    const result = await probeDevice({
      navigator: {
        gpu: { requestAdapter: async () => { throw new Error("gpu exploded"); } },
        deviceMemory: 16,
        hardwareConcurrency: 8,
      },
    });
    expect(result.webgpu.available).toBe(false);
    expect(result.wasm.simd).toBe(true);
    expect(result.tier).toBe("light");
  });
});
