import assert from "node:assert/strict";
import test from "node:test";
import { renderHtml } from "../src/html";
import type { EvalReport, ModelSummary, RunRecord } from "../src/types";

const run: RunRecord = {
  taskId: "calc",
  modelId: "m1",
  modelLabel: "Model <One>",
  completed: true,
  correct: false,
  latencyMs: 1200,
  inputTokens: 100,
  outputTokens: 20,
  costUsd: 0.001,
  toolCalls: 1,
  toolFailures: 1,
  recoveryAttempts: 1,
  steps: 2,
  answer: '<script>alert("x")</script>',
  expected: "2",
};

const summary: ModelSummary = {
  modelId: "m1",
  label: "Model <One>",
  protocol: "openai",
  tasks: 1,
  completed: 1,
  correct: 0,
  errors: 0,
  completionRate: 1,
  correctnessRate: 0,
  latency: { meanMs: 1200, p50Ms: 1200, p95Ms: 1200 },
  inputTokens: 100,
  outputTokens: 20,
  costUsd: 0.001,
  costPerSuccessfulTask: null,
  toolCalls: 1,
  toolFailures: 1,
  recoveryAttempts: 1,
  recoveredRuns: 0,
  runs: [run],
};

const report: EvalReport = {
  generatedAt: "2026-11-09T12:00:00.000Z",
  maxSteps: 8,
  tasks: [{ id: "calc", prompt: "go", tools: ["calculator"], expected: "2" }],
  models: [summary],
};

test("renders an HTML report", () => {
  const html = renderHtml(report);

  assert.match(html, /<!doctype html>/);
  assert.match(html, /Model &lt;One&gt;/);
  assert.match(html, /calc/);
  assert.match(html, /n\/a/);
  assert.match(html, /1\.20 s/);
});

test("escapes model answers in the HTML report", () => {
  const html = renderHtml(report);

  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.equal(html.includes('<script>alert("x")</script>'), false);
});
