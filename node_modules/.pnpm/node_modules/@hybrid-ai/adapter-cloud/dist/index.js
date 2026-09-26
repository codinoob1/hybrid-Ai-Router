// src/providers/openai.ts
import OpenAI from "openai";
var DEFAULT_BASE_URL = "https://api.openai.com/v1";
async function openaiGenerate(prompt, config) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl ?? DEFAULT_BASE_URL,
    dangerouslyAllowBrowser: true
  });
  const completion = await client.chat.completions.create({
    model: config.model,
    messages: [{ role: "user", content: prompt }]
  });
  const content = completion.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

// src/providers/anthropic.ts
var API_URL = "https://api.anthropic.com/v1/messages";
var API_VERSION = "2023-06-01";
async function errorBody(res) {
  try {
    const data = await res.json();
    return typeof data?.error?.message === "string" ? data.error.message : res.statusText;
  } catch {
    return res.statusText;
  }
}
async function anthropicGenerate(prompt, config) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic request failed (${res.status}): ${await errorBody(res)}`);
  const data = await res.json();
  const blocks = data?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks.map((block) => "text" in block ? block.text ?? "" : "").join("");
}

// src/providers/gemini.ts
var API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
async function errorBody2(res) {
  try {
    const data = await res.json();
    return typeof data?.error?.message === "string" ? data.error.message : res.statusText;
  } catch {
    return res.statusText;
  }
}
async function geminiGenerate(prompt, config) {
  const url = `${API_BASE_URL}/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    })
  });
  if (!res.ok) throw new Error(`Gemini request failed (${res.status}): ${await errorBody2(res)}`);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part) => part.text ?? "").join("");
}

// src/index.ts
function createCloudAdapter(config) {
  return {
    async generate(prompt) {
      switch (config.provider) {
        case "openai":
          return openaiGenerate(prompt, config);
        case "anthropic":
          return anthropicGenerate(prompt, config);
        case "gemini":
          return geminiGenerate(prompt, config);
        case "custom":
          return openaiGenerate(prompt, config);
        // assume OpenAI-compatible shape
        default: {
          const _exhaustive = config;
          throw new Error("Unknown cloud provider");
        }
      }
    }
  };
}
export {
  createCloudAdapter
};
