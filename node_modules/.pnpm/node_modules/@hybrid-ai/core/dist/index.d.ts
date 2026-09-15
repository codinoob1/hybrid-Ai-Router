/** The execution path a device can reasonably use for local inference. */
type CapabilityTier = "none" | "light" | "standard";
interface WasmCapabilities {
    supported: boolean;
    simd: boolean;
    threads: boolean;
}
interface WebGpuCapabilities {
    available: boolean;
    fallbackAdapter: boolean | null;
    maxBufferSize: number | null;
    maxStorageBufferBindingSize: number | null;
}
interface ConnectionCapabilities {
    effectiveType: string | null;
    downlinkMbps: number | null;
    saveData: boolean | null;
    modelDownloadRecommended: boolean;
}
interface DeviceCapabilities {
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
    gpu?: {
        requestAdapter(): Promise<GpuAdapterLike | null>;
    };
    deviceMemory?: number;
    hardwareConcurrency?: number;
    connection?: {
        effectiveType?: string;
        downlink?: number;
        saveData?: boolean;
    };
}
/** Injection points make the browser-dependent prober straightforward to test. */
interface ProbeOptions {
    navigator?: BrowserNavigator;
    crossOriginIsolated?: boolean;
}
/**
 * Probes browser capabilities without loading a model or requesting a GPU device.
 * Browser hints are conservative; local generation must still use the quality monitor.
 */
declare function probeDevice(options?: ProbeOptions): Promise<DeviceCapabilities>;

/** Backwards-compatible, shorter name for a completed device probe. */
type ProbeResult = DeviceCapabilities;
type LocalRuntimeKind = "webgpu" | "wasm";
interface ModelSpec {
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
/**
 * v1 model catalogue. These are eligibility requirements, not guarantees of
 * response quality; the orchestrator still runs the quality monitor afterwards.
 */
declare const REGISTRY: readonly ModelSpec[];
/** Returns true only when the reported browser capabilities meet every hard requirement. */
declare function canRun(probe: ProbeResult, model: ModelSpec): boolean;
/**
 * Chooses the most capable eligible model. `null` means the orchestrator must
 * use the cloud fallback (or defer until a model can be downloaded).
 */
declare function pickModel(probe: ProbeResult): ModelSpec | null;

interface QualityContext {
    latency: number;
}
interface QualityResult {
    quality: number;
    context: QualityContext;
    reason?: string;
    pass: boolean;
}
declare function scoreResponse(text: string, context: QualityContext): QualityResult;

interface LocalRuntime {
    load(modelId: string): Promise<void>;
    generate(prompt: string): Promise<string>;
}
interface CloudRuntime {
    generate(prompt: string): Promise<string>;
}

interface RouterConfig {
    adapters: {
        webgpu?: LocalRuntime;
        wasm?: LocalRuntime;
    };
    cloud: CloudRuntime;
}
interface GenerateResult {
    text: string;
    source: "local" | "cloud";
    modelId?: string;
}
declare function createRouter(config: RouterConfig): {
    init: () => Promise<void>;
    generate: (prompt: string) => Promise<GenerateResult>;
};

export { type CapabilityTier, type CloudRuntime, type ConnectionCapabilities, type DeviceCapabilities, type GenerateResult, type LocalRuntime, type LocalRuntimeKind, type ModelSpec, type ProbeOptions, type ProbeResult, type QualityContext, type QualityResult, REGISTRY, type RouterConfig, type WasmCapabilities, type WebGpuCapabilities, canRun, createRouter, pickModel, probeDevice, scoreResponse };
