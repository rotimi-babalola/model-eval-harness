# Model eval harness

Runs 12 deterministic tool-use tasks against two models and reports completion,
correctness, latency, token usage, cost per successful task, and tool failures /
recovery. Works with any OpenAI-compatible Chat Completions endpoint.

## Setup

```sh
npm install
cp .env.example .env   # fill in the key, model IDs and prices
npm start
npm test
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `OPENAI_API_KEY` | required | Bearer token for the endpoint |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible base URL |
| `MODEL_A` / `MODEL_B` | `gpt-4o-mini` / `gpt-4o` | API model IDs |
| `MODEL_A_LABEL` / `MODEL_B_LABEL` | model ID | Name shown in the report |
| `MODEL_A_INPUT_PRICE` / `MODEL_A_OUTPUT_PRICE` | `0.15` / `0.60` | USD per 1M tokens |
| `MODEL_B_INPUT_PRICE` / `MODEL_B_OUTPUT_PRICE` | `2.50` / `10.00` | USD per 1M tokens |
| `MAX_STEPS` | `8` | Max assistant turns per task |

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

Results are written to `results/`:

- `latest.json` and a timestamped JSON file with per-run detail plus summaries
- `latest.csv` with one row per model × task

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
