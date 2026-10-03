# Tier-3 rewrite model stack (BAML + cheap model)

Research date: 2026-10-02. Everything marked **measured** was run live on this machine today. Everything marked **unverified** is from docs or third parties and was not exercised.

## Recommendation

| Role | Client | Model / route | Reasoning | Temperature | Cost per full pass | Wall-clock per pass (16-way) |
|---|---|---|---|---|---|---|
| Primary, local | `LunaLB` | `gpt-6-luna` via codex-lb `http://127.0.0.1:2455/v1` | `low` (0 reasoning tokens measured) | not settable (codex-lb strips it) | $0 marginal, uses ChatGPT-account quota | **measured** about 4.9 min, or 2.8 min with `service_tier "priority"` |
| Primary, portable (CI, no codex-lb) | `LunaOR` | `openai/gpt-6-luna` on OpenRouter | `none` | 0.2 (OpenAI only honours it with effort `none`) | $0.13 to $0.29 | about 2.2 min (estimated) |
| Transport fallback, different vendor | `MistralSmallOR` | `mistralai/mistral-small-2603` | `none` | 0.2 | $0.16 to $0.41 | about 2.0 min (estimated) |
| Strong retry after a failed verify (about 10 to 15% of blocks) | `SolLB`, then `SolOR` | `gpt-6.1-sol` | `low` | n/a | $0 via codex-lb, $0.58 to $0.86 on the API | **measured** p50 5.1 s per call |

Why Luna first:

- **It already works here.** codex-lb is running and exposes `gpt-6-luna`. The draft BAML passes `baml-cli test` against it. 40 live rewrite calls kept every code span and link.
- **It is cheapest among the strong instruction-followers.** It costs $0.10 in and $0.50 out, and runs at about 136 tok/s with a 0.67 s TTFT on the API.
- **Qwen is a poor fit for this job.** Qwen3.8 Flash runs at 47 tok/s with a 1.8 s TTFT, has a single provider, and thinks by default. Qwen3.7 Flash is the cheapest at $0.04 to $0.08 per pass, but its p90 latency is 18 s and OpenRouter exposes no structured outputs for it. It is worth a bake-off only as a budget lane.

Files:

- `/tmp/ste-research/raw/rewrite.baml` is the draft clients, types, `RewriteBlock` function, and tests. It compiles on BAML 0.222.0, and its tests pass on Luna.
- `/tmp/ste-research/raw/generators.baml` holds the generator block (TS, ESM, async).
- `/tmp/ste-research/raw/rewrite-pipeline.ts` sketches routing, masking, verification, retry, and staging.
- `/tmp/ste-research/raw/luna-smoke.py`, `conc.py`, `conc2.py` are the live benchmarks (no secrets in them).
- `/tmp/ste-research/raw/baml-check/` is the scratch project used to compile and test. It holds `smoke.ts`, `reg.ts`, and `req.ts`.

---

## 1. Existing infrastructure

### What codex-lb is

