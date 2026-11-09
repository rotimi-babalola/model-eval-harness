import type { ChatFn, ChatMessage, ModelConfig, ToolCall } from "./types";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      lastError = new Error(`request failed: ${err instanceof Error ? err.message : String(err)}`);
      if (attempt < ATTEMPTS - 1) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw lastError;
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      lastError = new Error(`API ${response.status}: ${detail}`);
      if (RETRYABLE_STATUS.has(response.status) && attempt < ATTEMPTS - 1) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw lastError;
    }

    return response.json();
  }

  throw lastError ?? new Error("request failed");
}

export function createChat(model: ModelConfig): ChatFn {
  if (model.protocol === "anthropic") return createAnthropicChat(model);
  if (model.protocol === "openai-responses") return createOpenAIResponsesChat(model);
  return createOpenAIChat(model);
}

function toOpenAIMessages(messages: ChatMessage[]) {
  return messages.map((message) => {
    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: message.content,
        ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
      };
    }
    if (message.role === "tool") {
      return { role: "tool", tool_call_id: message.tool_call_id, content: message.content };
    }
    return { role: message.role, content: message.content };
  });
}

function createOpenAIChat(model: ModelConfig): ChatFn {
  return async (request) => {
    const payload = (await postJson(
      `${model.baseUrl}/chat/completions`,
      { authorization: `Bearer ${model.apiKey}` },
      {
        model: request.model,
        messages: toOpenAIMessages(request.messages),
        ...(model.reasoningEffort ? { reasoning_effort: model.reasoningEffort } : {}),
        ...(request.tools.length ? { tools: request.tools, tool_choice: "auto" } : {}),
      },
    )) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const message = payload.choices?.[0]?.message;
    if (!message) throw new Error("API response is missing choices[0].message");

    return {
      message: {
        role: "assistant",
        content: message.content ?? null,
        ...(Array.isArray(message.tool_calls) ? { tool_calls: message.tool_calls } : {}),
      },
      usage: {
        input: payload.usage?.prompt_tokens ?? 0,
        output: payload.usage?.completion_tokens ?? 0,
      },
    };
  };
}

interface ResponsesItem {
  type: string;
  role?: string;
  content?: Array<{ type: string; text?: string }>;
  call_id?: string;
  name?: string;
  arguments?: string;
}

function toResponsesInput(messages: ChatMessage[]): { instructions: string; input: unknown[] } {
  let instructions = "";
  const input: unknown[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      instructions = instructions ? `${instructions}\n\n${message.content}` : message.content;
      continue;
    }

    if (message.role === "user") {
      input.push({ role: "user", content: message.content });
      continue;
    }

    if (message.role === "assistant") {
      if (message.responsesOutput?.length) {
        input.push(...message.responsesOutput);
      } else {
        const content: unknown[] = [];
        if (message.content) content.push({ type: "output_text", text: message.content });
        for (const call of message.tool_calls ?? []) {
          content.push({
            type: "function_call",
            call_id: call.id,
            name: call.function.name,
            arguments: call.function.arguments,
          });
        }
        if (content.length) input.push({ role: "assistant", content });
      }
      continue;
    }

    input.push({ type: "function_call_output", call_id: message.tool_call_id, output: message.content });
  }

  return { instructions, input };
}

function createOpenAIResponsesChat(model: ModelConfig): ChatFn {
  return async (request) => {
    const { instructions, input } = toResponsesInput(request.messages);

    const payload = (await postJson(
      `${model.baseUrl}/responses`,
      { authorization: `Bearer ${model.apiKey}` },
      {
        model: request.model,
        input,
        store: false,
        ...(instructions ? { instructions } : {}),
        ...(model.reasoningEffort ? { reasoning: { effort: model.reasoningEffort } } : {}),
        ...(request.tools.length
          ? {
              tools: request.tools.map((tool) => ({
                type: "function",
                name: tool.function.name,
                description: tool.function.description,
                parameters: tool.function.parameters,
              })),
              tool_choice: "auto",
            }
          : {}),
      },
    )) as {
      output?: ResponsesItem[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const output = payload.output ?? [];
    const text = output
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((block) => block.type === "output_text")
      .map((block) => block.text ?? "")
      .join("");
    const toolCalls: ToolCall[] = output
      .filter((item) => item.type === "function_call")
      .map((item) => ({
        id: item.call_id ?? "",
        type: "function",
        function: { name: item.name ?? "", arguments: item.arguments ?? "{}" },
      }));

    return {
      message: {
        role: "assistant",
        content: text || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        ...(output.length ? { responsesOutput: output } : {}),
      },
      usage: {
        input: payload.usage?.input_tokens ?? 0,
        output: payload.usage?.output_tokens ?? 0,
      },
    };
  };
}

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicBlock[];
}

function toAnthropicMessages(messages: ChatMessage[]): {
  system: string;
  messages: AnthropicMessage[];
} {
  let system = "";
  const converted: AnthropicMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      system = system ? `${system}\n\n${message.content}` : message.content;
      continue;
    }

    if (message.role === "user") {
      converted.push({ role: "user", content: message.content });
      continue;
    }

    if (message.role === "assistant") {
      const blocks: AnthropicBlock[] = [];
      if (message.content) blocks.push({ type: "text", text: message.content });

      for (const call of message.tool_calls ?? []) {
        let input: unknown = {};
        try {
          input = JSON.parse(call.function.arguments || "{}");
        } catch {
          // Invalid arguments are reported by the agent when the tool runs.
        }
        blocks.push({ type: "tool_use", id: call.id, name: call.function.name, input });
      }

      if (blocks.length) converted.push({ role: "assistant", content: blocks });
      continue;
    }

    const block: AnthropicBlock = {
      type: "tool_result",
      tool_use_id: message.tool_call_id,
      content: message.content,
    };
    const last = converted[converted.length - 1];
    if (last?.role === "user" && Array.isArray(last.content)) {
      last.content.push(block);
    } else {
      converted.push({ role: "user", content: [block] });
    }
  }

  return { system, messages: converted };
}

function createAnthropicChat(model: ModelConfig): ChatFn {
  return async (request) => {
    const { system, messages } = toAnthropicMessages(request.messages);

    const payload = (await postJson(
      `${model.baseUrl}/messages`,
      {
        "x-api-key": model.apiKey,
        "anthropic-version": "2023-06-01",
      },
      {
        model: request.model,
        max_tokens: 4096,
        ...(system ? { system } : {}),
        messages,
        ...(request.tools.length
          ? {
              tools: request.tools.map((tool) => ({
                name: tool.function.name,
                description: tool.function.description,
                input_schema: tool.function.parameters,
              })),
              tool_choice: { type: "auto" },
            }
          : {}),
      },
    )) as {
      content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const blocks = payload.content ?? [];
    const text = blocks
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
    const toolCalls: ToolCall[] = blocks
      .filter((block) => block.type === "tool_use")
      .map((block) => ({
        id: block.id ?? "",
        type: "function",
        function: { name: block.name ?? "", arguments: JSON.stringify(block.input ?? {}) },
      }));

    return {
      message: {
        role: "assistant",
        content: text || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      },
      usage: {
        input: payload.usage?.input_tokens ?? 0,
        output: payload.usage?.output_tokens ?? 0,
      },
    };
  };
}
