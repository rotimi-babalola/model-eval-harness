# Model eval harness

Runs 12 deterministic tool-use tasks against two models and reports completion,
correctness, latency, token usage, cost per successful task, and tool failures /
recovery. Results are written as JSON, CSV and a self-contained HTML report you
can open in a browser.

## Setup

```sh
npm install
cp .env.example .env   # fill in keys, model IDs and prices
npm start
open results/latest.html
npm test
```

## Providers and models

Each model can use either protocol:

- **`openai`** (default): any OpenAI-compatible Chat Completions endpoint.
- **`anthropic`**: the native Anthropic Messages API.

Most non-OpenAI models are reachable through an OpenAI-compatible endpoint:

- **DeepSeek** exposes an OpenAI-compatible API (`https://api.deepseek.com/v1`).
- **OpenRouter** exposes Claude, DeepSeek, Gemini and others through one
  OpenAI-compatible endpoint.
- Google Gemini, Groq, Together, Fireworks, Mistral, vLLM and Ollama also offer
  OpenAI-compatible endpoints.

Anthropic's native Messages API is *not* OpenAI-compatible, so this harness has a
built-in `anthropic` adapter. Use it when you want to call Anthropic directly.

> DeepSeek R1 / reasoner models are OpenAI-compatible at the API level, but tool
> calling support depends on the specific model version or host. If the model
> cannot call tools, the tool-dependent tasks will fail by design. Pick a
> tool-capable model variant when evaluating tool use.

### Example: one OpenRouter key, Claude vs DeepSeek

```sh
OPENAI_API_KEY=sk-or-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
MODEL_A=deepseek/deepseek-r1
MODEL_A_LABEL=DeepSeek R1
MODEL_A_INPUT_PRICE=0.55
MODEL_A_OUTPUT_PRICE=2.19
MODEL_B=anthropic/claude-opus-4.5
MODEL_B_LABEL=Claude Opus
MODEL_B_INPUT_PRICE=5
MODEL_B_OUTPUT_PRICE=25
```

Model IDs and prices change; check your provider's current catalog.

### Example: native Anthropic + direct DeepSeek

```sh
MODEL_A_PROTOCOL=anthropic
MODEL_A=claude-opus-4-5
MODEL_A_API_KEY=sk-ant-...
MODEL_A_INPUT_PRICE=5
MODEL_A_OUTPUT_PRICE=25

MODEL_B_PROTOCOL=openai
MODEL_B_BASE_URL=https://api.deepseek.com/v1
MODEL_B=deepseek-chat
MODEL_B_API_KEY=sk-...
MODEL_B_INPUT_PRICE=0.28
MODEL_B_OUTPUT_PRICE=0.42
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `MODEL_A` / `MODEL_B` | `gpt-4o-mini` / `gpt-4o` | API model IDs |
| `MODEL_A_PROTOCOL` / `MODEL_B_PROTOCOL` | `openai` | `openai` or `anthropic` |
| `MODEL_A_BASE_URL` / `MODEL_B_BASE_URL` | protocol default | Override the endpoint per model |
| `MODEL_A_API_KEY` / `MODEL_B_API_KEY` | protocol key | Override the key per model |
| `MODEL_A_LABEL` / `MODEL_B_LABEL` | model ID | Name shown in reports |
| `MODEL_A_INPUT_PRICE` / `MODEL_A_OUTPUT_PRICE` | `0.15` / `0.60` | USD per 1M tokens |
| `MODEL_B_INPUT_PRICE` / `MODEL_B_OUTPUT_PRICE` | `2.50` / `10.00` | USD per 1M tokens |
| `MAX_STEPS` | `8` | Max assistant turns per task |

Shared fallbacks:

- `OPENAI_API_KEY` / `OPENAI_BASE_URL` for `openai` models
- `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` for `anthropic` models

Prices are provider- and contract-specific. Update them before trusting the cost
columns.

## What gets measured

- **Completion**: the model produced a non-empty final answer within `MAX_STEPS`.
  A wrong answer still counts as completed.
- **Correctness**: the answer passed that task's checker.
- **Latency**: wall-clock time per task, including API retries (429/5xx).
- **Tokens / cost**: summed from each response's `usage`; cost uses the configured
  per-model prices.
- **Cost per successful task**: total API cost for the model divided by the number
  of correct runs.
- **Tool failures**: unknown tool name, invalid JSON arguments, or the tool threw.
- **Recovery attempts**: tool calls made after the first failure in a run.
- **Recovered runs**: runs that had a failure but still ended correct.

Two tasks intentionally fail on the first attempt (a missing file and a flaky
search tool) so recovery behavior is observable.

## Output

`results/` contains:

- `latest.html` — visual comparison with summary cards, metric bars and a
  side-by-side task table
- `latest.json` and a timestamped JSON file with per-run detail plus summaries
- `latest.csv` with one row per model × task

Regenerate the HTML after editing a JSON result:

```sh
npm run report                          # results/latest.json -> results/latest.html
npm run report results/<stamp>.json     # any report file
```

## Tasks

| ID | Tools | Expected |
| --- | --- | --- |
| `calc-basic` | calculator | 19481 |
| `calc-chain` | calculator | 300 |
| `weather-paris` | get_weather | sunny |
| `weather-two` | get_weather | rainy + snowy |
| `file-region` | read_file | eu-west |
| `prices-sum` | read_file, calculator | 15 |
| `order-status` | lookup_order | shipped |
| `order-total` | lookup_order, calculator | 37.5 |
| `flaky-search` | search_docs | 429 |
| `missing-file` | read_file, list_files | eu-west |
| `no-tool-capital` | none | Paris |
| `highest-price` | read_file | cherries |

Add tasks in `src/tasks.ts`; add tools in `src/tools.ts`. Keep every task's answer
deterministic so correctness is not subjective.
