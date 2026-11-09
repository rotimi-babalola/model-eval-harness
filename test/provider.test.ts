import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createChat } from "../src/provider";
import type { ChatMessage, ModelConfig, ToolSchema } from "../src/types";

interface Captured {
  path: string | undefined;
  headers: http.IncomingHttpHeaders;
  body: {
    system?: string;
    messages: Array<{ role: string; content: unknown }>;
    tools?: Array<Record<string, unknown>>;
  };
}

async function withServer(
  response: unknown,
  run: (url: string, captured: Captured[]) => Promise<void>,
): Promise<void> {
  const captured: Captured[] = [];
  const server = http.createServer((request, reply) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      captured.push({
        path: request.url,
        headers: request.headers,
        body: JSON.parse(body) as Captured["body"],
      });
      reply.writeHead(200, { "content-type": "application/json" });
      reply.end(JSON.stringify(response));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${port}/v1`, captured);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const tools: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "calculator",
      description: "Evaluate arithmetic",
      parameters: { type: "object", properties: { expression: { type: "string" } } },
    },
  },
];

function model(protocol: "openai" | "anthropic", baseUrl: string): ModelConfig {
  return {
    id: "test-model",
    label: "test-model",
    protocol,
    baseUrl,
    apiKey: "secret",
    inputPricePerMTok: 1,
    outputPricePerMTok: 2,
  };
}

test("OpenAI adapter sends tools and parses tool calls", async () => {
  const response = {
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "calculator", arguments: '{"expression":"1+1"}' },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 11, completion_tokens: 7 },
  };

  await withServer(response, async (url, captured) => {
    const chat = createChat(model("openai", url));
    const result = await chat({ model: "test-model", messages: [{ role: "user", content: "go" }], tools });

    assert.equal(captured[0].path, "/v1/chat/completions");
    assert.equal(captured[0].headers.authorization, "Bearer secret");
    assert.equal(captured[0].body.tools?.length, 1);
    assert.equal(result.message.tool_calls?.[0].function.arguments, '{"expression":"1+1"}');
    assert.deepEqual(result.usage, { input: 11, output: 7 });
  });
});

test("Anthropic adapter converts messages, tool results and tools", async () => {
  const response = {
    content: [
      { type: "text", text: "Working" },
      { type: "tool_use", id: "toolu_1", name: "calculator", input: { expression: "1+1" } },
    ],
    usage: { input_tokens: 13, output_tokens: 5 },
  };

  const messages: ChatMessage[] = [
    { role: "system", content: "be useful" },
    { role: "user", content: "go" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "call_1", type: "function", function: { name: "calculator", arguments: '{"expression":"1+1"}' } },
        { id: "call_2", type: "function", function: { name: "calculator", arguments: '{"expression":"2+2"}' } },
      ],
    },
    { role: "tool", tool_call_id: "call_1", content: "2" },
    { role: "tool", tool_call_id: "call_2", content: "4" },
  ];

  await withServer(response, async (url, captured) => {
    const chat = createChat(model("anthropic", url));
    const result = await chat({ model: "test-model", messages, tools });

    const request = captured[0];
    assert.equal(request.path, "/v1/messages");
    assert.equal(request.headers["x-api-key"], "secret");
    assert.equal(request.headers["anthropic-version"], "2023-06-01");
    assert.equal(request.body.system, "be useful");
    assert.equal(request.body.messages.length, 3);
    assert.equal(request.body.messages[1].role, "assistant");
    assert.equal(request.body.tools?.[0].input_schema !== undefined, true);

    const toolResults = request.body.messages[2].content as Array<Record<string, unknown>>;
    assert.equal(toolResults.length, 2);
    assert.equal(toolResults[0].type, "tool_result");
    assert.equal(toolResults[1].tool_use_id, "call_2");

    assert.equal(result.message.content, "Working");
    assert.equal(result.message.tool_calls?.[0].function.arguments, '{"expression":"1+1"}');
    assert.deepEqual(result.usage, { input: 13, output: 5 });
  });
});
