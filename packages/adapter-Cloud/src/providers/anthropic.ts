import type { CloudProviderConfig } from "../types";

type AnthropicConfig = Extract<CloudProviderConfig, { provider: "anthropic" }>;

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

async function errorBody(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return typeof data?.error?.message === "string" ? data.error.message : res.statusText;
  } catch {
    return res.statusText;
  }
}

/** Anthropic Messages API client. */
export async function anthropicGenerate(prompt: string, config: AnthropicConfig): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic request failed (${res.status}): ${await errorBody(res)}`);

  const data = await res.json();
  const blocks = data?.content;
  if (!Array.isArray(blocks)) throw new Error("Anthropic response missing content array");

  return blocks
    .map((block: { type?: string; text?: string }) => ("text" in block ? block.text ?? "" : ""))
    .join("");
}