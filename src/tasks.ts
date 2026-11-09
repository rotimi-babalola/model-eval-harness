import type { Task } from "./types";

function normalize(answer: string): string {
  return answer
    .toLowerCase()
    .replace(/[^a-z0-9.\-]+/g, " ")
    .trim();
}

function containsAll(...terms: string[]): (answer: string) => boolean {
  return (answer) => {
    const text = ` ${normalize(answer)} `;
    return terms.every((term) => text.includes(normalize(term)));
  };
}

function numberIs(expected: number, tolerance = 1e-9): (answer: string) => boolean {
  return (answer) => {
    const numbers = answer.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/g);
    if (!numbers?.length) return false;
    return Math.abs(Number(numbers[numbers.length - 1]) - expected) <= tolerance;
  };
}

export const tasks: Task[] = [
  {
    id: "calc-basic",
    prompt: "Use the calculator tool to compute 847 * 23. Reply with just the number.",
    tools: ["calculator"],
    expected: "19481",
    check: numberIs(19481),
  },
  {
    id: "calc-chain",
    prompt: "Use the calculator tool to compute (45 + 55) * 3. Reply with just the number.",
    tools: ["calculator"],
    expected: "300",
    check: numberIs(300),
  },
  {
    id: "weather-paris",
    prompt: "Use the weather tool to find the current condition in Paris. Reply with just the condition.",
    tools: ["get_weather"],
    expected: "sunny",
    check: containsAll("sunny"),
  },
  {
    id: "weather-two",
    prompt:
      "Use the weather tool to look up Tokyo and Oslo. Reply with both conditions, separated by a comma.",
    tools: ["get_weather"],
    expected: "rainy, snowy",
    check: containsAll("rain", "snow"),
  },
  {
    id: "file-region",
    prompt: "Read config.json with the file tool and reply with just the region value.",
    tools: ["read_file"],
    expected: "eu-west",
    check: containsAll("eu-west"),
  },
  {
    id: "prices-sum",
    prompt:
      "Read prices.txt and use the calculator to total the three prices. Reply with just the total.",
    tools: ["read_file", "calculator"],
    expected: "15",
    check: numberIs(15),
  },
  {
    id: "order-status",
    prompt: "Look up order 1001 and reply with just its status.",
    tools: ["lookup_order"],
    expected: "shipped",
    check: containsAll("shipped"),
  },
  {
    id: "order-total",
    prompt:
      "Look up order 1002. Compute quantity times unitPrice with the calculator. Reply with just the total.",
    tools: ["lookup_order", "calculator"],
    expected: "37.5",
    check: numberIs(37.5),
  },
  {
    id: "flaky-search",
    prompt:
      "Search the docs for 'rate limit'. The search tool may fail on the first attempt; retry it if it does. Reply with just the HTTP status code that rate limits use.",
    tools: ["search_docs"],
    expected: "429",
    check: containsAll("429"),
  },
  {
    id: "missing-file",
    prompt:
      "Try to read settings.json. If that file does not exist, list the fixture files and read config.json instead. Reply with just the region value.",
    tools: ["read_file", "list_files"],
    expected: "eu-west",
    check: containsAll("eu-west"),
  },
  {
    id: "no-tool-capital",
    prompt: "What is the capital of France? Reply with just the city. Do not call any tools.",
    tools: [],
    expected: "Paris",
    check: containsAll("paris"),
  },
  {
    id: "highest-price",
    prompt:
      "Read prices.txt and identify the item with the highest price. Reply with just the item name.",
    tools: ["read_file"],
    expected: "cherries",
    check: containsAll("cherries"),
  },
];
