import type { CloudProviderConfig } from "../types";

type GeminiConfig = Extract<CloudProviderConfig, { provider: "gemini" }>;

const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

async function errorBody(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return typeof data?.error?.message === "string" ? data.error.message : res.statusText;
  } catch {
    return res.statusText;
  }
}

/** Google Gemini generateContent client. */
export async function geminiGenerate(prompt: string, config: GeminiConfig): Promise<string> {
  const url = `${API_BASE_URL}/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });

  if (!res.ok) throw new Error(`Gemini request failed (${res.status}): ${await errorBody(res)}`);

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) throw new Error("Gemini response missing candidates[0].content.parts");

  return parts.map((part: { text?: string }) => part.text ?? "").join("");
}