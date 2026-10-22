import type { DeviceBenchResult } from "./types.js";

const BAR = "─";
const CROSS = "┼";
const TOP = "┬";
const BOTTOM = "┴";
const LEFT = "├";
const RIGHT = "┤";
const TL = "┌";
const TR = "┐";
const BL = "└";
const BR = "┘";
const VERT = "│";

function padRight(text: string, len: number): string {
  return text + " ".repeat(Math.max(0, len - text.length));
}
function padLeft(text: string, len: number): string {
  return " ".repeat(Math.max(0, len - text.length)) + text;
}

/**
 * Render a human-readable CLI table from a DeviceBenchResult.
 */
function renderTable(result: DeviceBenchResult): string {
  const lines: string[] = [];

  // Device summary
  lines.push(
    `Device: ${result.tier} | WebGPU: ${result.webgpu ? "yes" : "no"} | WASM: ${result.wasm ? "yes" : "no"} | ` +
    `RAM: ${result.deviceMemoryGiB ?? "?"} GiB | CPU: ${result.cpuCores ?? "?"} cores | Connection: ${result.connection}`,
    "",
  );

  if (result.models.length === 0) {
    lines.push("No models were benchmarked.");
    return lines.join("\n");
  }

  // Column widths
  const cols = [
    { key: "modelId", header: "Model", width: 14 },
    { key: "runtime", header: "Runtime", width: 8 },
    { key: "eligible", header: "Eligible", width: 10 },
    { key: "load", header: "Load (ms)", width: 10 },
    { key: "latency", header: "Avg Lat (ms)", width: 12 },
    { key: "wps", header: "Words/sec", width: 11 },
    { key: "pass", header: "Pass %", width: 8 },
    { key: "fails", header: "Fail reasons", width: 24 },
  ];

  const row = (vals: string[]): string => VERT + vals.map((v, i) => ` ${padRight(v, cols[i].width)} `).join(VERT) + VERT;

  const header = row(cols.map((c) => c.header));
  const headerSep = cols.map((c) => BAR.repeat(c.width + 2)).join(CROSS);

  lines.push(TL + headerSep.replace(/\│/g, TOP).replace(/─/g, BAR) + TR);
  // Actually let's build the separator properly
  const sepLine = cols.map((c) => BAR.repeat(c.width + 2)).join(CROSS);
  lines.push(TL + sepLine.replace(/\│/g, "") + TR);
  // redo: simple approach
  lines.splice(-2, 2);
  lines.push(TL + sepLine + TR);
  lines.push(header);
  lines.push(LEFT + sepLine.replace(/\│/g, "") + RIGHT);

  for (const model of result.models) {
    const vals = [
      model.modelId,
      model.runtime,
      model.eligible ? "yes" : model.skipReason ? "no" : "?",
      model.loadTimeMs !== undefined ? model.loadTimeMs.toFixed(0) : model.skipReason ? "skipped" : "—",
      model.avgLatencyMs.toFixed(0),
      model.avgWordsPerSec.toFixed(2),
      (model.passRate * 100).toFixed(0) + "%",
      model.failReasons.length > 0 ? model.failReasons.join("; ") : "—",
    ];
    lines.push(row(vals));
  }

  lines.push(BL + sepLine + BR);
  lines.push("");

  // Per-prompt detail (first model only, if cloud comparison)
  const firstModel = result.models.find((m) => m.eligible && m.prompts.length > 0);
  if (firstModel && firstModel.prompts.some((p) => p.cloudLatencyMs !== undefined)) {
    lines.push("Cloud comparison (local vs cloud):");
    lines.push(LEFT + BAR.repeat(60) + RIGHT);
    for (const pr of firstModel.prompts) {
      if (pr.cloudLatencyMs !== undefined) {
        lines.push(
          `  "${pr.prompt.slice(0, 40)}..."` +
          `\n    local: ${pr.latencyMs.toFixed(0)}ms / ${pr.wordsPerSec.toFixed(2)} wps | ` +
          `cloud: ${pr.cloudLatencyMs.toFixed(0)}ms / ${pr.cloudWordsPerSec!.toFixed(2)} wps`,
        );
      }
    }
    lines.push(BL + BAR.repeat(60) + BR);
    lines.push("");
  }

  return lines.join("\n");
}

function BARD(width: number, _col: { width: number }, _v: string): string {
  return BAR.repeat(width + 2);
}

/**
 * Render JSON output.
 */
function renderJson(result: DeviceBenchResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Render a simple HTML page for in-browser viewing.
 */
function renderBrowserHtml(result: DeviceBenchResult): string {
  const rows = result.models
    .map(
      (m) => `
    <tr>
      <td>${escapeHtml(m.modelId)}</td>
      <td>${m.runtime}</td>
      <td>${m.eligible ? "yes" : "no"}</td>
      <td>${m.loadTimeMs !== undefined ? m.loadTimeMs.toFixed(0) : m.skipReason ?? "—"}</td>
      <td>${m.avgLatencyMs.toFixed(0)}</td>
      <td>${m.avgWordsPerSec.toFixed(2)}</td>
      <td>${(m.passRate * 100).toFixed(0)}%</td>
      <td>${m.failReasons.map(escapeHtml).join(", ") || "—"}</td>
    </tr>
  `,
    )
    .join("");

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
  <h1>🚀 hybrid-ai-bench — Device Results</h1>
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export { renderTable, renderJson, renderBrowserHtml };
