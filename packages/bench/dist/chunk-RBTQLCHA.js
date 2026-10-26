// src/prompts.ts
import { readFile } from "fs/promises";

// defaults/prompts.json
var prompts_default = [
  "What is the capital of France?",
  "Explain how a VPN works in two sentences.",
  "Write a three-sentence story about a robot learning to paint.",
  "List three health benefits of walking daily.",
  "Translate 'Hello, how are you?' into Spanish.",
  "Hello, respoding with hello back"
];

// src/prompts.ts
var DEFAULT_PROMPTS = prompts_default;
async function loadPrompts(options) {
  if (options.promptFile) {
    const content = await readFile(options.promptFile, "utf-8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed) || !parsed.every((p) => typeof p === "string")) {
      throw new Error(`Invalid prompt file: "${options.promptFile}" must contain a JSON array of strings.`);
    }
    if (parsed.length === 0) {
      throw new Error(`Prompt file "${options.promptFile}" is empty.`);
    }
    return parsed;
  }
  if (options.prompts) {
    const prompts = options.prompts.split(",").map((p) => p.trim()).filter(Boolean);
    if (prompts.length === 0) {
      throw new Error("No prompts provided after parsing --prompts.");
    }
    return prompts;
  }
  return [...DEFAULT_PROMPTS];
}

// src/report.ts
var BAR = "\u2500";
var CROSS = "\u253C";
var TOP = "\u252C";
var LEFT = "\u251C";
var RIGHT = "\u2524";
var TL = "\u250C";
var TR = "\u2510";
var BL = "\u2514";
var BR = "\u2518";
var VERT = "\u2502";
function padRight(text, len) {
  return text + " ".repeat(Math.max(0, len - text.length));
}
function renderTable(result) {
  const lines = [];
  lines.push(
    `Device: ${result.tier} | WebGPU: ${result.webgpu ? "yes" : "no"} | WASM: ${result.wasm ? "yes" : "no"} | RAM: ${result.deviceMemoryGiB ?? "?"} GiB | CPU: ${result.cpuCores ?? "?"} cores | Connection: ${result.connection}`,
    ""
  );
  if (result.models.length === 0) {
    lines.push("No models were benchmarked.");
    return lines.join("\n");
  }
  const cols = [
    { key: "modelId", header: "Model", width: 14 },
    { key: "runtime", header: "Runtime", width: 8 },
    { key: "eligible", header: "Eligible", width: 10 },
    { key: "load", header: "Load (ms)", width: 10 },
    { key: "latency", header: "Avg Lat (ms)", width: 12 },
    { key: "wps", header: "Words/sec", width: 11 },
    { key: "pass", header: "Pass %", width: 8 },
    { key: "fails", header: "Fail reasons", width: 24 }
  ];
  const row = (vals) => VERT + vals.map((v, i) => ` ${padRight(v, cols[i].width)} `).join(VERT) + VERT;
  const header = row(cols.map((c) => c.header));
  const headerSep = cols.map((c) => BAR.repeat(c.width + 2)).join(CROSS);
  lines.push(TL + headerSep.replace(/\│/g, TOP).replace(/─/g, BAR) + TR);
  const sepLine = cols.map((c) => BAR.repeat(c.width + 2)).join(CROSS);
  lines.push(TL + sepLine.replace(/\│/g, "") + TR);
  lines.splice(-2, 2);
  lines.push(TL + sepLine + TR);
  lines.push(header);
  lines.push(LEFT + sepLine.replace(/\│/g, "") + RIGHT);
  for (const model of result.models) {
    const vals = [
      model.modelId,
      model.runtime,
      model.eligible ? "yes" : model.skipReason ? "no" : "?",
      model.loadTimeMs !== void 0 ? model.loadTimeMs.toFixed(0) : model.skipReason ? "skipped" : "\u2014",
      model.avgLatencyMs.toFixed(0),
      model.avgWordsPerSec.toFixed(2),
      (model.passRate * 100).toFixed(0) + "%",
      model.failReasons.length > 0 ? model.failReasons.join("; ") : "\u2014"
    ];
    lines.push(row(vals));
  }
  lines.push(BL + sepLine + BR);
  lines.push("");
  const firstModel = result.models.find((m) => m.eligible && m.prompts.length > 0);
  if (firstModel && firstModel.prompts.some((p) => p.cloudLatencyMs !== void 0)) {
    lines.push("Cloud comparison (local vs cloud):");
    lines.push(LEFT + BAR.repeat(60) + RIGHT);
    for (const pr of firstModel.prompts) {
      if (pr.cloudLatencyMs !== void 0) {
        lines.push(
          `  "${pr.prompt.slice(0, 40)}..."
    local: ${pr.latencyMs.toFixed(0)}ms / ${pr.wordsPerSec.toFixed(2)} wps | cloud: ${pr.cloudLatencyMs.toFixed(0)}ms / ${pr.cloudWordsPerSec.toFixed(2)} wps`
        );
      }
    }
    lines.push(BL + BAR.repeat(60) + BR);
    lines.push("");
  }
  return lines.join("\n");
}
function renderJson(result) {
  return JSON.stringify(result, null, 2);
}
function renderBrowserHtml(result) {
  const rows = result.models.map(
    (m) => `
    <tr>
      <td>${escapeHtml(m.modelId)}</td>
      <td>${m.runtime}</td>
      <td>${m.eligible ? "yes" : "no"}</td>
      <td>${m.loadTimeMs !== void 0 ? m.loadTimeMs.toFixed(0) : m.skipReason ?? "\u2014"}</td>
      <td>${m.avgLatencyMs.toFixed(0)}</td>
      <td>${m.avgWordsPerSec.toFixed(2)}</td>
      <td>${(m.passRate * 100).toFixed(0)}%</td>
      <td>${m.failReasons.map(escapeHtml).join(", ") || "\u2014"}</td>
    </tr>
  `
  ).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>hybrid-ai-bench results</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; padding: 2rem; background: #f5f5f5; }
  h1 { margin-top: 0; }
  .card { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 1rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { border: 1px solid #ddd; padding: 0.75rem; text-align: left; }
  th { background: #eee; }
  .eligible-yes { color: #16a34a; font-weight: 600; }
  .eligible-no { color: #dc2626; font-weight: 600; }
  .badge-pass { background: #dcfce7; color: #166534; padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.875rem; }
  .badge-fail { background: #fee2e2; color: #991b1b; padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.875rem; }
</style>
</head>
<body>
  <h1>\u{1F680} hybrid-ai-bench \u2014 Device Results</h1>
  <div class="card">
    <h2>Device</h2>
    <p><strong>Tier:</strong> ${escapeHtml(result.tier)}</p>
    <p><strong>WebGPU:</strong> ${result.webgpu ? "yes" : "no"} | <strong>WASM:</strong> ${result.wasm ? "yes" : "no"}</p>
    <p><strong>RAM:</strong> ${result.deviceMemoryGiB ?? "unknown"} GiB | <strong>CPU:</strong> ${result.cpuCores ?? "unknown"} cores</p>
    <p><strong>Connection:</strong> ${escapeHtml(result.connection)}</p>
  </div>
  <div class="card">
    <h2>Models</h2>
    <table>
      <thead>
        <tr>
          <th>Model</th><th>Runtime</th><th>Eligible</th><th>Load (ms)</th><th>Avg Lat (ms)</th><th>Words/sec</th><th>Pass %</th><th>Fail reasons</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export {
  DEFAULT_PROMPTS,
  loadPrompts,
  renderTable,
  renderJson,
  renderBrowserHtml
};
