import { DeviceCapabilities, ModelSpec, CapabilityTier, LocalRuntimeKind } from '@hybrid-ai/core';

type BenchOutputFormat = "table" | "json" | "browser";
interface CloudBenchAdapter {
    generate(prompt: string): Promise<string>;
}
interface BenchConfig {
    /** Prompts to run against each model. */
    prompts: string[];
    /** Model IDs to benchmark. Use ["pick"] for pickModel(), ["all"] for every eligible model, or specific IDs. */
    modelIds: string[];
    /** Optional cloud adapter for side-by-side comparison. */
    cloud?: CloudBenchAdapter;
    /** Output format. */
    output: BenchOutputFormat;
}
interface PromptBenchResult {
    prompt: string;
    latencyMs: number;
    wordsPerSec: number;
    quality: number;
    pass: boolean;
    reason?: string;
    cloudLatencyMs?: number;
    cloudWordsPerSec?: number;
}
interface ModelBenchResult {
    modelId: string;
    runtime: LocalRuntimeKind;
    eligible: boolean;
    skipReason?: string;
    loadTimeMs?: number;
    loadError?: string;
    prompts: PromptBenchResult[];
    avgLatencyMs: number;
    avgWordsPerSec: number;
    passRate: number;
    failReasons: string[];
}
interface DeviceBenchResult {
    tier: CapabilityTier;
    webgpu: boolean;
    wasm: boolean;
    deviceMemoryGiB: number | null;
    cpuCores: number | null;
    connection: string;
    models: ModelBenchResult[];
}
interface BenchmarkDeps {
    /** Probe the device (browser API). */
    probe: () => Promise<DeviceCapabilities>;
    /** Model catalog. */
    registry: readonly ModelSpec[];
    /** Local runtime adapters keyed by runtime kind. */
    adapters: Record<string, {
        load(modelId: string): Promise<void>;
        generate(prompt: string): Promise<string>;
    }>;
}

/**
 * Runs the full benchmark: probe device → select models → load → generate → score → (optional) cloud compare.
 * Environment-agnostic: all I/O is injected via `deps`, so this is testable with fakes
 * and runnable in a real browser via Playwright.
 */
declare function runBenchmark(config: BenchConfig, deps: BenchmarkDeps): Promise<DeviceBenchResult>;

declare const DEFAULT_PROMPTS: readonly string[];
/**
 * Load prompts from CLI options. Priority:
 * 1. --prompt-file (JSON array of strings)
 * 2. --prompts (comma-separated string)
 * 3. Built-in default suite
 */
declare function loadPrompts(options: {
    prompts?: string;
    promptFile?: string;
}): Promise<string[]>;

/**
 * Render a human-readable CLI table from a DeviceBenchResult.
 */
declare function renderTable(result: DeviceBenchResult): string;
/**
 * Render JSON output.
 */
declare function renderJson(result: DeviceBenchResult): string;
/**
 * Render a simple HTML page for in-browser viewing.
 */
declare function renderBrowserHtml(result: DeviceBenchResult): string;

export { type BenchConfig, type BenchOutputFormat, type BenchmarkDeps, type CloudBenchAdapter, DEFAULT_PROMPTS, type DeviceBenchResult, type ModelBenchResult, type PromptBenchResult, loadPrompts, renderBrowserHtml, renderJson, renderTable, runBenchmark };
