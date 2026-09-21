// packages/adapter-cloud/src/types.ts
export type CloudProviderConfig =
  | { provider: 'openai'; apiKey: string; model: string; baseUrl?: string }
  | { provider: 'anthropic'; apiKey: string; model: string }
  | { provider: 'gemini'; apiKey: string; model: string }
  | { provider: 'custom'; apiKey?: string; model: string; baseUrl: string }; // any OpenAI-compatible endpoint