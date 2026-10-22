import type { CapabilityTier, DeviceCapabilities, LocalRuntimeKind, ModelSpec } from "@hybrid-ai/core";

export type BenchOutputFormat = "table" | "json" | "browser";

export interface CloudBenchAdapter {
  generate(prompt: string): Promise<string>;
}

export interface BenchConfig {
  /** Prompts to run against each model. */
  prompts: string[];
  /** Model IDs to benchmark. Use ["pick"] for pickModel(), ["all"] for every eligible model, or specific IDs. */
  modelIds: string[];
  /** Optional cloud adapter for side-by-side comparison. */
  cloud?: CloudBenchAdapter;
  /** Output format. */
  output: BenchOutputFormat;
}

export interface PromptBenchResult {
  prompt: string;
  latencyMs: number;
  wordsPerSec: number;
  quality: number;
  pass: boolean;
  reason?: string;
  cloudLatencyMs?: number;
  cloudWordsPerSec?: number;
}

export interface ModelBenchResult {
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

export interface DeviceBenchResult {
  tier: CapabilityTier;
  webgpu: boolean;
  wasm: boolean;
  deviceMemoryGiB: number | null;
  cpuCores: number | null;
  connection: string;
  models: ModelBenchResult[];
}

export interface BenchmarkDeps {
  /** Probe the device (browser API). */
  probe: () => Promise<DeviceCapabilities>;
  /** Model catalog. */
  registry: readonly ModelSpec[];
  /** Local runtime adapters keyed by runtime kind. */
  adapters: Record<
    string,
    { load(modelId: string): Promise<void>; generate(prompt: string): Promise<string> }
  >;
}
