# hybrid-ai-router — test & release-readiness checklist

Status as of this doc: Anthropic and OpenAI cloud adapters confirmed working
end-to-end (real keys, real responses). Everything below is what's still
needed before publishing to npm. Each item has a concrete pass/fail
condition so it can be worked off directly, one at a time.

## 1. Automated unit tests — per package

### `packages/adapter-cloud`

- [ ] `test/openai.test.ts` exists and covers: happy path (correct request
      shape + response parsing), custom `baseUrl` respected, non-ok response
      throws with status code, empty/malformed response returns `''` instead
      of throwing.
- [ ] `test/anthropic.test.ts` exists and covers the same four cases, **plus**
      a dedicated test asserting the request includes
      `"anthropic-dangerous-direct-browser-access": "true"` in headers. This
      is the exact regression that shipped once already — this test is what
      would have caught it before a browser did.
- [ ] `test/gemini.test.ts` — same four base cases (URL includes `?key=`
      correctly, response parsed from `candidates[0].content.parts[0].text`).
- [ ] `test/index.test.ts` — dispatcher routing: each `provider` value calls
      the matching provider function and no other; `'custom'` routes through
      the OpenAI-shaped client specifically (this is a design decision, not
      an accident — test it so it can't silently change).
- [ ] Run `pnpm --filter @hybrid-ai/adapter-cloud test` — all green.

### `packages/core`

- [ ] `prober.ts` — unit tests with mocked `navigator.gpu`, `navigator
      .deviceMemory`, `navigator.hardwareConcurrency`, `navigator.connection`:
      confirm tier output (`none`/`light`/`standard`) for at least: (a) full
      WebGPU + high RAM → `standard`, (b) no `navigator.gpu` → falls to wasm
      probe, (c) `requestAdapter()` resolves but `isFallbackAdapter: true` →
      treated as no-GPU, not `standard`, (d) `requestAdapter()` throws →
      caught, falls to wasm probe (doesn't crash the whole probe).
- [ ] `registry.ts` — `pickModel()` unit tests: device that fails every
      model's `minTier` → returns `null`; `connection.saveData: true` →
      returns `null` even if compute tier would otherwise pass; device that
      qualifies for multiple models → returns the largest by
      `downloadSizeMB`, not just the first match.
- [ ] `quality.ts` — `scoreResponse()` unit tests for each heuristic
      independently: too-short response fails, latency over threshold fails,
      repeated-token loop fails, refusal-pattern match fails, a normal
      response passes with no `reason`.
- [ ] `orchestrator.ts` — `createRouter()` integration test with fake
      adapters: `pickModel` returning `null` → `generate()` goes straight to
      cloud without ever calling a local adapter's `load()`; local `generate`
      returns a low-quality response → falls back to cloud for that call;
      local `generate` returns a good response → cloud is never called.
- [ ] Run `pnpm --filter @hybrid-ai/core test` — all green.

### `packages/adapter-webllm` / `packages/adapter-transformers`

- [ ] At minimum: confirm `load()` rejects/throws meaningfully if called
      with an invalid model ID (don't need full mocked generation tests here
      — these mostly wrap a third-party engine — but a completely silent
      failure on bad input is worth catching).
- [ ] Confirm `generate()` throws a clear error if called before `load()`
      resolves (both adapters currently have this guard — verify it's
      actually tested, not just present in the code).

### `packages/react`

- [ ] `useHybridAI` test with `@testing-library/react`: prompt changing
      quickly cancels the stale in-flight `generate()` call rather than
      letting it overwrite newer state (the `cancelled` flag logic) — this
      is the one subtle bug in that hook worth locking down with a test.

## 2. Manual / real-device verification (not automatable, do once each)

- [ ] **Weak/old device, no real GPU.** Run the demo on the oldest phone or
      lowest-RAM laptop available. Confirm: `prober.ts` reports `fallbackAdapter:
      true` or `wasm`-only correctly, `registry.ts` picks the light model
      (not standard), `adapter-transformers` actually loads and generates a
      response — not just theoretically, watch it produce real text.
      **This path has never been run on real hardware — it's the
      highest-priority item on this whole list.**
- [ ] **Safari.** Run the demo once in Safari (macOS or iOS). Confirm the
      probe doesn't throw, and it correctly detects whatever WebGPU/WASM
      support that specific Safari version actually has.
- [ ] **Firefox.** Same check — Firefox on Android specifically doesn't have
      WebGPU yet as of writing, so this should exercise the WASM fallback
      path for real on a second engine, not just Chrome.
- [ ] **Throttled/bad connection.** Chrome DevTools → Network → "Slow 3G" or
      similar, confirm `connection.modelDownloadRecommended: false` /
      `saveData` gating actually stops a large model download rather than
      just hanging.

## 3. Release-engineering checklist (separate from tests — packaging only)

- [ ] `LICENSE` file at repo root (MIT, assuming that's still the choice).
- [ ] Every package's `package.json` has: `description`, `license`,
      `repository` (with `directory` pointing at that package's subfolder),
      `keywords`, `"files": ["dist"]`, `"publishConfig": { "access":
      "public" }`.
- [ ] npm scope decided and confirmed available (`npm whoami`, and either an
      npm org created for `@hybrid-ai` or fallback to a personal scope).
- [ ] `pnpm publish --dry-run` run on **every** package — manually read the
      file list output, confirm no `src/`, `.env`, test fixtures, or
      anything containing a real key is included. This is the one check
      that's actually about safety, not correctness — don't skip it.
- [ ] README has the BYOK security-tradeoff paragraph written (raw
      client-side keys are readable in DevTools/network tab; the `'custom'`
      provider + your own backend proxy is the production-safe path) —
      this was agreed on earlier and hasn't been written yet.
- [ ] `pnpm changeset` → `pnpm changeset version` → `pnpm -r build` →
      `pnpm changeset publish`, in that order.

## Priority order if doing this incrementally

1. Weak-device manual test (§2) — highest-value unknown, nothing else on
   this list tells you if the core pitch of the project actually works.
2. Anthropic header regression test (§1) — cheap, and it's the one bug that
   already happened once for real.
3. Rest of §1 automated tests.
4. Safari/Firefox/throttled-connection checks (§2).
5. §3 release engineering — do this last, right before the actual publish.