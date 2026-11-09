export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
      // Raw Responses API output items (reasoning, message, function_call) that
      // must be replayed so reasoning models keep their context across tool calls.
      responsesOutput?: unknown[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools: ToolSchema[];
}

export interface ChatResult {
  message: Extract<ChatMessage, { role: "assistant" }>;
  usage: { input: number; output: number };
}

export type ChatFn = (request: ChatRequest) => Promise<ChatResult>;

export type Protocol = "openai" | "openai-responses" | "anthropic";

export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export interface ModelConfig {
  id: string;
  label: string;
  protocol: Protocol;
  baseUrl: string;
  apiKey: string;
  reasoningEffort?: ReasoningEffort;
  inputPricePerMTok: number;
  outputPricePerMTok: number;
}

export interface Task {
  id: string;
  prompt: string;
  tools: string[];
  expected: string;
  check: (answer: string) => boolean;
}

export interface RunRecord {
  taskId: string;
  modelId: string;
  modelLabel: string;
  completed: boolean;
  correct: boolean;
  error?: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  toolCalls: number;
  toolFailures: number;
  recoveryAttempts: number;
  steps: number;
  answer: string;
  expected: string;
}

export interface ModelSummary {
  modelId: string;
  label: string;
  protocol: Protocol;
  reasoningEffort?: ReasoningEffort;
  tasks: number;
  completed: number;
  correct: number;
  errors: number;
  completionRate: number;
  correctnessRate: number;
  latency: { meanMs: number; p50Ms: number; p95Ms: number };
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costPerSuccessfulTask: number | null;
  toolCalls: number;
  toolFailures: number;
  recoveryAttempts: number;
  recoveredRuns: number;
  runs: RunRecord[];
}

export interface EvalReport {
  generatedAt: string;
  maxSteps: number;
  tasks: Array<Pick<Task, "id" | "prompt" | "tools" | "expected">>;
  models: ModelSummary[];
}
