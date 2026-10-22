/** The execution path a device can reasonably use for local inference. */
export type CapabilityTier = "none" | "light" | "standard";

export interface WasmCapabilities {
  supported: boolean;
  simd: boolean;
  threads: boolean;
}

export interface WebGpuCapabilities {
  available: boolean;
  fallbackAdapter: boolean | null;
  maxBufferSize: number | null;
  maxStorageBufferBindingSize: number | null;
}

export interface ConnectionCapabilities {
  effectiveType: string | null;
  downlinkMbps: number | null;
  saveData: boolean | null;
  modelDownloadRecommended: boolean;
}

export interface DeviceCapabilities {
  tier: CapabilityTier;
  webgpu: WebGpuCapabilities;
  wasm: WasmCapabilities;
  deviceMemoryGiB: number | null;
  cpuCores: number | null;
  connection: ConnectionCapabilities;
  reasons: string[];
}

interface GpuAdapterLike {
  isFallbackAdapter?: boolean;
  limits?: {
    maxBufferSize?: number;
    maxStorageBufferBindingSize?: number;
  };
}

interface BrowserNavigator {
  gpu?: { requestAdapter(): Promise<GpuAdapterLike | null> };
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { effectiveType?: string; downlink?: number; saveData?: boolean };
}

/** Injection points make the browser-dependent prober straightforward to test. */
export interface ProbeOptions {
  navigator?: BrowserNavigator;
  crossOriginIsolated?: boolean;
}

const SIMD_VALIDATION_MODULE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 9, 1, 7,
  0, 65, 0, 253, 15, 26, 11,
]);

function getNavigator(): BrowserNavigator | undefined {
  return (globalThis as typeof globalThis & { navigator?: BrowserNavigator }).navigator;
}

function asFiniteNonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function detectWasmCapabilities(crossOriginIsolated: boolean): WasmCapabilities {
  if (typeof WebAssembly === "undefined") return { supported: false, simd: false, threads: false };

  const simd = WebAssembly.validate(SIMD_VALIDATION_MODULE);
  let threads = false;
  if (crossOriginIsolated && typeof SharedArrayBuffer !== "undefined") {
    try {
      new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
      threads = true;
    } catch {
      // Shared WASM memory is unavailable in this browser/context.
    }
  }
  return { supported: true, simd, threads };
}

async function detectWebGpuCapabilities(
  browserNavigator: BrowserNavigator | undefined,
): Promise<WebGpuCapabilities> {
  const unavailable = {
    available: false,
    fallbackAdapter: null,
    maxBufferSize: null,
    maxStorageBufferBindingSize: null,
  } as const;
  if (!browserNavigator?.gpu) return unavailable;

  try {
    const adapter = await browserNavigator.gpu.requestAdapter();
    if (!adapter) return unavailable;
    return {
      available: true,
      fallbackAdapter: adapter.isFallbackAdapter ?? false,
      maxBufferSize: asFiniteNonNegativeNumber(adapter.limits?.maxBufferSize),
      maxStorageBufferBindingSize: asFiniteNonNegativeNumber(adapter.limits?.maxStorageBufferBindingSize),
    };
  } catch {
    return unavailable;
  }
}

function detectConnection(browserNavigator: BrowserNavigator | undefined): ConnectionCapabilities {
  const connection = browserNavigator?.connection;
  const effectiveType = connection?.effectiveType ?? null;
  const downlinkMbps = asFiniteNonNegativeNumber(connection?.downlink);
  const saveData = typeof connection?.saveData === "boolean" ? connection.saveData : null;
  const slowConnection = effectiveType === "slow-2g" || effectiveType === "2g";
  return {
    effectiveType,
    downlinkMbps,
    saveData,
    modelDownloadRecommended: !saveData && !slowConnection && (downlinkMbps === null || downlinkMbps >= 1.5),
  };
}

function selectTier(input: {
  webgpu: WebGpuCapabilities;
  wasm: WasmCapabilities;
  deviceMemoryGiB: number | null;
  cpuCores: number | null;
  reasons: string[];
}): CapabilityTier {
  const { webgpu, wasm, deviceMemoryGiB, cpuCores, reasons } = input;
  const insufficientMemory = deviceMemoryGiB !== null && deviceMemoryGiB < 4;
  const modestMemory = deviceMemoryGiB !== null && deviceMemoryGiB < 8;
  const insufficientCpu = cpuCores !== null && cpuCores < 2;

  if (webgpu.available && !webgpu.fallbackAdapter && !insufficientMemory && !insufficientCpu) {
    if (!modestMemory) {
      reasons.push("WebGPU is available with sufficient device-memory and CPU hints for standard local models.");
      return "standard";
    }
    reasons.push("WebGPU is available, but reported device memory is below 8 GiB; using the light tier.");
  }
  if (wasm.simd && !insufficientMemory && !insufficientCpu) {
    reasons.push("WebAssembly SIMD is available for lightweight local models.");
    return "light";
  }

  if (insufficientMemory) reasons.push("Reported device memory is below the 4 GiB light-tier minimum.");
  if (insufficientCpu) reasons.push("Reported CPU concurrency is below the 2-core light-tier minimum.");
  if (!wasm.simd) reasons.push("WebAssembly SIMD is unavailable.");
  if (webgpu.fallbackAdapter) reasons.push("Only a fallback WebGPU adapter was provided.");
  reasons.push("Using cloud-only mode.");
  return "none";
}

/**
 * Probes browser capabilities without loading a model or requesting a GPU device.
 * Browser hints are conservative; local generation must still use the quality monitor.
 */
export async function probeDevice(options: ProbeOptions = {}): Promise<DeviceCapabilities> {
  const browserNavigator = options.navigator ?? getNavigator();
  const crossOriginIsolated =
    options.crossOriginIsolated ??
    (globalThis as typeof globalThis & { crossOriginIsolated?: boolean }).crossOriginIsolated ??
    false;
  const reasons: string[] = [];
  const webgpu = await detectWebGpuCapabilities(browserNavigator);
  const wasm = detectWasmCapabilities(crossOriginIsolated);
  const connection = detectConnection(browserNavigator);
  const deviceMemoryGiB = asFiniteNonNegativeNumber(browserNavigator?.deviceMemory);
  const cpuCores = asFiniteNonNegativeNumber(browserNavigator?.hardwareConcurrency);
  const tier = selectTier({ webgpu, wasm, deviceMemoryGiB, cpuCores, reasons });

  if (!connection.modelDownloadRecommended) {
    reasons.push("Connection settings indicate that downloading a local model should be deferred.");
  }
  if (wasm.threads) reasons.push("WASM threads are usable in this cross-origin-isolated context.");
  return { tier, webgpu, wasm, deviceMemoryGiB, cpuCores, connection, reasons };
}
