import { mkdir, writeFile } from "node:fs/promises";
import { loadModels, maxSteps } from "./config";
import { runTask } from "./agent";
import { createChat } from "./provider";
import { renderHtml } from "./html";
import { formatSummary, summarizeModel, toCsv } from "./report";
import { tasks } from "./tasks";
import type { EvalReport, ModelSummary, RunRecord } from "./types";

async function main(): Promise<void> {
  const models = loadModels();
  const missingKeys = models.filter((model) => !model.apiKey);
  if (missingKeys.length) {
    console.error(
      `Missing API key for ${missingKeys.map((model) => model.label).join(", ")}. ` +
        "Set MODEL_A_API_KEY / MODEL_B_API_KEY (or OPENAI_API_KEY / ANTHROPIC_API_KEY).",
    );
    process.exitCode = 1;
    return;
  }

  const summaries: ModelSummary[] = [];

  for (const model of models) {
    console.log(`\n${model.label} (${model.id}, ${model.protocol}${model.reasoningEffort ? `, effort=${model.reasoningEffort}` : ""})`);
    const chat = createChat(model);
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

  const report: EvalReport = {
    generatedAt: new Date().toISOString(),
    maxSteps,
    tasks: tasks.map(({ id, prompt, tools, expected }) => ({ id, prompt, tools, expected })),
    models: summaries,
  };
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const html = renderHtml(report);

  await mkdir("results", { recursive: true });
  await writeFile(`results/${stamp}.json`, JSON.stringify(report, null, 2) + "\n");
  await writeFile("results/latest.json", JSON.stringify(report, null, 2) + "\n");
  await writeFile("results/latest.csv", toCsv(summaries));
  await writeFile(`results/${stamp}.html`, html);
  await writeFile("results/latest.html", html);

  console.log(
    `\nWrote results/${stamp}.json, results/latest.json, results/latest.csv, results/latest.html`,
  );
}

await main();
