import type { EvalReport, ModelSummary, RunRecord } from "./types";

const COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed"];

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function truncate(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function ms(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value.toFixed(0)} ms`;
}

function usd(value: number): string {
  return value < 0.01 ? `$${value.toFixed(6)}` : `$${value.toFixed(4)}`;
}

function count(value: number): string {
  return value.toLocaleString("en-US");
}

function color(index: number): string {
  return COLORS[index % COLORS.length];
}

function bar(value: number, max: number, fill: string): string {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return `<div class="bar"><span style="width:${width.toFixed(1)}%;background:${fill}"></span></div>`;
}

function metricSection(models: ModelSummary[]): string {
  const metrics: Array<{
    label: string;
    hint: string;
    values: number[];
    max: number;
    format: (value: number, index: number) => string;
  }> = [
    { label: "Correctness", hint: "higher is better", values: models.map((m) => m.correctnessRate), max: 1, format: pct },
    { label: "Completion", hint: "higher is better", values: models.map((m) => m.completionRate), max: 1, format: pct },
    { label: "Mean latency", hint: "lower is better", values: models.map((m) => m.latency.meanMs), max: Math.max(...models.map((m) => m.latency.meanMs)), format: ms },
    {
      label: "Cost per successful task",
      hint: "total spend ÷ correct tasks",
      values: models.map((m) => m.costPerSuccessfulTask ?? 0),
      max: Math.max(...models.map((m) => m.costPerSuccessfulTask ?? 0)),
      format: (value, index) => (models[index].costPerSuccessfulTask === null ? "n/a" : usd(value)),
    },
    { label: "Input tokens", hint: "total", values: models.map((m) => m.inputTokens), max: Math.max(...models.map((m) => m.inputTokens)), format: count },
    { label: "Output tokens", hint: "total", values: models.map((m) => m.outputTokens), max: Math.max(...models.map((m) => m.outputTokens)), format: count },
    { label: "Tool failures", hint: "lower is better", values: models.map((m) => m.toolFailures), max: Math.max(...models.map((m) => m.toolFailures)), format: count },
    { label: "Recovery attempts", hint: "tool calls after a failure", values: models.map((m) => m.recoveryAttempts), max: Math.max(...models.map((m) => m.recoveryAttempts)), format: count },
  ];

  return metrics
    .map(
      (metric) => `<div class="metric">
        <div class="metric-head"><span>${escapeHtml(metric.label)}</span><span class="hint">${escapeHtml(metric.hint)}</span></div>
        ${models
          .map(
            (model, index) => `<div class="metric-row">
              <span class="metric-model" style="color:${color(index)}">${escapeHtml(model.label)}</span>
              ${bar(metric.values[index], metric.max, color(index))}
              <span class="metric-value">${escapeHtml(metric.format(metric.values[index], index))}</span>
            </div>`,
          )
          .join("")}
      </div>`,
    )
    .join("");
}

function modelCard(model: ModelSummary, index: number): string {
  return `<article class="card">
    <div class="card-head">
      <span class="swatch" style="background:${color(index)}"></span>
      <div>
        <h2>${escapeHtml(model.label)}</h2>
        <p class="mono">${escapeHtml(model.modelId)} · ${escapeHtml(model.protocol)}${model.reasoningEffort ? ` · effort ${escapeHtml(model.reasoningEffort)}` : ""}</p>
      </div>
    </div>
    <div class="score"><strong>${pct(model.correctnessRate)}</strong><span>${model.correct} of ${model.tasks} correct</span></div>
    <dl>
      <div><dt>Completion</dt><dd>${pct(model.completionRate)}</dd></div>
      <div><dt>Mean latency</dt><dd>${ms(model.latency.meanMs)}</dd></div>
      <div><dt>Cost</dt><dd>${usd(model.costUsd)}</dd></div>
      <div><dt>Cost / success</dt><dd>${model.costPerSuccessfulTask === null ? "n/a" : usd(model.costPerSuccessfulTask)}</dd></div>
    </dl>
    <p class="card-note">${model.toolFailures} tool failures · ${model.recoveryAttempts} recovery attempts · ${model.recoveredRuns} recovered</p>
  </article>`;
}

function runCell(run: RunRecord | undefined): string {
  if (!run) return `<td class="empty">not run</td>`;

  const status = run.correct ? ["PASS", "good"] : run.completed ? ["WRONG", "warn"] : ["FAIL", "bad"];
  const detail = run.error ? truncate(run.error, 110) : truncate(run.answer || "(no answer)", 110);

  return `<td>
    <div class="run">
      <span class="badge ${status[1]}">${status[0]}</span>
      <code title="${escapeHtml(run.error ?? run.answer)}">${escapeHtml(detail)}</code>
    </div>
    <div class="run-meta">${ms(run.latencyMs)} · ${count(run.inputTokens)} in / ${count(run.outputTokens)} out · ${usd(run.costUsd)} · ${run.toolFailures} fail · ${run.recoveryAttempts} retry</div>
  </td>`;
}

function taskTable(report: EvalReport): string {
  const header = `<tr><th scope="col">Task</th><th scope="col">Expected</th>${report.models
    .map((model, index) => `<th scope="col"><span class="swatch small" style="background:${color(index)}"></span>${escapeHtml(model.label)}</th>`)
    .join("")}</tr>`;

  const rows = report.tasks
    .map((task) => {
      const cells = report.models
        .map((model) => runCell(model.runs.find((run) => run.taskId === task.id)))
        .join("");
      return `<tr><td><strong>${escapeHtml(task.id)}</strong></td><td><code>${escapeHtml(task.expected)}</code></td>${cells}</tr>`;
    })
    .join("");

  return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${rows}</tbody></table></div>`;
}

