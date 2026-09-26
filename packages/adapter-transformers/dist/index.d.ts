import { LocalRuntime } from '@hybrid-ai/core';

/** LocalRuntime backed by Transformers.js (WASM/WebNN path). */
declare class HuggingFaceRuntime implements LocalRuntime {
    private generator;
    load(modelId: string, onProgress?: (pct: number, text: string) => void): Promise<void>;
    generate(prompt: string): Promise<string>;
}

export { HuggingFaceRuntime };