- It is a local fork of [Soju06/codex-lb](https://github.com/Soju06/codex-lb) at `/Users/Ford/local-services/codex-lb`, a Python/FastAPI service.
- It pools ChatGPT accounts through OAuth and load-balances requests across them. It tracks usage and cost per account and has a dashboard.
- It is listening now on `127.0.0.1:2455`. `GET /v1/models` returns 200 with no key.
- **Endpoints:**
  - `/v1` serves OpenAI-compatible `chat/completions` and `responses`. BAML `openai-generic` uses this one.
  - `/backend-api/codex` speaks Responses for Codex CLI and pi agents.
- **Models exposed today:**
  - GPT-6: `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`
  - Older and other: `gpt-reserve`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `codex-auto-review`
- **`gpt-6-luna` metadata:**
  - Described as "Fast and affordable model for easier tasks."
  - Advertised efforts are `low`, `medium`, `high`, `xhigh`, `max`. The default is `medium`.
  - Has an extra `priority` service tier ("1.5x speed") and a 272k context.
  - **Measured:** effort `none` was also accepted.
- **Quirks (measured or read from source):**
  - It strips `temperature`, `top_p`, `max_output_tokens`, `metadata`, and `user` before forwarding (`app/core/openai/requests.py:827`).
  - `response_format: json_object` fails with HTTP 400 unless the word "json" appears in a **user** message. codex-lb turns system messages into Responses `instructions`. The draft prompt ends with "Reply with the JSON object only." for this reason.
  - Strict `json_schema` response_format works.
  - Prompt caching was not observed: `cached_tokens` stayed 0 across 17 calls with an identical 1.6k-token prefix. This does not matter at $0 marginal cost.
  - Pricing in the fork covers only `gpt-6-astra` and the 5.6 family, with `gpt-5.6-luna` at $0.20/$0.02/$1.20. `gpt-6-luna` has no price entry, so the dashboard does not cost its traffic. That is a small fork-overlay follow-up, the same kind of change as `add-gpt-6-astra-pricing`.
- **Caveats to decide on:**
  - Bulk automated traffic draws on the same ChatGPT-plan quota as interactive Codex work.
  - Whether ChatGPT-plan terms cover programmatic bulk rewriting is a policy question. This research did not settle it.
  - codex-lb only exists on this machine, so CI needs the OpenRouter route.

### How existing projects wire models

| Project | Mechanism | Wiring |
|---|---|---|
| `codecaine/core/canvas/packages/eval-suite/runner` | **BAML 0.222.0**, the only BAML in codecaine | `baml_src/clients.baml` defines `JudgeClient` as `openai-generic` with `base_url "http://127.0.0.1:2455/v1"`, `api_key env.CODEX_LB_API_KEY`, `model "gpt-5.6-sol"`, `reasoning_effort "low"`, `response_format json_object`, and retry policy `Exponential` (2 retries, 300 ms × 1.5). `src/judge/run_judges.ts` overrides it at runtime with `ClientRegistry.addLlmClient(..., "openai-generic", {...}, "Exponential")` and records tokens with `Collector`. The API key defaults to the literal placeholder `sk-clb-local`. **This is the pattern to copy.** |
| `docs-system/packages/docs-kernel` | pi agent runtime (`@agent-kernel/kernel`) | `DEFAULT_DOCS_WRITER_MODEL = "codex-lb/gpt-6-astra"` (`kernel.ts:32`) feeds the model aliases `docs-writer` and `docs-lab-editor`. The provider comes from `packages/docs-kernel/.pi-agent/models.json`: provider `codex-lb`, `api: openai-responses`, base `/backend-api/codex`. That registry lists `gpt-5.5`, `gpt-5.6-sol`, and `gpt-6-astra`, but **not `gpt-6-luna`**. The kurate catalog's `models.json` does list it. |
| `docs-system/packages/docs-mcp/src/jev-engine.ts` | raw `fetch` to TypeSafe | Model is `jev-1.13.0`, overridable with `CODECAINE_DOCS_JUDGMENT_MODEL`. The key is `TYPESAFE_API_KEY`, read through `codecaineEnv()` (the process env wins, then `~/.config/codecaine/env`). It runs batched questions with an in-memory LRU cache and bounded concurrency. |
| `codecaine/tools/variator` | pi agent | `VARIATOR_MODEL` defaults to `codex-lb/gpt-5.6-sol`. |
| linkt client repos (not codecaine) | OpenRouter | The insurance engine's `ddengine/extract/openrouter.py` uses `OPENROUTER_API_KEY`. Its lessons are below. kurate uses pi `ModelRuntime` with codex-lb. |

Lessons from the linkt OpenRouter extractor (`ddengine/extract/openrouter.py`):

- **Avoid `response_format` with a schema on mixed upstreams.** Support is uneven, and on one route it blanked the values while keeping the keys. The extractor puts the schema in the prompt and validates the result, which is exactly what BAML's `ctx.output_format` plus its parser do.
- **Stream long calls.** OpenRouter pads slow non-streamed bodies. This barely matters for 150-token outputs. If it shows up, use `b.stream.RewriteBlock(...).getFinalResponse()`.

### Environment variable names (values never printed)

- `~/.config/codecaine/env` contains only `TYPESAFE_API_KEY`.
- None of these are set in the shell: `CODEX_LB_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`.
- codex-lb currently accepts the placeholder key.
- **Needed for the portable route:** add `OPENROUTER_API_KEY` to `~/.config/codecaine/env`. `codecaineEnv()` picks it up without a restart.

---

## 2. BAML facts

Checked against the local `baml` docs snapshot and the installed `baml-cli 0.222.0`. The docs snapshot has empty code blocks, so all syntax below was confirmed by compiling and running.

| Topic | Verified syntax and behaviour |
|---|---|
| OpenRouter | `provider "openrouter"` exists in 0.222.0 and defaults to `base_url https://openrouter.ai/api/v1` and `api_key env.OPENROUTER_API_KEY`. The equivalent is `openai-generic` with `base_url "https://openrouter.ai/api/v1"`. Attribution goes in `headers { "HTTP-Referer" "..." "X-Title" "..." }`, which reach the request as headers. |
| Pass-through params | Unknown keys in `options` are sent in the body unchanged. Dumped with `b.request.*`, these all arrive as written: `reasoning_effort "low"`, `reasoning { effort "none" }`, `reasoning { enabled false }`, `provider { order [...] allow_fallbacks false sort "throughput" }`, `service_tier`, and `temperature`. |
| Timeouts | `http { connect_timeout_ms time_to_first_token_timeout_ms idle_timeout_ms request_timeout_ms }` goes inside `options` on leaf clients and is not sent in the body. Composite clients take `http { total_timeout_ms }`. The strictest value wins across nesting. |
| Retry | `retry_policy X { max_retries N strategy { type exponential_backoff delay_ms 300 multiplier 2 max_delay_ms 8000 } }`. It retries network, HTTP, and timeout errors. Each attempt gets the full timeout. |
| Fallback / round-robin | `provider fallback` with `options { strategy [A, B] }` tries the clients in order. `provider round-robin` with `options { strategy [...] start 0 }` rotates per call and per retry. Both can nest. |
| Runtime routing | Use `{ client: "LunaLB" }` per call, or `ClientRegistry`. `addLlmClient("Route", "fallback", { strategy: ["LunaLB","SolLB"] })` followed by `setPrimary` works, and its strategy can reference static `.baml` clients (measured). |
| Generator | `generator target { output_type "typescript" output_dir "../" version "0.222.0" default_client_mode async module_format "esm" }`. Generate with `baml-cli generate`. Running with bun works (measured). |
| Tests | `test Name { functions [F] args { ... } @@assert(name, {{ "x" not in this.markdown }}) }`. Run with `baml-cli test --from baml_src -i "RewriteBlock::"`. |
| Observability | `new Collector(name)` gives `.usage.inputTokens` and `.usage.outputTokens`. To find the client that answered, use `collector.last.calls.find(c => c.selected).clientName`. |
| Streaming | `b.stream.RewriteBlock(...)` with `@stream.done` / `@stream.not_null` attributes. It is not needed for 150-token outputs. |

Gotchas found while compiling and testing (all measured):

1. **A fallback chain needs every env var up front.** With `OPENROUTER_API_KEY` unset, a `fallback` that starts with `LunaLB` fails before trying LunaLB ("LLM client 'LunaOR' requires environment variable…"). The fix is to build the chain at runtime from the routes that exist, as `buildRoutes()` in the sketch does.
2. **Parse and assert failures do not trigger fallback.** Per the docs, finish-reason failures also skip fallback. The "stronger model on bad output" step therefore has to live in TypeScript.
3. **A parameter named `protected` breaks the generated TS client** (strict-mode reserved word). The draft renamed it `protected_spans`.
4. **Inline maps in test args need commas,** for example `{ rule_id "a", message "b" }`. Without them the parser fails, and the error points at the `test` keyword.
5. **Jinja block tags eat the newline after them.** `...{% endif %}` at line end merged findings into one line. The draft uses `{{ f.evidence or "(whole block)" }}` instead.
6. **json_object mode via codex-lb needs "json" in a user message** (see section 1).

---

## 3. Model options (current as of 2026-10-02)

Prices are $/M tokens, from OpenRouter's live `/api/v1/models` and OpenAI docs. Speeds are Artificial Analysis or OpenRouter medians, collected by a web-research subagent.

| Model | Route / slug | In | Cached in | Out | tok/s | TTFT | Reasoning control | Rewrite notes |
|---|---|---|---|---|---|---|---|---|
| **GPT-6 Luna** | `gpt-6-luna` (codex-lb, OpenAI) / `openai/gpt-6-luna` | 0.10 | 0.01 | 0.50 | 131–142 | 0.67 s | `none`, low, medium (default), high, xhigh, max. `minimal` returns 400 | Smallest GPT-6 tier, released 2026-09-22. Strict JSON schema works. **Measured:** 40/40 kept code and links, minimal edits, and once over-claimed a fix in `changed_rules`. |
| Mistral Small 4 | `mistralai/mistral-small-2603` | 0.15 | 0.015 | 0.60 | 183 | 0.75 s | `reasoning_effort` none or high | Open weights, about 6B active. AA calls it "highly concise", which suits minimal edits. Only Mistral serves it. |
| DeepSeek V4.1 Flash | `deepseek/deepseek-v4.1-flash` | 0.15 | 0.003 | 0.60 | 218 | ~1.0 s | reasoning can be disabled | AA calls it "very verbose", a risk for minimal edits. About 30 providers serve it, so pin one with `provider.order`. |
| Gemini 3.5 Flash-Lite | `google/gemini-3.5-flash-lite` | 0.30 | 0.03 | 2.50 | 169 | 0.63 s | `thinking_level` minimal at the lowest, cannot be disabled | Output price is high. |
| Gemini 3.1 Flash-Lite | `google/gemini-3.1-flash-lite` | 0.25 | 0.025 | 1.50 | n/m | n/m | same as 3.5 | GA, cheaper than 3.5. |
| Qwen3.8 Flash | `qwen/qwen3.8-flash` | 0.15 | 0.016 | 0.47 | 47 | 1.78 s | thinks by default. `enable_thinking:false` on DashScope; the OR mapping is **unverified** | Slow. Only Alibaba serves it. |
| Qwen3.7 Flash | `qwen/qwen3.7-flash` | 0.03 | 0.006 | 0.13 | 51–59 | 0.7–1.2 s | thinks by default | Cheapest. p90 latency is 18 s. OR offers `response_format` only, no structured outputs. |
| Claude Haiku 4.5 | `anthropic/claude-haiku-4.5` | 1.00 | 0.10 | 5.00 | 91 | 0.57 s | optional extended thinking | Caching needs at least 4,096 tokens, so this prompt is not cacheable. Costs 10x Luna. |
| gpt-oss-120b | `openai/gpt-oss-120b` @ Cerebras / Groq | 0.35 / 0.15 | 0.35 / 0.075 | 0.75 / 0.60 | 669 / 256 | ~0.25 s | reasoning **mandatory** (low at the lowest) | Fastest option. Forced reasoning adds tokens. |
| GPT-6.1 Sol (strong retry) | `gpt-6.1-sol` (codex-lb) / `openai/gpt-6.1-sol` (slug unverified) | 2.00 | ~0.20 | 10.00 | n/m | **measured** p50 5.1 s | low…ultra | 17 reasoning tokens per call at `low` (measured). |

Unverified:

- OpenRouter speed numbers come from page snippets, because its API returns null for those fields.
- OpenRouter lists `supports_implicit_caching: false` for Luna's OpenAI endpoint, which conflicts with OpenAI's automatic caching. Treat the "cached" column as a best case.
- The OR mappings `reasoning {effort "none"}` for Luna and `reasoning {enabled false}` for Mistral, Qwen, and DeepSeek. BAML sends them as written, but the upstream response was not tested because no OpenRouter key exists here.
- The slug `openai/gpt-6.1-sol` and the GPT-6 Sol price of $2/$10 come from a single source.
- No candidate has a published instruction-following score (IFBench).

---

## 4. Cost and wall-clock per full pass

Assumptions:

- About 3,000 prose blocks, 40% flagged, so **1,200 calls**.
- Each call is about 1,650 tokens in (1,500 static profile and glossary, plus 150 block) and 150 out.
- Totals are 1.98M in and 0.18M out.
- "Cached" means the 1,500-token static prefix is billed at the cache-read price on every call.
- Wall-clock is 1,200 × (TTFT + output tokens ÷ tok/s) ÷ 16, assuming no rate limiting.

| Model | $ per pass, no cache | $ per pass, cached prefix | Wall-clock @16 |
|---|---|---|---|
| **GPT-6 Luna via codex-lb** | **$0 marginal** | n/a (no caching observed) | **4.9 min measured**, 2.8 min with priority tier |
| GPT-6 Luna via OpenAI / OR | $0.29 | $0.13 | ~2.2 min |
| Mistral Small 4 | $0.41 | $0.16 | ~2.0 min |
| DeepSeek V4.1 Flash | $0.41 | $0.14 | ~2.1 min |
| Gemini 3.5 Flash-Lite (+50 thinking tokens) | $1.19 | $0.71 | ~2.3 min |
| Gemini 3.1 Flash-Lite | $0.86 | $0.45 | n/m |
| Qwen3.8 Flash (thinking off) | $0.38 | $0.14 | ~6.2 min |
| Qwen3.7 Flash | $0.08 | $0.04 | ~4.5 min, long p90 tail |
| Claude Haiku 4.5 | $2.88 | $2.88 (below the cache minimum) | ~2.8 min |
| gpt-oss-120b, Groq (+150 reasoning tokens) | $0.51 | $0.38 | ~1.8 min |
| gpt-oss-120b, Cerebras (+150 reasoning tokens) | $0.96 | $0.96 | ~0.9 min |
| Strong retry, GPT-6.1 Sol API, 10–15% of blocks | $0.58–0.86 | lower | adds 1 to 2 min (measured p50 5.1 s on codex-lb) |

Measured codex-lb runs, with a 1,602-token prompt and 16 concurrent calls:

| Model | Tier | Wall time for 16 calls | p50 | Max | Code and links kept | Reasoning tokens |
|---|---|---|---|---|---|---|
| `gpt-6-luna` low | default | 6.27 s | 3.92 s | 6.27 s | 16/16 | 0 |
| `gpt-6-luna` low | priority | 3.45 s | 2.26 s | 3.45 s | 16/16 | 0 |
| `gpt-6.1-sol` low | default, 8 calls | 13.41 s | 5.06 s | 13.41 s | 8/8 | 17 per call |

Bottom line: a full pass costs well under $1 on any sensible cheap model, and Luna on codex-lb costs nothing extra. Wall-clock is 2 to 5 minutes. Latency and edit quality matter more than price.

---

## 5. Design sketch

The draft is `/tmp/ste-research/raw/rewrite.baml`. Its parts:

- **`RewriteBlock(style_profile, glossary, block_kind, block_markdown, findings: Finding[], protected_spans: ProtectedSpan[]) -> RewriteResult`** returns `{ markdown, changed_rules, unfixed_rules, unsure }`.
- **Prompt order is static first, dynamic last.** The system message carries the rules, `ctx.output_format`, the profile, and the glossary, so OpenAI, DeepSeek, and Gemini can reuse the prefix cache. The user message carries the block, the findings, the protected-token legend, and "Reply with the JSON object only."
- **Clients:** `LunaLB`, `SolLB`, `LunaOR`, `MistralSmallOR`, `DeepSeekFlashOR`, and `SolOR`. The composites are `RewriteFast` and `RewriteStrong` (fallback) and `RewriteSpread` (round-robin).
- **Two tests**, one plain and one with placeholders, both with `@@assert`. Both pass on Luna, at 2.9 s and 3.2 s.

The pipeline is sketched in `/tmp/ste-research/raw/rewrite-pipeline.ts`. Per flagged block:

1. **Route.** `buildRoutes()` probes codex-lb and checks `OPENROUTER_API_KEY` through `codecaineEnv`. It then builds `ClientRegistry` fallback chains from the clients that are available. This works around gotcha 1.
2. **Protect.** Replace each inline code span, link, and autolink with `⟦n⟧`, and send a legend so the model still understands the sentence. On restore, each token must appear exactly once. This makes byte-identity hold by construction, not by luck.
3. **Call the fast chain.** Record tokens and the answering client with `Collector`.
4. **Verify.**
   - Restore the tokens.
   - Compare the multiset of code and link runs from `inlineToDelta()` (the converter `docs_write_text` uses) between the old and new text.
   - Reject edits that grow or shrink the text by more than 40%.
   - Re-run `runLintRules` on the patched document. Pass only if the edit introduces no new findings on that block and fixes at least one targeted finding.
   - Ignore `changed_rules`, which Luna over-claimed once in testing.
5. **Retry once on the strong chain** when the call fails, a token is lost, or verification fails. If that also fails, skip the block and keep the reason for the report.
6. **Stage.** Make one `store.stageProposal(path, { summary, expectedHash, ops: updateBlock[] })` per page. Group pages into a changeset for review.
7. **Bound concurrency** with a pool of 16. codex-lb handled 16 with no errors, and priority tier roughly halves latency.

Settings:

- **Temperature:** 0.2 where the route honours it (OpenRouter, and OpenAI with effort `none`). On codex-lb it is not settable.
- **Reasoning:** `low` on codex-lb Luna (0 reasoning tokens measured) and `none` on the API and OpenRouter. Use `low` on Sol for the strong retry.
- **Implementation size:** about 4 to 6 hours for a `packages/docs-rewrite` package. That covers `baml_src`, the generated client, `rewrite-pipeline.ts`, CLI wiring, and BAML plus bun tests, given that the lint engine and proposal store already exist.

Next: copy the `baml_src` folder into docs-system, then run the two BAML tests with `baml-cli test -i "RewriteBlock::"` (about 10 seconds). After that, run a 20-paragraph bake-off on Luna and Mistral Small 4 that diffs code spans, links, and lint results.