export function renderHtml(report: EvalReport): string {
  const title = `Model eval: ${report.models.map((model) => model.label).join(" vs ")}`;
  const generated = new Date(report.generatedAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg: #f5f6f8;
    --panel: #ffffff;
    --text: #111827;
    --muted: #6b7280;
    --border: #e5e7eb;
    --good: #047857;
    --good-bg: #d1fae5;
    --warn: #b45309;
    --warn-bg: #fef3c7;
    --bad: #b91c1c;
    --bad-bg: #fee2e2;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f172a;
      --panel: #111827;
      --text: #e5e7eb;
      --muted: #9ca3af;
      --border: #273449;
      --good: #6ee7b7;
      --good-bg: #064e3b;
      --warn: #fcd34d;
      --warn-bg: #78350f;
      --bad: #fca5a5;
      --bad-bg: #7f1d1d;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  main { max-width: 1180px; margin: 0 auto; padding: 40px 24px 64px; }
  header h1 { margin: 0 0 4px; font-size: 28px; letter-spacing: -0.02em; }
  .meta { margin: 0; color: var(--muted); font-size: 14px; }
  h2 { margin: 0 0 2px; font-size: 18px; }
  section { margin-top: 32px; }
  section > h2 { margin-bottom: 12px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 24px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .card-head { display: flex; gap: 10px; align-items: flex-start; }
  .swatch { width: 12px; height: 12px; border-radius: 3px; margin-top: 6px; flex: none; }
  .swatch.small { display: inline-block; width: 8px; height: 8px; margin: 0 6px 1px 0; }
  .mono { margin: 0; color: var(--muted); font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
  .score { display: flex; align-items: baseline; gap: 10px; margin: 18px 0 14px; }
  .score strong { font-size: 34px; line-height: 1; letter-spacing: -0.03em; }
  .score span { color: var(--muted); font-size: 13px; }
  dl { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; margin: 0; }
  dl div { border-top: 1px solid var(--border); padding-top: 8px; }
  dt { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  dd { margin: 1px 0 0; font-weight: 600; font-variant-numeric: tabular-nums; }
  .card-note { margin: 16px 0 0; color: var(--muted); font-size: 12px; }
  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 22px 36px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 22px; }
  .metric-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 4px; font-size: 13px; font-weight: 600; }
  .hint { color: var(--muted); font-size: 11px; font-weight: 400; }
  .metric-row { display: flex; align-items: center; gap: 10px; margin: 7px 0; }
  .metric-model { width: 130px; flex: none; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar { flex: 1; height: 8px; border-radius: 999px; background: var(--border); overflow: hidden; }
  .bar span { display: block; height: 100%; border-radius: 999px; }
  .metric-value { width: 88px; flex: none; text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; }
  .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 11px 14px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
  th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; background: var(--panel); }
  tbody tr:last-child td { border-bottom: 0; }
  td.empty { color: var(--muted); font-style: italic; }
  code { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
  .run { display: flex; gap: 6px; align-items: flex-start; }
  .badge { flex: none; font-size: 10px; font-weight: 700; letter-spacing: 0.03em; padding: 2px 6px; border-radius: 4px; }
  .good { color: var(--good); background: var(--good-bg); }
  .warn { color: var(--warn); background: var(--warn-bg); }
  .bad { color: var(--bad); background: var(--bad-bg); }
  .run-meta { margin-top: 4px; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  footer { margin-top: 40px; color: var(--muted); font-size: 12px; }
</style>
</head>
<body>
<main>
  <header>
    <h1>Model evaluation</h1>
    <p class="meta">${escapeHtml(generated)} · ${report.tasks.length} tasks · max ${report.maxSteps} steps</p>
  </header>

  <section class="cards">
    ${report.models.map((model, index) => modelCard(model, index)).join("")}
  </section>

  <section>
    <h2>Metric comparison</h2>
    <div class="metrics">${metricSection(report.models)}</div>
  </section>

  <section>
    <h2>Per-task results</h2>
    ${taskTable(report)}
  </section>

  <footer>Generated by model-eval-harness. Cost figures use the prices configured for each model.</footer>
</main>
</body>
</html>
`;
}
