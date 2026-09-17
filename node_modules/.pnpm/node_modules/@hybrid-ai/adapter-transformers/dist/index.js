// src/index.ts
import { pipeline } from "@huggingface/transformers";
var HuggingFaceRuntime = class {
  generator = null;
  async load(modelId, onProgress) {
    this.generator = await pipeline("text-generation", modelId, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (info) => {
        if (info.status === "progress" && onProgress) {
          onProgress(info.progress / 100, info.file ?? modelId);
        }
      }
    });
  }
  async generate(prompt) {
    if (!this.generator) throw new Error("HuggingFaceRuntime: load() must be called before generate()");
    const output = await this.generator(
      [{ role: "user", content: prompt }],
      { max_new_tokens: 256, do_sample: false }
    );
    return output[0]?.generated_text?.at(-1)?.content ?? "";
  }
};
export {
  HuggingFaceRuntime
};
