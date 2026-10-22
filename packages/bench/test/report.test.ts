import { describe, expect, it } from "vitest";
import { renderTable, renderJson, renderBrowserHtml } from "../src/report.js";
import type { DeviceBenchResult } from "../src/types.js";

function makeResult(overrides: Partial<DeviceBenchResult> = {}): DeviceBenchResult {
  return {
    tier: "standard",
    webgpu: true,
    wasm: true,
    deviceMemoryGiB: 16,
    cpuCores: 8,
    connection: "4g",
    models: [
      {
        modelId: "phi3-mini",
        runtime: "webgpu",
        eligible: true,
        loadTimeMs: 3420,
        prompts: [
          {
            prompt: "What is the capital of France?",
            latencyMs: 450,
            wordsPerSec: 12.4,
            quality: 1,
            pass: true,
          },
          {
            prompt: "Explain VPN",
            latencyMs: 520,
            wordsPerSec: 10.1,
            quality: 1,
            pass: true,
            reason: undefined,
          },
        ],
        avgLatencyMs: 485,
        avgWordsPerSec: 11.25,
        passRate: 1,
        failReasons: [],
      },
      {
        modelId: "qwen2.5-0.5b",
        runtime: "wasm",
        eligible: false,
        skipReason: "Device does not meet model requirements.",
        prompts: [],
        avgLatencyMs: 0,
        avgWordsPerSec: 0,
        passRate: 0,
        failReasons: [],
      },
    ],
    ...overrides,
  };
}

describe("renderTable", () => {
  it("renders a table with device summary and model rows", () => {
    const result = makeResult();
    const output = renderTable(result);
    expect(output).toContain("Device:");
    expect(output).toContain("phi3-mini");
    expect(output).toContain("qwen2.5-0.5b");
    expect(output).toContain("485");
    expect(output).toContain("11.25");
    expect(output).toContain("100%");
  });

  it("renders skipped models with skip reason", () => {
    const result = makeResult();
    const output = renderTable(result);
    expect(output).toContain("skipped");
  });

  it("handles empty models array", () => {
    const result = makeResult({ models: [] });
    const output = renderTable(result);
    expect(output).toContain("No models were benchmarked");
  });

  it("includes cloud comparison when present", () => {
    const result = makeResult({
      models: [
        {
          ...makeResult().models[0],
          prompts: [
            {
              prompt: "Test",
              latencyMs: 100,
              wordsPerSec: 5.0,
              quality: 1,
              pass: true,
              cloudLatencyMs: 200,
              cloudWordsPerSec: 8.0,
            },
          ],
        },
      ],
    });
    const output = renderTable(result);
    expect(output).toContain("Cloud comparison");
  });
});

describe("renderJson", () => {
  it("produces valid JSON matching the result shape", () => {
    const result = makeResult();
    const output = renderJson(result);
    const parsed = JSON.parse(output);
    expect(parsed.tier).toBe("standard");
    expect(parsed.models.length).toBe(2);
  });
});

describe("renderBrowserHtml", () => {
  it("produces HTML with model data", () => {
    const result = makeResult();
    const output = renderBrowserHtml(result);
    expect(output).toContain("<html");
    expect(output).toContain("phi3-mini");
    expect(output).toContain("qwen2.5-0.5b");
    expect(output).toContain("hybrid-ai-bench");
  });

  it("escapes HTML in model IDs", () => {
    const result = makeResult({
      models: [
        {
          ...makeResult().models[0],
          modelId: "<script>alert('xss')</script>",
        },
      ],
    });
    const output = renderBrowserHtml(result);
    expect(output).not.toContain("<script>");
    expect(output).toContain("&lt;script&gt;");
  });
});
