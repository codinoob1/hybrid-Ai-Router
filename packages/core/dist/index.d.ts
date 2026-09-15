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

export { type CapabilityTier, type ConnectionCapabilities, type DeviceCapabilities, type ProbeOptions, type WasmCapabilities, type WebGpuCapabilities, probeDevice };
