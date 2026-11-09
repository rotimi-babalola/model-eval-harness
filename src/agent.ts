import type { ChatFn, ChatMessage, ModelConfig, RunRecord, Task } from "./types";
import { createTools, toolSchemas } from "./tools";

export const SYSTEM_PROMPT =
  "You are being evaluated. Use the provided tools when they help. Never guess a tool result. " +
  "Follow output-format instructions exactly: when asked to reply with just a value, output only that value.";

export interface RunOptions {
  maxSteps?: number;
}

export async function runTask(
  chat: ChatFn,
  model: ModelConfig,
  task: Task,
  options: RunOptions = {},
): Promise<RunRecord> {
  const maxSteps = options.maxSteps ?? 8;
  const allTools = createTools();
  const available = new Map(task.tools.map((name) => [name, allTools[name]]));
  const schemas = toolSchemas([...available.values()]);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: task.prompt },
  ];

  const start = performance.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let toolCalls = 0;
  let toolFailures = 0;
  let recoveryAttempts = 0;
  let steps = 0;
  let sawFailure = false;
  let answer = "";
  let completed = false;
  let error: string | undefined;

  try {
    for (; steps < maxSteps; steps++) {
      const result = await chat({ model: model.id, messages, tools: schemas });
      inputTokens += result.usage.input;
      outputTokens += result.usage.output;

      const message = result.message;
      messages.push(message);
      const calls = message.tool_calls ?? [];

      if (calls.length === 0) {
        answer = message.content?.trim() ?? "";
        completed = answer.length > 0;
        break;
      }

      for (const call of calls) {
        toolCalls++;
        if (sawFailure) recoveryAttempts++;

        let content: string;
        try {
          const tool = available.get(call.function.name);
          if (!tool) throw new Error(`unknown tool: ${call.function.name}`);

          let args: unknown;
          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            throw new Error("tool arguments are not valid JSON");
          }
          content = await tool.run(args as Record<string, unknown>);
        } catch (err) {
          sawFailure = true;
          toolFailures++;
          content = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
        }

        messages.push({ role: "tool", tool_call_id: call.id, content });
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const costUsd =
    (inputTokens / 1_000_000) * model.inputPricePerMTok +
    (outputTokens / 1_000_000) * model.outputPricePerMTok;

  return {
    taskId: task.id,
    modelId: model.id,
    modelLabel: model.label,
    completed,
    correct: completed && task.check(answer),
    error,
    latencyMs: performance.now() - start,
    inputTokens,
    outputTokens,
    costUsd,
    toolCalls,
    toolFailures,
    recoveryAttempts,
    steps,
    answer,
    expected: task.expected,
  };
}
