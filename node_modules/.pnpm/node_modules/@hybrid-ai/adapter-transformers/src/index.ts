import { pipeline, type TextGenerationPipeline } from "@huggingface/transformers";
import type { LocalRuntime } from "@hybrid-ai/core";

/** LocalRuntime backed by Transformers.js (WASM/WebNN path). */
export class HuggingFaceRuntime implements LocalRuntime {
  private generator: TextGenerationPipeline | null = null;

  async load(modelId: string, onProgress?: (pct: number, text: string) => void): Promise<void> {
    this.generator = await pipeline("text-generation", modelId, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (info) => {
        if (info.status === "progress" && onProgress) {
          onProgress(info.progress / 100, info.file ?? modelId);
        }
      },
    });
  }

  async generate(prompt: string): Promise<string> {
    if (!this.generator) throw new Error("HuggingFaceRuntime: load() must be called before generate()");

    const output = await this.generator(
      [{ role: "user", content: prompt }],
      { max_new_tokens: 256, do_sample: false },
    );

    return output[0]?.generated_text?.at(-1)?.content ?? "";
  }
}