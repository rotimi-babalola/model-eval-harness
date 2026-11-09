import type { ChatFn, ToolCall } from "./types";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createOpenAIChat(baseUrl: string, apiKey: string): ChatFn {
  return async (request) => {
    const url = `${baseUrl}/chat/completions`;
    const body = {
      model: request.model,
      messages: request.messages,
      ...(request.tools.length ? { tools: request.tools, tool_choice: "auto" } : {}),
    };

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
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

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { role?: string; content?: string | null; tool_calls?: unknown } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const message = payload.choices?.[0]?.message;
      if (!message) throw new Error("API response is missing choices[0].message");

      return {
        message: {
          role: "assistant",
          content: message.content ?? null,
          ...(Array.isArray(message.tool_calls) ? { tool_calls: message.tool_calls as ToolCall[] } : {}),
        },
        usage: {
          input: payload.usage?.prompt_tokens ?? 0,
          output: payload.usage?.completion_tokens ?? 0,
        },
      };
    }

    throw lastError ?? new Error("request failed");
  };
}
