import type { ModelConfig, Protocol, ReasoningEffort } from "./types";

const REASONING_EFFORTS = new Set<ReasoningEffort>([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

const PROTOCOLS = new Set<Protocol>(["openai", "openai-responses", "anthropic"]);

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number, got "${raw}"`);
  }
  return value;
}

function protocolFromEnv(prefix: string): Protocol {
  const raw = process.env[`${prefix}_PROTOCOL`] || "openai";
  if (!PROTOCOLS.has(raw as Protocol)) {
    throw new Error(
      `${prefix}_PROTOCOL must be one of ${[...PROTOCOLS].join(", ")}, got "${raw}"`,
    );
  }
  return raw as Protocol;
}

function modelFromEnv(
  prefix: "MODEL_A" | "MODEL_B",
  defaults: { id: string; inputPrice: number; outputPrice: number },
): ModelConfig {
  const protocol = protocolFromEnv(prefix);
  const id = process.env[prefix] || defaults.id;
  const isAnthropic = protocol === "anthropic";

  const effortRaw = process.env[`${prefix}_REASONING_EFFORT`];
  if (effortRaw && !REASONING_EFFORTS.has(effortRaw as ReasoningEffort)) {
    throw new Error(
      `${prefix}_REASONING_EFFORT must be one of ${[...REASONING_EFFORTS].join(", ")}, got "${effortRaw}"`,
    );
  }
  const reasoningEffort = effortRaw as ReasoningEffort | undefined;

  const baseUrl = (
    process.env[`${prefix}_BASE_URL`] ||
    (isAnthropic ? process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1" : process.env.OPENAI_BASE_URL || "https://api.openai.com/v1")
  ).replace(/\/$/, "");

  const apiKey =
    process.env[`${prefix}_API_KEY`] ||
    (isAnthropic ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY) ||
    "";

  return {
    id,
    label: process.env[`${prefix}_LABEL`] || id,
    protocol,
    baseUrl,
    apiKey,
    ...(reasoningEffort ? { reasoningEffort } : {}),
    inputPricePerMTok: numberFromEnv(`${prefix}_INPUT_PRICE`, defaults.inputPrice),
    outputPricePerMTok: numberFromEnv(`${prefix}_OUTPUT_PRICE`, defaults.outputPrice),
  };
}

// Prices are USD per 1M tokens. Defaults are OpenAI list prices; update them
// (or override with env vars) before comparing cost across providers.
export function loadModels(): ModelConfig[] {
  return [
    modelFromEnv("MODEL_A", { id: "gpt-4o-mini", inputPrice: 0.15, outputPrice: 0.6 }),
    modelFromEnv("MODEL_B", { id: "gpt-4o", inputPrice: 2.5, outputPrice: 10 }),
  ];
}

export const maxSteps = numberFromEnv("MAX_STEPS", 8);
