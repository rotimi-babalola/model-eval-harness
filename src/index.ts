import { mkdir, writeFile } from "node:fs/promises";
import { baseUrl, loadModels, maxSteps } from "./config";
import { runTask } from "./agent";
import { createOpenAIChat } from "./provider";
import { formatSummary, summarizeModel, toCsv } from "./report";
import { tasks } from "./tasks";
import type { ModelSummary, RunRecord } from "./types";

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set. Copy .env.example to .env and fill it in.");
    process.exitCode = 1;
    return;
  }

  const models = loadModels();
  const chat = createOpenAIChat(baseUrl, apiKey);
  const summaries: ModelSummary[] = [];

  for (const model of models) {
    console.log(`\n${model.label} (${model.id})`);
    const runs: RunRecord[] = [];

    for (const task of tasks) {
      const run = await runTask(chat, model, task, { maxSteps });
      runs.push(run);

      const verdict = run.correct ? "PASS " : run.completed ? "WRONG" : "FAIL ";
      const detail = run.error ? ` error="${run.error}"` : ` answer="${run.answer}"`;
      console.log(`  ${verdict} ${task.id.padEnd(16)} ${Math.round(run.latencyMs)} ms${detail}`);
    }

    summaries.push(summarizeModel(model, runs));
  }

  console.log(`\n${formatSummary(summaries)}`);

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    maxSteps,
    tasks: tasks.map(({ id, prompt, tools, expected }) => ({ id, prompt, tools, expected })),
    models: summaries,
  };
  const stamp = report.generatedAt.replace(/[:.]/g, "-");

  await mkdir("results", { recursive: true });
  await writeFile(`results/${stamp}.json`, JSON.stringify(report, null, 2) + "\n");
  await writeFile("results/latest.json", JSON.stringify(report, null, 2) + "\n");
  await writeFile("results/latest.csv", toCsv(summaries));

  console.log(`\nWrote results/${stamp}.json, results/latest.json, results/latest.csv`);
}

await main();
