# hybrid-ai-router — project spec

Open source side project. Goal: a JS package that decides whether a small AI
model can run on the user's device, runs it there if possible, and falls back
to a cloud API if the device can't handle it or the local response quality is
too low.

## Goals

1. Reduce cost of running AI for small/basic tasks by offloading to the
   user's own device when feasible.
2. Provide a standalone device AI-benchmarking tool as a side effect (how
   capable is this device at running small models — useful data on its own).

## High-level flow

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
                  |
                  v
              Return response
```

The quality check for v1 should be dumb and cheap, not a real classifier:
- response too short / empty
- latency over a threshold (model thrashing)
- repeated-token loops
- regex match on obvious refusal/garbage output

That's enough to catch "this device clearly can't do it," which is most of
what matters for v1. A smarter scorer can come later.

## Capability detection (the prober)

Checks run once on init to decide a tier:

- `navigator.gpu` — WebGPU available? (needed for anything above the tiny tier)
- `navigator.deviceMemory` / `navigator.hardwareConcurrency` — rough RAM/CPU tier
- WASM SIMD + threads support — fallback path when no WebGPU
- `navigator.connection` — is downloading a 500MB–1GB model even reasonable
  right now, or should it skip straight to cloud

Map to 3 discrete tiers (not a continuous score):

| Tier | Condition | Example models |
|---|---|---|
| `none` | no WebGPU, low RAM | cloud only |
| `light` | WASM SIMD ok, modest RAM | Qwen2.5-0.5B, SmolLM2 |
| `standard` | WebGPU + decent RAM | Phi-3-mini, Llama-3.2-3B |

## Package architecture (module responsibilities)

```
npm package (single JS/TS module, no server required)
├── Capability prober   -> reads device specs
├── Model registry       -> maps tier to model
├── Local runtime adapter -> WebLLM / Transformers.js
├── Quality monitor       -> scores each response
└── Cloud fallback client -> calls hosted API
```

Pipeline order: prober → registry → local runtime → quality monitor →
(conditionally) cloud fallback client.

Don't build a custom inference engine. Wrap existing runtimes:
- **WebLLM** (`@mlc-ai/web-llm`) for the WebGPU path
- **Transformers.js** (`@huggingface/transformers`, ONNX-based) for the
  no-WebGPU fallback path

Both get wrapped behind one common adapter interface (`load()` / `generate()`)
so the orchestrator doesn't care which one is active.

## Repo layout

pnpm workspaces monorepo (no Nx/Turborepo — overkill for this size).

```
hybrid-ai-router/
├── package.json                 # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .changeset/                  # versioning across packages
├── examples/
│   └── vanilla-demo/
│       ├── index.html
│       └── main.ts
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── prober.ts        # capability detection
│   │   │   ├── registry.ts      # tier -> model mapping
│   │   │   ├── orchestrator.ts  # public API: createRouter()
│   │   │   ├── quality.ts       # heuristic scorer
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── test/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── adapter-webllm/
│   │   ├── src/index.ts         # implements LocalRuntime via WebLLM
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── adapter-transformers/
│   │   ├── src/index.ts         # implements LocalRuntime via Transformers.js
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── adapter-cloud/
│   │   ├── src/index.ts         # OpenAI-compatible fetch client, no SDK
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── react/
│   │   ├── src/useHybridAI.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── bench/                   # standalone device-benchmarking CLI (goal 2)
│       ├── src/
│       │   ├── cli.ts
│       │   └── report.ts
│       ├── package.json
│       └── tsconfig.json
│
└── README.md
```

## Package responsibilities and dependencies

- **`@hybrid-ai/core`** — zero runtime deps besides TypeScript. Defines the
  `LocalRuntime` / `CloudRuntime` interfaces and exposes
  `createRouter({ adapters, cloudConfig })`. Every other package imports from
  this one.
- **`@hybrid-ai/adapter-webllm`** — wraps `@mlc-ai/web-llm`. Used when
  `navigator.gpu` is present.
- **`@hybrid-ai/adapter-transformers`** — wraps `@huggingface/transformers`
  (Transformers.js v3). Used as the no-WebGPU fallback tier.
- **`@hybrid-ai/adapter-cloud`** — plain `fetch` against any
  OpenAI-compatible endpoint. Intentionally dependency-free.
- **`@hybrid-ai/react`** — depends on `core` + `react` as a peer dep. Exposes
  `useHybridAI(prompt)` → `{ response, tier, isLoading }`.
- **`@hybrid-ai/bench`** — depends on `core` + both local adapters. CLI
  (`npx hybrid-ai-bench`) that runs the prober + a few timed generations and
  prints a report. Versioned/published independently of the router — this is
  the piece people can use standalone without the routing logic.

## package.json — what it means, per field

Example (`packages/core/package.json`, the simplest one in the repo):

```json
{
  "name": "@hybrid-ai/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsup": "^8.0.0",
    "vitest": "^2.0.0"
  }
}
```

- `name` — how other packages import it (`@hybrid-ai/core`).
- `version` — semver, starts at `0.1.0`.
- `type: "module"` — ESM (`import`/`export`), not CommonJS `require`.
- `main` — file returned on `import`; points at *built* output, not source.
- `types` — same, for TS autocomplete.
- `scripts` — `pnpm build` / `pnpm test` shortcuts.
- `devDependencies` — tools needed to build the package, not shipped with it.
- `dependencies` (empty for `core`) — things the code actually imports at
  runtime, e.g. `adapter-webllm`'s package.json would have
  `"@mlc-ai/web-llm": "^0.2.0"` here.

Every other package.json in the repo is this same shape with a different
`name` and different `dependencies`. The root `package.json` holds shared dev
tooling (`typescript`, `@changesets/cli`, etc.) so it isn't repeated per
package.

## Root tooling

```json
{
  "devDependencies": {
    "typescript": "^5",
    "tsup": "^8",
    "vitest": "^2",
    "@changesets/cli": "^2",
    "eslint": "^9"
  }
}
```

- **tsup** — esbuild-based bundler, outputs ESM + `.d.ts` per package, no
  hand-written Rollup config.
- **vitest** — test runner.
- **changesets** — versioning across multiple packages in the monorepo when
  ready to publish.

## Open decisions (not yet settled)

- Exact prompt/response shape for `createRouter()`'s public API.
- Whether `quality.ts` heuristics are configurable per-app or fixed.
- Cloud fallback backend — bring-your-own endpoint, or ship a reference
  FastAPI proxy alongside the package.
- License (MIT is the default assumption for an open-source JS package but
  not yet chosen).
- PC and laptop Load bigger models ? 


## changes in the file structher :- 

├── adapter-cloud/
│   ├── src/
│   │   ├── index.ts          # createCloudAdapter() — public entry point, provider switch
│   │   ├── types.ts          # CloudProviderConfig discriminated union
│   │   └── providers/
│   │       ├── openai.ts     # OpenAI-compatible fetch client (also used by 'custom')
│   │       ├── anthropic.ts  # Anthropic Messages API client
│   │       └── gemini.ts     # Gemini generateContent client
│   ├── test/
│   │   ├── openai.test.ts
│   │   ├── anthropic.test.ts
│   │   └── gemini.test.ts
│   ├── package.json
│   └── tsconfig.jsons