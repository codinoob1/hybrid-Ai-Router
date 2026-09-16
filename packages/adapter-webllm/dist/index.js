// src/index.ts
import { CreateMLCEngine } from "@mlc-ai/web-llm";
var WebLLMAdapter = class {
  engine = null;
  async load(modelId, onProgress) {
    this.engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (p) => onProgress?.(p.progress, p.text)
    });
  }
  async generate(prompt) {
    if (!this.engine) throw new Error("WebLLMAdapter: load() must be called before generate()");
    const reply = await this.engine.chat.completions.create({
      messages: [{ role: "user", content: prompt }]
    });
    return reply.choices[0]?.message?.content ?? "";
  }
};
export {
  WebLLMAdapter
};
