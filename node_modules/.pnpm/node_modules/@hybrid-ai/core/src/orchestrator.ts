import { probeDevice, type DeviceCapabilities } from "./prober.js";
import { pickModel } from "./registry.js";
import { scoreResponse } from "./quality.js";
import type { LocalRuntime, CloudRuntime } from "./types.js";

export interface RouterConfig {
  adapters: { webgpu?: LocalRuntime; wasm?: LocalRuntime };
  cloud: CloudRuntime;
}

export interface GenerateResult {
  text: string;
  source: "local" | "cloud";
  modelId?: string;
}

export function createRouter(config: RouterConfig) {
  let probe: DeviceCapabilities | null = null;
  let loadedRuntime: LocalRuntime | null = null;
  let loadedModelId: string | null = null;

  async function init(): Promise<void> {
    probe = await probeDevice();
    const model = pickModel(probe);

    if (!model) return; // device can't run anything local — stay null, always cloud

    const runtime = config.adapters[model.runtime];
    if (!runtime) return;

    await runtime.load(model.id);
    loadedRuntime = runtime;
    loadedModelId = model.id;
  }

  async function generate(prompt: string): Promise<GenerateResult> {
    if (!loadedRuntime) {
      return { text: await config.cloud.generate(prompt), source: "cloud" };
    }

    const start = performance.now();
    const localText = await loadedRuntime.generate(prompt);
    const latencyMs = performance.now() - start;

    const score = scoreResponse(localText, { latency: latencyMs });
    if (score.pass) {
      return { text: localText, source: "local", modelId: loadedModelId! };
    }

    // local answer wasn't good enough — fall back for this call
    return { text: await config.cloud.generate(prompt), source: "cloud" };
  }

  return { init, generate };
}