export interface LocalRuntime {
  load(modelId: string, onProgress?: (pct: number, text: string) => void): Promise<void>;
  generate(prompt: string): Promise<string>;
}

export interface CloudRuntime {
  generate(prompt: string): Promise<string>;
}