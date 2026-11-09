import assert from "node:assert/strict";
import test from "node:test";
import { runTask } from "../src/agent";
import { tasks } from "../src/tasks";
import type { ChatFn, ChatResult, ModelConfig, RunRecord } from "../src/types";

const model: ModelConfig = {
  id: "test-model",
  label: "test-model",
  protocol: "openai",
  baseUrl: "http://localhost",
  apiKey: "test",
  inputPricePerMTok: 1,
  outputPricePerMTok: 2,
};

const toolCall = (name: string, args: object): ChatResult => ({
  message: {
    role: "assistant",
    content: null,
    tool_calls: [{ id: "call_1", type: "function", function: { name, arguments: JSON.stringify(args) } }],
  },
  usage: { input: 10, output: 5 },
});

const answer = (text: string): ChatResult => ({
  message: { role: "assistant", content: text },
  usage: { input: 20, output: 3 },
});

function scripted(...responses: ChatResult[]): ChatFn {
  let index = 0;
  return async () => responses[Math.min(index++, responses.length - 1)];
}

function task(id: string) {
  const found = tasks.find((item) => item.id === id);
  assert.ok(found, `missing task ${id}`);
  return found;
}

test("runs a tool and scores a correct answer", async () => {
  const chat = scripted(toolCall("calculator", { expression: "847 * 23" }), answer("19481"));
  const run = await runTask(chat, model, task("calc-basic"));

  assert.equal(run.completed, true);
  assert.equal(run.correct, true);
  assert.equal(run.toolCalls, 1);
  assert.equal(run.toolFailures, 0);
  assert.equal(run.recoveryAttempts, 0);
  assert.equal(run.inputTokens, 30);
  assert.equal(run.outputTokens, 8);
  assert.ok(Math.abs(run.costUsd - 0.000046) < 1e-12);
});

test("counts tool failures and recovery attempts", async () => {
  const chat = scripted(
    toolCall("read_file", { path: "settings.json" }),
    toolCall("list_files", {}),
    answer("eu-west"),
  );
  const run = await runTask(chat, model, task("missing-file"));

  assert.equal(run.correct, true);
  assert.equal(run.toolFailures, 1);
  assert.equal(run.recoveryAttempts, 1);
});

test("unknown tools are recorded as failures", async () => {
  const chat = scripted(toolCall("does_not_exist", {}), answer("eu-west"));
  const run = await runTask(chat, model, task("file-region"));

  assert.equal(run.toolFailures, 1);
  assert.equal(run.recoveryAttempts, 0);
  assert.equal(run.correct, true);
});

test("stops after maxSteps without a final answer", async () => {
  const chat = scripted(toolCall("calculator", { expression: "1 + 1" }));
  const run = await runTask(chat, model, task("calc-basic"), { maxSteps: 2 });

  assert.equal(run.completed, false);
  assert.equal(run.correct, false);
  assert.equal(run.steps, 2);
});

test("records API errors without throwing", async () => {
  const chat: ChatFn = async () => {
    throw new Error("API 401: invalid key");
  };
  const run = await runTask(chat, model, task("calc-basic"));

  assert.equal(run.completed, false);
  assert.equal(run.correct, false);
  assert.match(run.error ?? "", /401/);
});

test("summarizes rates, latency and cost per success", async () => {
  const record = (overrides: Partial<RunRecord>): RunRecord => ({
    taskId: "t",
    modelId: model.id,
    modelLabel: model.label,
    completed: true,
    correct: false,
    latencyMs: 100,
    inputTokens: 100,
    outputTokens: 10,
    costUsd: 0.1,
    toolCalls: 1,
    toolFailures: 0,
    recoveryAttempts: 0,
    steps: 2,
    answer: "",
    expected: "",
    ...overrides,
  });
  const { summarizeModel, toCsv } = await import("../src/report");
  const runs = [
    record({ taskId: "a", correct: true, costUsd: 0.2 }),
    record({
      taskId: "b",
      latencyMs: 200,
      toolFailures: 1,
      recoveryAttempts: 2,
      correct: true,
      costUsd: 0.3,
    }),
  ];

  const summary = summarizeModel(model, runs);
  assert.equal(summary.completionRate, 1);
  assert.equal(summary.correctnessRate, 1);
  assert.equal(summary.latency.meanMs, 150);
  assert.equal(summary.latency.p50Ms, 100);
  assert.equal(summary.latency.p95Ms, 200);
  assert.ok(Math.abs((summary.costPerSuccessfulTask ?? 0) - 0.25) < 1e-12);
  assert.equal(summary.recoveredRuns, 1);
  assert.equal(summary.toolFailures, 1);
  assert.equal(summary.recoveryAttempts, 2);

  const csv = toCsv([summary]);
  assert.equal(csv.trim().split("\n").length, 3);
});
