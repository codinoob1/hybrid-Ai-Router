import {
  type CapabilityTier,
  type DeviceCapabilities,
  type LocalRuntimeKind,
  type ModelSpec,
  scoreResponse,
} from "@hybrid-ai/core";
import type {
  BenchConfig,
  BenchmarkDeps,
  DeviceBenchResult,
  ModelBenchResult,
  PromptBenchResult,
} from "./types.js";

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

function approxWordsPerSec(text: string, latencyMs: number): number {
  if (latencyMs <= 0) return 0;
  return countWords(text) / (latencyMs / 1000);
}

/**
 * Runs the full benchmark: probe device → select models → load → generate → score → (optional) cloud compare.
 * Environment-agnostic: all I/O is injected via `deps`, so this is testable with fakes
 * and runnable in a real browser via Playwright.
 */
export async function runBenchmark(config: BenchConfig, deps: BenchmarkDeps): Promise<DeviceBenchResult> {
  const { probe, registry, adapters } = deps;
  const cloud = config.cloud;

  // 1. Probe the device
  const device = await probe();

  // 2. Select models to benchmark
  let candidateSpecs: ModelSpec[] = [];
  if (config.modelIds.includes("all")) {
    // Include every model from the registry; eligibility is checked per-model below.
    candidateSpecs = [...registry];
  } else if (config.modelIds.includes("pick")) {
    const picked = pickModelLike(device, registry);
    candidateSpecs = picked ? [picked] : [];
  } else {
    // Specific IDs: look them up in the registry, or create a synthetic spec for custom IDs
    for (const id of config.modelIds) {
      const spec = registry.find((m) => m.id === id);
      if (spec) {
        candidateSpecs.push(spec);
      } else {
        // Custom model ID not in registry — create a best-effort spec
        candidateSpecs.push({
          id,
          label: id,
          params: "unknown",
          runtime: device.tier === "standard" ? "webgpu" : "wasm",
          minTier: device.tier as Exclude<CapabilityTier, "none">,
          downloadSizeMB: 0,
        });
      }
    }
  }

  // 3. Benchmark each model
  const models: ModelBenchResult[] = [];

  for (const spec of candidateSpecs) {
    const result: ModelBenchResult = {
      modelId: spec.id,
      runtime: spec.runtime,
      eligible: false,
      prompts: [],
      avgLatencyMs: 0,
      avgWordsPerSec: 0,
      passRate: 0,
      failReasons: [],
    };

    // Check eligibility
    const eligible = canRunLike(device, spec);
    if (!eligible) {
      result.eligible = false;
      result.skipReason = "Device does not meet model requirements (tier, memory, WebGPU, WASM, connection).";
      models.push(result);
      continue;
    }

    result.eligible = true;

    // Get the right adapter
    const adapter = adapters[spec.runtime];
    if (!adapter) {
      result.skipReason = `No adapter available for runtime "${spec.runtime}".`;
      models.push(result);
      continue;
    }

    // Load the model
    let loadTimeMs = 0;
    let loadError: string | undefined;
    try {
      const start = performance.now();
      await adapter.load(spec.id);
      loadTimeMs = performance.now() - start;
      result.loadTimeMs = loadTimeMs;
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
      result.loadError = loadError;
      models.push(result);
      continue; // can't generate if load failed
    }

    // Run each prompt
    const promptResults: PromptBenchResult[] = [];
    let totalLatency = 0;
    let totalWps = 0;
    let passCount = 0;
    const failReasons: string[] = [];

    for (const prompt of config.prompts) {
      const pr: PromptBenchResult = {
        prompt,
        latencyMs: 0,
        wordsPerSec: 0,
        quality: 0,
        pass: false,
      };

      try {
        const start = performance.now();
        const text = await adapter.generate(prompt);
        const latencyMs = performance.now() - start;
        const wps = approxWordsPerSec(text, latencyMs);

        const score = scoreResponse(text, { latency: latencyMs });

        pr.latencyMs = latencyMs;
        pr.wordsPerSec = wps;
        pr.quality = score.quality;
        pr.pass = score.pass;
        pr.reason = score.reason;

        if (!score.pass && score.reason) {
          failReasons.push(score.reason);
        } else {
          passCount++;
        }
      } catch (err) {
        pr.reason = err instanceof Error ? err.message : String(err);
        failReasons.push(pr.reason);
      }

      // Cloud comparison for this prompt
      if (cloud) {
        try {
          const cStart = performance.now();
          const cloudText = await cloud.generate(prompt);
          const cLatency = performance.now() - cStart;
          pr.cloudLatencyMs = cLatency;
          pr.cloudWordsPerSec = approxWordsPerSec(cloudText, cLatency);
        } catch (err) {
          // Cloud failure is non-fatal; just don't include cloud columns
        }
      }

      totalLatency += pr.latencyMs;
      totalWps += pr.wordsPerSec;
      promptResults.push(pr);
    }

    result.prompts = promptResults;
    result.avgLatencyMs = promptResults.length > 0 ? totalLatency / promptResults.length : 0;
    result.avgWordsPerSec = promptResults.length > 0 ? totalWps / promptResults.length : 0;
    result.passRate = promptResults.length > 0 ? passCount / promptResults.length : 0;
    result.failReasons = failReasons;

    models.push(result);
  }

  return {
    tier: device.tier,
    webgpu: device.webgpu.available,
    wasm: device.wasm.supported,
    deviceMemoryGiB: device.deviceMemoryGiB,
    cpuCores: device.cpuCores,
    connection: device.connection.effectiveType ?? "unknown",
    models,
  };
}
//THESE WAS AI WRITEN IDK THE FUCK GOING ON HERE 😅
/** Lightweight canRun check using only probe fields (no full registry import needed). */
function canRunLike(device: DeviceCapabilities, model: ModelSpec): boolean {
  const rank: Record<CapabilityTier, number> = { none: 0, light: 1, standard: 2 };
  if (rank[device.tier] < rank[model.minTier]) return false;
  if (model.minDeviceMemoryGiB !== undefined && device.deviceMemoryGiB !== null && device.deviceMemoryGiB < model.minDeviceMemoryGiB) return false;
  if (model.runtime === "webgpu") {
    if (!device.webgpu.available || device.webgpu.fallbackAdapter) return false;
    if (model.requiredMaxBufferSize !== undefined && (device.webgpu.maxBufferSize === null || device.webgpu.maxBufferSize < model.requiredMaxBufferSize)) return false;
    if (model.requiredStorageBufferBindingSize !== undefined && (device.webgpu.maxStorageBufferBindingSize === null || device.webgpu.maxStorageBufferBindingSize < model.requiredStorageBufferBindingSize)) return false;
  }
  if (model.runtime === "wasm") {
    if (!device.wasm.supported || !device.wasm.simd) return false;
    if (model.requiresThreads && !device.wasm.threads) return false;
  }
  if (device.connection.saveData) return false;
  if (!device.connection.modelDownloadRecommended && model.downloadSizeMB > 500) return false;
  return true;
}

function pickModelLike(device: DeviceCapabilities, registry: readonly ModelSpec[]): ModelSpec | null {
  const candidates = registry.filter((m) => canRunLike(device, m));
  return candidates.reduce<ModelSpec | null>(
    (best, candidate) => (!best || candidate.downloadSizeMB > best.downloadSizeMB ? candidate : best),
    null,
  );
}
