import type { CloudProviderConfig } from "../types";

type OpenAiConfig = Extract<CloudProviderConfig, { provider: "openai" | "custom" }>;

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

async function errorBody(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return typeof data?.error?.message === "string" ? data.error.message : res.statusText;
  } catch {
    return res.statusText;
  }
}

/** OpenAI-compatible chat completions client. Also used for `custom` endpoints. */
export async function openaiGenerate(prompt: string, config: OpenAiConfig): Promise<string> {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI request failed (${res.status}): ${await errorBody(res)}`);

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI response missing choices[0].message.content");
  }
  return content;
}