# Hybrid AI Router

A browser-side JS package that decides whether a small AI model can run on the
user's own device, runs it there when possible, and falls back to a cloud API
when the device can't handle it — or the local response quality is too low.

Saves cost on small/basic tasks by offloading inference to the user's hardware,
and doubles as a standalone device AI-benchmarking tool.

## How it works

```
User sends prompt
        |
        v
  Run local model
        |
        v
  Quality check (heuristic score)
   pass |        | fail
        v        v
  Return      Cloud fallback
  response    (switch to cloud API)
```

On init the capability prober inspects the browser and classifies the device
into one of three tiers:

| Tier | Condition | Example models |
|---|---|---|
| `none` | no WebGPU, low RAM | cloud only |
| `light` | WASM SIMD ok, modest RAM | Qwen2.5-0.5B, SmolLM2 |
| `standard` | WebGPU + decent RAM | Phi-3-mini, Llama-3.2-3B |

The prober checks WebGPU availability, `navigator.deviceMemory` /
`hardwareConcurrency`, WASM SIMD + threads, and the network connection (to
decide if downloading a model is reasonable). Every local response is scored
by a cheap heuristic (too short, too slow, repeated-token loops, refusal/garbage
patterns) before it's returned — a failure triggers cloud fallback for that call.

## Packages

| Package | Responsibility |
|---|---|
| `@hybrid-ai/core` | Capability prober, model registry, heuristic quality monitor, and `createRouter()` — the public orchestration API. Zero runtime deps. |
| `@hybrid-ai/adapter-webllm` | Local runtime via [WebLLM](https://github.com/mlc-ai/web-llm) (WebGPU path). Exposes `WebLLMAdapter`. |
| `@hybrid-ai/adapter-transformers` | Local runtime via [Transformers.js](https://github.com/huggingface/transformers.js) (WASM path). Exposes `HuggingFaceRuntime`. |
| `@hybrid-ai/adapter-cloud` | Cloud fallback with a `createCloudAdapter()` provider switch. |
| `@hybrid-ai/react` | React hook `useHybridAI()` wrapping the router. |

## Getting started

```bash
pnpm install
pnpm --recursive --if-present run build
```

Demo (Vite):

```bash
pnpm dev:demo
# open the http://localhost:5173 URL Vite prints
```

## Usage

### 1. Probe the device

```ts
import { probeDevice } from "@hybrid-ai/core";

const capabilities = await probeDevice();
console.log(capabilities.tier);        // "none" | "light" | "standard"
console.log(capabilities.webgpu);      // WebGPU adapter limits
console.log(capabilities.wasm);        // SIMD / threads support
console.log(capabilities.reasons);     // human-readable justification
```

`probeDevice(options?)` accepts `{ navigator?, crossOriginIsolated? }` for
testing. The registry exposes `REGISTRY`, `canRun(probe, model)`, and
`pickModel(probe)` if you want to pick models yourself.

### 2. Wire up the router

The router picks the most capable eligible model from the registry, loads it
through the matching adapter, generates a response, runs the quality check, and
falls back to the cloud client when needed.

```ts
import { createRouter } from "@hybrid-ai/core";
import { WebLLMAdapter } from "@hybrid-ai/adapter-webllm";
import { HuggingFaceRuntime } from "@hybrid-ai/adapter-transformers";
import { createCloudAdapter } from "@hybrid-ai/adapter-cloud";

const router = createRouter({
  adapters: {
    webgpu: new WebLLMAdapter(),        // used on the "standard" tier
    wasm: new HuggingFaceRuntime(),     // used on the "light" tier
  },
  cloud: createCloudAdapter({
    provider: "openai",
    apiKey: import.meta.env.VITE_OPENAI_KEY, // your key
    model: "gpt-4o-mini",
  }),
});

await router.init();

const result = await router.generate("Explain WebGPU in one sentence.");
console.log(result.source, result.text); // "local" | "cloud"
```

### 3. Cloud providers

`createCloudAdapter` supports four providers behind one `CloudRuntime` (
`{ generate(prompt): Promise<string> }`) interface:

```ts
import { createCloudAdapter } from "@hybrid-ai/adapter-cloud";

// OpenAI (or any OpenAI-compatible endpoint)
createCloudAdapter({ provider: "openai", apiKey: "sk-...", model: "gpt-4o-mini" });
createCloudAdapter({ provider: "custom", baseUrl: "https://gateway.example.com/v1", model: "qwen2.5" });

// Anthropic
createCloudAdapter({ provider: "anthropic", apiKey: "sk-ant-...", model: "claude-3-5-haiku-latest" });

// Google Gemini
createCloudAdapter({ provider: "gemini", apiKey: "AIza...", model: "gemini-2.0-flash" });
```

- `custom` reuses the OpenAI request shape against your own base URL.
- The `openai`/`custom` path uses the official `openai` SDK with
  `dangerouslyAllowBrowser: true`, so it works directly in the browser.
- **Security note:** putting an API key in the browser exposes it to anyone who
  inspects the page. Keep this to demos/prototyping, or proxy through your own
  server and use the `custom` provider.

### 4. React

```ts
import { useHybridAI } from "@hybrid-ai/react";
import { WebLLMAdapter } from "@hybrid-ai/adapter-webllm";
import { HuggingFaceRuntime } from "@hybrid-ai/adapter-transformers";
import { createCloudAdapter } from "@hybrid-ai/adapter-cloud";

const CONFIG = {
  adapters: { webgpu: new WebLLMAdapter(), wasm: new HuggingFaceRuntime() },
  cloud: createCloudAdapter({ provider: "openai", apiKey: "sk-...", model: "gpt-4o-mini" }),
};

function App() {
  const [prompt, setPrompt] = useState<string | null>(null);
  const { response, isLoading, source, error } = useHybridAI(prompt, CONFIG);

  return (
    <div>
      <button onClick={() => setPrompt("Tell me a one-line joke")}>Ask</button>
      {isLoading && <p>Thinking…</p>}
      {error && <p style={{ color: "red" }}>{error.message}</p>}
      {response && <p><em>({source})</em> {response}</p>}
    </div>
  );
}
```

The router is created and initialized once per mount; changing the `prompt`
re-runs `generate()` (stale responses are ignored). Pass `null` to idle.

### 5. Use adapters directly

Every adapter implements `LocalRuntime` ( `load(modelId, onProgress?)` +
`generate(prompt)` ), so you can use them standalone for benchmarking:

```ts
import { HuggingFaceRuntime } from "@hybrid-ai/adapter-transformers";

const runtime = new HuggingFaceRuntime();
await runtime.load("onnx-community/Qwen2.5-0.5B-Instruct", (pct, text) => {
  console.log(`${Math.round(pct * 100)}% ${text}`);
});
console.log(await runtime.generate("Hello!"));
```

## Development

```bash
pnpm build                 # build all packages
pnpm test                  # run all package tests (vitest)
pnpm --filter @hybrid-ai/adapter-cloud test   # test a single package
```

IDE hints for the demo: `examples/vanilla-demo/main.ts` imports the packages by
relative source path so it runs without a prior build.

## Repository layout

```
packages/
├── core/                 # prober, registry, quality monitor, orchestrator
├── adapter-webllm/       # WebGPU local runtime
├── adapter-transformers/ # WASM local runtime (Transformers.js)
├── adapter-cloud/        # createCloudAdapter() provider switch
└── react/                # useHybridAI() hook
examples/
└── vanilla-demo/         # Vite demo with live probe/adapter/cloud tests
```

## License

MIT (default assumption — not yet finalized).