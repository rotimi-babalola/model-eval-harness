import type { ModelConfig, ModelSummary, RunRecord } from "./types";

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function usd(value: number): string {
  return value < 0.01 ? `$${value.toFixed(6)}` : `$${value.toFixed(4)}`;
}

export function summarizeModel(model: ModelConfig, runs: RunRecord[]): ModelSummary {
  const completed = runs.filter((run) => run.completed).length;
  const correct = runs.filter((run) => run.correct).length;
  const latencies = runs.map((run) => run.latencyMs).sort((a, b) => a - b);
  const inputTokens = runs.reduce((sum, run) => sum + run.inputTokens, 0);
  const outputTokens = runs.reduce((sum, run) => sum + run.outputTokens, 0);
  const costUsd = runs.reduce((sum, run) => sum + run.costUsd, 0);

  return {
    modelId: model.id,
    label: model.label,
    tasks: runs.length,
    completed,
    correct,
    errors: runs.filter((run) => run.error).length,
    completionRate: runs.length ? completed / runs.length : 0,
    correctnessRate: runs.length ? correct / runs.length : 0,
    latency: {
      meanMs: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
    },
    inputTokens,
    outputTokens,
    costUsd,
    costPerSuccessfulTask: correct ? costUsd / correct : null,
    toolCalls: runs.reduce((sum, run) => sum + run.toolCalls, 0),
    toolFailures: runs.reduce((sum, run) => sum + run.toolFailures, 0),
    recoveryAttempts: runs.reduce((sum, run) => sum + run.recoveryAttempts, 0),
    recoveredRuns: runs.filter((run) => run.toolFailures > 0 && run.correct).length,
    runs,
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function table(rows: string[][]): string {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  return rows
    .map((row) =>
      row.map((cell, column) => (column === 0 ? cell.padEnd(widths[column]) : cell.padStart(widths[column]))).join("  "),
    )
    .join("\n");
}

export function formatSummary(summaries: ModelSummary[]): string {
  const rows: string[][] = [
    [
      "Model",
      "Tasks",
      "Done",
      "Correct",
      "Completion",
      "Correctness",
      "Mean ms",
      "P50 ms",
      "P95 ms",
      "In tok",
      "Out tok",
      "Cost",
      "$/success",
      "Tool fail",
      "Recoveries",
      "Recovered",
      "Errors",
    ],
    ...summaries.map((summary) => [
      summary.label,
      String(summary.tasks),
      String(summary.completed),
      String(summary.correct),
      pct(summary.completionRate),
      pct(summary.correctnessRate),
      summary.latency.meanMs.toFixed(0),
      summary.latency.p50Ms.toFixed(0),
      summary.latency.p95Ms.toFixed(0),
      String(summary.inputTokens),
      String(summary.outputTokens),
      usd(summary.costUsd),
      summary.costPerSuccessfulTask === null ? "n/a" : usd(summary.costPerSuccessfulTask),
      String(summary.toolFailures),
      String(summary.recoveryAttempts),
      String(summary.recoveredRuns),
      String(summary.errors),
    ]),
  ];
  return table(rows);
}

function csvCell(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(summaries: ModelSummary[]): string {
  const header = [
    "model",
    "task",
    "completed",
    "correct",
    "latency_ms",
    "input_tokens",
    "output_tokens",
    "cost_usd",
    "tool_calls",
    "tool_failures",
    "recovery_attempts",
    "steps",
    "error",
    "answer",
    "expected",
  ];
  const rows = summaries.flatMap((summary) =>
    summary.runs.map((run) =>
      [
        summary.label,
        run.taskId,
        run.completed,
        run.correct,
        run.latencyMs.toFixed(1),
        run.inputTokens,
        run.outputTokens,
        run.costUsd.toFixed(8),
        run.toolCalls,
        run.toolFailures,
        run.recoveryAttempts,
        run.steps,
        run.error,
        run.answer,
        run.expected,
      ]
        .map(csvCell)
        .join(","),
    ),
  );
  return [header.join(","), ...rows].join("\n") + "\n";
}
