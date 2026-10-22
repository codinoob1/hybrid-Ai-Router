import {
  DEFAULT_PROMPTS,
  loadPrompts,
  renderBrowserHtml,
  renderJson,
  renderTable
} from "./chunk-ACJPRXDH.js";

// src/benchmark.ts
import {
  scoreResponse
} from "@hybrid-ai/core";
function countWords(text) {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}
function approxWordsPerSec(text, latencyMs) {
  if (latencyMs <= 0) return 0;
  return countWords(text) / (latencyMs / 1e3);
}
async function runBenchmark(config, deps) {
  const { probe, registry, adapters } = deps;
  const cloud = config.cloud;
  const device = await probe();
  let candidateSpecs = [];
  if (config.modelIds.includes("all")) {
    candidateSpecs = [...registry];
  } else if (config.modelIds.includes("pick")) {
    const picked = pickModelLike(device, registry);
    candidateSpecs = picked ? [picked] : [];
  } else {
    for (const id of config.modelIds) {
      const spec = registry.find((m) => m.id === id);
      if (spec) {
        candidateSpecs.push(spec);
      } else {
        candidateSpecs.push({
          id,
          label: id,
          params: "unknown",
          runtime: device.tier === "standard" ? "webgpu" : "wasm",
          minTier: device.tier,
          downloadSizeMB: 0
        });
      }
    }
  }
  const models = [];
  for (const spec of candidateSpecs) {
    const result = {
      modelId: spec.id,
      runtime: spec.runtime,
      eligible: false,
      prompts: [],
      avgLatencyMs: 0,
      avgWordsPerSec: 0,
      passRate: 0,
      failReasons: []
    };
    const eligible = canRunLike(device, spec);
    if (!eligible) {
      result.eligible = false;
      result.skipReason = "Device does not meet model requirements (tier, memory, WebGPU, WASM, connection).";
      models.push(result);
      continue;
    }
    result.eligible = true;
    const adapter = adapters[spec.runtime];
    if (!adapter) {
      result.skipReason = `No adapter available for runtime "${spec.runtime}".`;
      models.push(result);
      continue;
    }
    let loadTimeMs = 0;
    let loadError;
    try {
      const start = performance.now();
      await adapter.load(spec.id);
      loadTimeMs = performance.now() - start;
      result.loadTimeMs = loadTimeMs;
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
      result.loadError = loadError;
      models.push(result);
      continue;
    }
    const promptResults = [];
    let totalLatency = 0;
    let totalWps = 0;
    let passCount = 0;
    const failReasons = [];
    for (const prompt of config.prompts) {
      const pr = {
        prompt,
        latencyMs: 0,
        wordsPerSec: 0,
        quality: 0,
        pass: false
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
      if (cloud) {
        try {
          const cStart = performance.now();
          const cloudText = await cloud.generate(prompt);
          const cLatency = performance.now() - cStart;
          pr.cloudLatencyMs = cLatency;
          pr.cloudWordsPerSec = approxWordsPerSec(cloudText, cLatency);
        } catch (err) {
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
    models
  };
}
function canRunLike(device, model) {
  const rank = { none: 0, light: 1, standard: 2 };
  if (rank[device.tier] < rank[model.minTier]) return false;
  if (model.minDeviceMemoryGiB !== void 0 && device.deviceMemoryGiB !== null && device.deviceMemoryGiB < model.minDeviceMemoryGiB) return false;
  if (model.runtime === "webgpu") {
    if (!device.webgpu.available || device.webgpu.fallbackAdapter) return false;
    if (model.requiredMaxBufferSize !== void 0 && (device.webgpu.maxBufferSize === null || device.webgpu.maxBufferSize < model.requiredMaxBufferSize)) return false;
    if (model.requiredStorageBufferBindingSize !== void 0 && (device.webgpu.maxStorageBufferBindingSize === null || device.webgpu.maxStorageBufferBindingSize < model.requiredStorageBufferBindingSize)) return false;
  }
  if (model.runtime === "wasm") {
    if (!device.wasm.supported || !device.wasm.simd) return false;
    if (model.requiresThreads && !device.wasm.threads) return false;
  }
  if (device.connection.saveData) return false;
  if (!device.connection.modelDownloadRecommended && model.downloadSizeMB > 500) return false;
  return true;
}
function pickModelLike(device, registry) {
  const candidates = registry.filter((m) => canRunLike(device, m));
  return candidates.reduce(
    (best, candidate) => !best || candidate.downloadSizeMB > best.downloadSizeMB ? candidate : best,
    null
  );
}
export {
  DEFAULT_PROMPTS,
  loadPrompts,
  renderBrowserHtml,
  renderJson,
  renderTable,
  runBenchmark
};
