import { describe, expect, it } from "vitest";
import { canRun, pickModel, REGISTRY, type ProbeResult } from "../src/registry.js";

const standardProbe: ProbeResult = {
  tier: "standard",
  deviceMemoryGiB: 16,
  cpuCores: 16,
  webgpu: {
    available: true,
    fallbackAdapter: false,
    maxBufferSize: 2_147_483_648,
    maxStorageBufferBindingSize: 2_147_483_644,
  },
  wasm: { supported: true, simd: true, threads: false },
  connection: { effectiveType: "4g", downlinkMbps: 10, saveData: false, modelDownloadRecommended: true },
  reasons: [],
};

describe("model registry", () => {
  it("selects Phi-3-mini for the reported laptop capabilities", () => {
    expect(pickModel(standardProbe)?.id).toBe("phi3-mini-q4f16");
  });

  it("rejects a WebGPU model that exceeds a reported buffer limit", () => {
    const phi3 = REGISTRY.find((model) => model.id === "phi3-mini-q4f16");
    if (!phi3) throw new Error("Phi-3 is missing from the registry.");
    expect(canRun({ ...standardProbe, webgpu: { ...standardProbe.webgpu, maxStorageBufferBindingSize: 1 } }, phi3)).toBe(false);
  });

  it("does not require WASM threads unless a model declares that requirement", () => {
    const qwen = REGISTRY.find((model) => model.id === "qwen2.5-0.5b-q4f16");
    if (!qwen) throw new Error("Qwen is missing from the registry.");
    const lightProbe = { ...standardProbe, tier: "light" as const, webgpu: { ...standardProbe.webgpu, available: false } };
    expect(canRun(lightProbe, qwen)).toBe(true);
    expect(canRun(lightProbe, { ...qwen, requiresThreads: true })).toBe(false);
  });

  it("returns cloud fallback when downloads are disallowed", () => {
    expect(pickModel({ ...standardProbe, connection: { ...standardProbe.connection, saveData: true } })).toBeNull();
  });
});
