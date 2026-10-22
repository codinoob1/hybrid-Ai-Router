#!/usr/bin/env node
import { createRequire } from "module";
import { pathToFileURL } from "url";
import { chromium } from "playwright";
import { readFile } from "fs/promises";
import { loadPrompts } from "./prompts.js";
import { renderTable, renderJson, renderBrowserHtml } from "./report.js";
import type { BenchConfig } from "./types.js";

const require = createRequire(import.meta.url);
const path = require("path");

function resolvePkgDist(pkgName: string): string {
  const pkgDir = path.dirname(require.resolve(`${pkgName}/package.json`));
  return path.join(pkgDir, "dist/index.js");
}

async function parseArgs(argv: string[]): Promise<{
  help?: boolean;
  modelIds: string[];
  prompts?: string;
  promptFile?: string;
  cloud?: boolean;
  output: "table" | "json" | "browser";
  headless: boolean;
}> {
  const opts: any = {
    modelIds: ["pick"],
    output: "table",
    headless: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--models" && next) {
      opts.modelIds = next.split(",").map((s) => s.trim()).filter(Boolean);
      i++;
    } else if (arg === "--prompts" && next) {
      opts.prompts = next;
      i++;
    } else if (arg === "--prompt-file" && next) {
      opts.promptFile = next;
      i++;
    } else if (arg === "--cloud") {
      opts.cloud = true;
    } else if (arg === "--output" && next) {
      opts.output = next as "table" | "json" | "browser";
      i++;
    } else if (arg === "--headless" && next !== undefined) {
      opts.headless = next !== "false";
      i++;
    }
  }
  return opts;
}

function buildCloudConfig(): {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
} | undefined {
  const provider = process.env.HYBRID_AI_CLOUD_PROVIDER;
  const apiKey = process.env.HYBRID_AI_CLOUD_API_KEY;
  if (!provider || !apiKey) return undefined;
  return {
    provider,
    apiKey,
    model: process.env.HYBRID_AI_CLOUD_MODEL || "gpt-4o-mini",
    baseUrl: process.env.HYBRID_AI_CLOUD_BASE_URL,
  };
}

async function main() {
  const opts = await parseArgs(process.argv);

  if (opts.help) {
    console.log(`
Usage: hybrid-ai-bench [options]

Standalone device AI-benchmarking CLI for hybrid-ai-router.
Runs local model inference in a real browser (via Playwright) and reports
load time, generation latency, words/sec, and quality pass/fail per model.

Options:
  --models <ids>       Comma-separated model IDs, or 'pick' (default), or 'all'
  --prompts <list>     Comma-separated prompts (overrides built-in defaults)
  --prompt-file <path> JSON file containing a prompt array
  --cloud              Enable cloud comparison (reads HYBRID_AI_CLOUD_* env vars)
  --output <format>    table (default) | json | browser
  --headless <bool>    Run browser headless (default: true)
  --help               Show this help

Env vars (for --cloud):
  HYBRID_AI_CLOUD_PROVIDER  openai | anthropic | gemini | custom
  HYBRID_AI_CLOUD_API_KEY   API key for the cloud provider
  HYBRID_AI_CLOUD_MODEL     Model name (default: gpt-4o-mini)
  HYBRID_AI_CLOUD_BASE_URL  Custom base URL for OpenAI-compatible endpoints
    `);
    return;
  }

  const prompts = await loadPrompts({ prompts: opts.prompts, promptFile: opts.promptFile });
  const cloudConfig = buildCloudConfig();

  const config: BenchConfig = {
    prompts,
    modelIds: opts.modelIds,
    cloud: cloudConfig
      ? {
          generate: async (prompt: string): Promise<string> => {
            // Placeholder — the real cloud adapter is built inside the browser page
            return prompt;
          },
        }
      : undefined,
    output: opts.output,
  };

  // Resolve dist file paths
  const distPaths = {
    core: resolvePkgDist("@hybrid-ai/core"),
    webllm: resolvePkgDist("@hybrid-ai/adapter-webllm"),
    transformers: resolvePkgDist("@hybrid-ai/adapter-transformers"),
    cloud: resolvePkgDist("@hybrid-ai/adapter-cloud"),
    bench: resolvePkgDist("@hybrid-ai/bench"),
  };

  // Read all dist file contents
  const distContents: Record<string, string> = {};
  for (const [key, filePath] of Object.entries(distPaths)) {
    distContents[key] = await readFile(filePath, "utf-8");
  }

  const browser = await chromium.launch({ headless: opts.headless });
  try {
    const page = await browser.newPage();

    // 1. Inject import map so bare specifiers resolve to local dist files
    const importMap = {
      imports: {
        "@hybrid-ai/core": pathToFileURL(distPaths.core).href,
        "@hybrid-ai/adapter-webllm": pathToFileURL(distPaths.webllm).href,
        "@hybrid-ai/adapter-transformers": pathToFileURL(distPaths.transformers).href,
        "@hybrid-ai/adapter-cloud": pathToFileURL(distPaths.cloud).href,
        "@hybrid-ai/bench": pathToFileURL(distPaths.bench).href,
      },
    };
    await page.addScriptTag({
      type: "importmap",
      content: JSON.stringify(importMap),
    });

    // 2. Load all dist files as ES modules
    for (const content of Object.values(distContents)) {
      await page.addScriptTag({ type: "module", content });
    }

    // 3. Set up window.__runBench that wires everything together
    await page.addScriptTag({
      type: "module",
      content: `
        import { runBenchmark } from "@hybrid-ai/bench";
        import { probeDevice, REGISTRY } from "@hybrid-ai/core";
        import { WebLLMAdapter } from "@hybrid-ai/adapter-webllm";
        import { HuggingFaceRuntime } from "@hybrid-ai/adapter-transformers";
        import { createCloudAdapter } from "@hybrid-ai/adapter-cloud";

        window.__runBench = async (params: any) => {
          const { benchConfig, cloudConfig } = params;
          const adapters: Record<string, any> = {};
          adapters.webgpu = new WebLLMAdapter();
          adapters.wasm = new HuggingFaceRuntime();
          if (cloudConfig) {
            benchConfig.cloud = createCloudAdapter({
              provider: cloudConfig.provider,
              apiKey: cloudConfig.apiKey,
              model: cloudConfig.model,
              baseUrl: cloudConfig.baseUrl,
            });
          }
          return runBenchmark(benchConfig, {
            probe: () => probeDevice(),
            registry: REGISTRY,
            adapters,
          });
        };
      `,
    });

    // 4. Run the benchmark in the page context
    const results = await page.evaluate(async (params: any) => {
      return await (window as any).__runBench(params);
    }, {
      benchConfig: config,
      cloudConfig,
    });

    // 5. Render output
    if (config.output === "json") {
      console.log(renderJson(results));
    } else if (config.output === "browser") {
      console.log(renderBrowserHtml(results));
    } else {
      console.log(renderTable(results));
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
