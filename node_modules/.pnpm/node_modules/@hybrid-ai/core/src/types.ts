export interface LocalRuntime {
  load(modelId: string): Promise<void>;
  generate(prompt: string): Promise<string>;
}

export interface CloudRuntime {
  generate(prompt: string): Promise<string>;
}