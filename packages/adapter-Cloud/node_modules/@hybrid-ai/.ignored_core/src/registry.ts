import type { CapabilityTier, DeviceCapabilities } from "./prober.js";

/** Backwards-compatible, shorter name for a completed device probe. */
export type ProbeResult = DeviceCapabilities;

export type LocalRuntimeKind = "webgpu" | "wasm";

export interface ModelSpec {
  /** Runtime-specific model identifier. Adapters resolve this to their own model URL/configuration. */
  id: string;
  label: string;
  /** UI/logging metadata only, for example `0.5B` or `3.8B`. */
  params: string;
  runtime: LocalRuntimeKind;
  minTier: Exclude<CapabilityTier, "none">;
  downloadSizeMB: number;
  minDeviceMemoryGiB?: number;
  /** WebGPU-only: maximum size of one buffer needed by the model/runtime. */
  requiredMaxBufferSize?: number;
  /** WebGPU-only: largest storage-buffer binding needed by the model/runtime. */
  requiredStorageBufferBindingSize?: number;
  /** WASM-only: reject the model rather than using a slow single-thread fallback. */
  requiresThreads?: boolean;
}

const MEBIBYTE = 1024 * 1024;

/**
 * v1 model catalogue. These are eligibility requirements, not guarantees of
 * response quality; the orchestrator still runs the quality monitor afterwards.
 */
export const REGISTRY: readonly ModelSpec[] = [
  {
    id: "qwen2.5-0.5b-q4f16",
    label: "Qwen2.5 0.5B",
    params: "0.5B",
    runtime: "wasm",
    minTier: "light",
    downloadSizeMB: 380,
    minDeviceMemoryGiB: 4,
  },
  {
    id: "phi3-mini-q4f16",
    label: "Phi-3-mini",
    params: "3.8B",
    runtime: "webgpu",
    minTier: "standard",
    downloadSizeMB: 2100,
    minDeviceMemoryGiB: 8,
    requiredMaxBufferSize: 512 * MEBIBYTE,
    requiredStorageBufferBindingSize: 256 * MEBIBYTE,
  },
  //More models to be added in the future 
];


const TIER_RANK: Record<CapabilityTier, number> = { none: 0, light: 1, standard: 2 };

/** Returns true only when the reported browser capabilities meet every hard requirement. */
export function canRun(probe: ProbeResult, model: ModelSpec): boolean {
  if (TIER_RANK[probe.tier] < TIER_RANK[model.minTier]) return false;

  if (
    model.minDeviceMemoryGiB !== undefined &&
    probe.deviceMemoryGiB !== null &&
    probe.deviceMemoryGiB < model.minDeviceMemoryGiB
  ) {
    return false;
  }

  if (model.runtime === "webgpu") {
    if (!probe.webgpu.available || probe.webgpu.fallbackAdapter) return false;
    if (
      model.requiredMaxBufferSize !== undefined &&
      (probe.webgpu.maxBufferSize === null || probe.webgpu.maxBufferSize < model.requiredMaxBufferSize)
    ) {
      return false;
    }
    if (
      model.requiredStorageBufferBindingSize !== undefined &&
      (probe.webgpu.maxStorageBufferBindingSize === null ||
        probe.webgpu.maxStorageBufferBindingSize < model.requiredStorageBufferBindingSize)
    ) {
      return false;
    }
  }

  if (model.runtime === "wasm") {
    if (!probe.wasm.supported || !probe.wasm.simd) return false;
    if (model.requiresThreads && !probe.wasm.threads) return false;
  }

  if (probe.connection.saveData) return false;
  if (!probe.connection.modelDownloadRecommended && model.downloadSizeMB > 500) return false;
  return true;
}

/**
 * Chooses the most capable eligible model. `null` means the orchestrator must
 * use the cloud fallback (or defer until a model can be downloaded).
 */
export function pickModel(probe: ProbeResult): ModelSpec | null {
  const candidates = REGISTRY.filter((model) => canRun(probe, model));
  return candidates.reduce<ModelSpec | null>(
    (best, candidate) => (!best || candidate.downloadSizeMB > best.downloadSizeMB ? candidate : best),
    null,
  );
}
