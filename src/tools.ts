import { readFile, readdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolSchema } from "./types";

const FIXTURES = fileURLToPath(new URL("../fixtures", import.meta.url));

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run(args: Record<string, unknown>): Promise<string>;
}

export function toolSchemas(tools: Tool[]): ToolSchema[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

const WEATHER: Record<string, string> = {
  paris: "sunny",
  tokyo: "rainy",
  oslo: "snowy",
  lima: "cloudy",
};

const ORDERS: Record<string, object> = {
  "1001": { id: "1001", item: "keyboard", quantity: 2, unitPrice: 45, status: "shipped" },
  "1002": { id: "1002", item: "widget", quantity: 3, unitPrice: 12.5, status: "processing" },
  "1003": { id: "1003", item: "monitor", quantity: 1, unitPrice: 220, status: "delivered" },
};

export function createTools(): Record<string, Tool> {
  let searchAttempts = 0;

  const tools: Tool[] = [
    {
      name: "calculator",
      description: "Evaluate a basic arithmetic expression (numbers and + - * / parentheses).",
      parameters: {
        type: "object",
        properties: { expression: { type: "string", description: "Expression to evaluate" } },
        required: ["expression"],
      },
      async run(args) {
        const expression = String(args.expression ?? "");
        if (!/^[\d\s+\-*/().%]+$/.test(expression)) {
          throw new Error("expression contains unsupported characters");
        }
        // shortcut: arithmetic-only eval, replace with a parser if input is ever untrusted.
        const value = Function(`"use strict"; return (${expression});`)();
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new Error("expression did not produce a finite number");
        }
        return String(value);
      },
    },
    {
      name: "get_weather",
      description: "Get the current weather condition for a city.",
      parameters: {
        type: "object",
        properties: { city: { type: "string", description: "City name" } },
        required: ["city"],
      },
      async run(args) {
        const city = String(args.city ?? "").toLowerCase();
        const condition = WEATHER[city];
        if (!condition) throw new Error(`no weather data for city: ${city}`);
        return condition;
      },
    },
    {
      name: "read_file",
      description: "Read a text file from the fixtures directory.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "File name, e.g. prices.txt" } },
        required: ["path"],
      },
      async run(args) {
        const requested = String(args.path ?? "");
        const path = resolve(FIXTURES, requested);
        if (!path.startsWith(FIXTURES + sep)) throw new Error("path escapes fixtures directory");
        try {
          return await readFile(path, "utf8");
        } catch {
          throw new Error(`file not found: ${requested}`);
        }
      },
    },
    {
      name: "list_files",
      description: "List the file names available in the fixtures directory.",
      parameters: { type: "object", properties: {} },
      async run() {
        return (await readdir(FIXTURES)).sort().join("\n");
      },
    },
    {
      name: "lookup_order",
      description: "Look up an order by its numeric ID.",
      parameters: {
        type: "object",
        properties: { order_id: { type: "string", description: "Order ID, e.g. 1001" } },
        required: ["order_id"],
      },
      async run(args) {
        const id = String(args.order_id ?? "");
        const order = ORDERS[id];
        if (!order) throw new Error(`order not found: ${id}`);
        return JSON.stringify(order);
      },
    },
    {
      name: "search_docs",
      description: "Search the documentation for a topic. May fail transiently; call it again if it does.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search query" } },
        required: ["query"],
      },
      async run() {
        searchAttempts++;
        if (searchAttempts === 1) {
          throw new Error("temporary search index error; retry the search");
        }
        return "Rate limits return HTTP 429 and include a Retry-After header.";
      },
    },
  ];

  return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}
