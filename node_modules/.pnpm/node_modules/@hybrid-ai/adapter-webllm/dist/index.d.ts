import { LocalRuntime } from '@hybrid-ai/core';

/** LocalRuntime backed by WebLLM (WebGPU path). */
declare class WebLLMAdapter implements LocalRuntime {
    private engine;
    load(modelId: string, onProgress?: (pct: number, text: string) => void): Promise<void>;
    generate(prompt: string): Promise<string>;
}

export { WebLLMAdapter };
