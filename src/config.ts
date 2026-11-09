import type { ModelConfig } from "./types";

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number, got "${raw}"`);
  }
  return value;
}

// Prices are USD per 1M tokens. Defaults are OpenAI list prices; update them
// (or override with env vars) before comparing cost across providers.
export function loadModels(): ModelConfig[] {
  return [
    {
      id: process.env.MODEL_A || "gpt-4o-mini",
      label: process.env.MODEL_A_LABEL || "gpt-4o-mini",
      inputPricePerMTok: numberFromEnv("MODEL_A_INPUT_PRICE", 0.15),
      outputPricePerMTok: numberFromEnv("MODEL_A_OUTPUT_PRICE", 0.6),
    },
    {
      id: process.env.MODEL_B || "gpt-4o",
      label: process.env.MODEL_B_LABEL || "gpt-4o",
      inputPricePerMTok: numberFromEnv("MODEL_B_INPUT_PRICE", 2.5),
      outputPricePerMTok: numberFromEnv("MODEL_B_OUTPUT_PRICE", 10),
    },
  ];
}

export const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
export const maxSteps = numberFromEnv("MAX_STEPS", 8);
