// rewrite.baml: draft for tier 3 of docs-system writing enforcement.
// Rewrites ONE prose block that failed deterministic lints or Jev rules.
// Verified 2026-10-02: compiles with baml-cli 0.222.0 (`baml-cli generate`), and the
// LunaLB path passes `baml-cli test` against the local codex-lb proxy.
//
// Layout in docs-system (proposed): packages/docs-rewrite/baml_src/{clients,rewrite,generators}.baml
// Pattern copied from canvas/packages/eval-suite/runner/baml_src/clients.baml (openai-generic -> codex-lb).

// ---------------------------------------------------------------------------
// Retry + timeouts
// ---------------------------------------------------------------------------

retry_policy RewriteRetry {
  max_retries 2
  strategy {
    type exponential_backoff
    delay_ms 300
    multiplier 2
    max_delay_ms 8000
  }
}

// ---------------------------------------------------------------------------
// Leaf clients
// ---------------------------------------------------------------------------

// PRIMARY (local): GPT-6 Luna through the codex-lb proxy (ChatGPT-account pool, OpenAI-compatible).
// codex-lb strips temperature/top_p/max_output_tokens. It advertises efforts low..max for Luna,
// and also accepted "none" in a live test. "low" produced 0 reasoning tokens in the 2026-10-02 runs.
client<llm> LunaLB {
  provider "openai-generic"
  retry_policy RewriteRetry
  options {
    base_url "http://127.0.0.1:2455/v1"
    api_key env.CODEX_LB_API_KEY
    model "gpt-6-luna"
    reasoning_effort "low"
    // service_tier "priority"   // measured p50 2.3s vs 3.9s at 16-way. Uses more ChatGPT quota.
    response_format { type "json_object" }
    http {
      connect_timeout_ms 3000
      time_to_first_token_timeout_ms 15000
      request_timeout_ms 30000
    }
  }
}

// STRONG RETRY (local): GPT-6.1 Sol, low effort. Used only after a Luna result fails verification.
client<llm> SolLB {
  provider "openai-generic"
  retry_policy RewriteRetry
  options {
    base_url "http://127.0.0.1:2455/v1"
    api_key env.CODEX_LB_API_KEY
    model "gpt-6.1-sol"
    reasoning_effort "low"
    response_format { type "json_object" }
    http {
      connect_timeout_ms 3000
      request_timeout_ms 60000
    }
  }
}

// PORTABLE PRIMARY (CI / no codex-lb): GPT-6 Luna on OpenRouter. On OpenAI, temperature only works with effort none.
// UNVERIFIED at runtime (no OPENROUTER_API_KEY on this machine): the `reasoning` object shape.
client<llm> LunaOR {
  provider "openrouter"            // defaults: base_url https://openrouter.ai/api/v1, api_key env.OPENROUTER_API_KEY
  retry_policy RewriteRetry
  options {
    model "openai/gpt-6-luna"
    temperature 0.2
    reasoning { effort "none" }
    response_format { type "json_object" }
    headers {
      "HTTP-Referer" "https://github.com/codecaine-ai/docs-system"
      "X-Title" "codecaine-docs-rewrite"
    }
    http {
      connect_timeout_ms 3000
      request_timeout_ms 30000
    }
  }
}

// CROSS-VENDOR FALLBACK: Mistral Small 4 (open weights, concise, ~183 tok/s, $0.15/$0.60).
client<llm> MistralSmallOR {
  provider "openrouter"
  retry_policy RewriteRetry
  options {
    model "mistralai/mistral-small-2603"
    temperature 0.2
    reasoning { enabled false }      // UNVERIFIED mapping to Mistral reasoning_effort "none"
    // No response_format on non-OpenAI OpenRouter routes: support is uneven across upstreams
    // (linkt insurance engine saw json_schema blank out values). BAML's prompt schema + parser suffices.
    headers {
      "HTTP-Referer" "https://github.com/codecaine-ai/docs-system"
      "X-Title" "codecaine-docs-rewrite"
    }
    http {
      connect_timeout_ms 3000
      request_timeout_ms 30000
    }
  }
}

// ALTERNATIVE CHEAP ROUTE: DeepSeek V4.1 Flash, non-reasoning, pinned to the first-party endpoint
// (about 30 OpenRouter providers serve it; pinning keeps behaviour stable). Verified: the `provider`
// routing object passes through BAML into the request body unchanged.
client<llm> DeepSeekFlashOR {
  provider "openrouter"
  retry_policy RewriteRetry
  options {
    model "deepseek/deepseek-v4.1-flash"
    temperature 0.2
    reasoning {
      enabled false
    }
    provider {
      order ["deepseek"]
      allow_fallbacks false
    }
    http {
      connect_timeout_ms 3000
      request_timeout_ms 30000
    }
  }
}

// STRONG RETRY (portable). Slug UNVERIFIED. Swap for any mid-tier model you trust.
client<llm> SolOR {
  provider "openrouter"
  retry_policy RewriteRetry
  options {
    model "openai/gpt-6.1-sol"
    reasoning { effort "low" }
    response_format { type "json_object" }
    http {
      connect_timeout_ms 3000
      request_timeout_ms 60000
    }
  }
}

// ---------------------------------------------------------------------------
// Composite clients
// ---------------------------------------------------------------------------
// Fallback only fires on transport/HTTP/timeout errors after the leaf's retries.
// GOTCHA (verified): BAML resolves env vars for EVERY client in the chain up front. With
// OPENROUTER_API_KEY unset, RewriteFast fails before LunaLB is even tried. Either set all keys, or
// build the chain at runtime with ClientRegistry from the keys that exist (see rewrite-pipeline.ts).
// BAML parse/assert failures and finish_reason violations do NOT trigger fallback, so the
// "verify failed -> stronger model" step lives in TypeScript (pass `{ client: "RewriteStrong" }`).

client<llm> RewriteFast {
  provider fallback
  options {
    strategy [LunaLB, LunaOR, MistralSmallOR]
    http { total_timeout_ms 90000 }
  }
}

client<llm> RewriteStrong {
  provider fallback
  options {
    strategy [SolLB, SolOR]
  }
}

// Optional: spread load across equivalent cheap routes (rotates after each call and each retry).
client<llm> RewriteSpread {
  provider round-robin
  options {
    strategy [LunaOR, MistralSmallOR, DeepSeekFlashOR]
    start 0
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

class Finding {
  rule_id string
  message string
  evidence string? @description("Exact text span the rule flagged, if any")
  fix string? @description("The rule's fix hint")
}

class ProtectedSpan {
  token string @description("Placeholder as it appears in the block, e.g. ⟦1⟧")
  kind "code" | "link" | "math" | "ref"
  original string @description("Original markdown the placeholder stands for, for meaning only")
}

class RewriteResult {
  markdown string @description("The rewritten block as inline markdown, with every protected placeholder, inline code span and link kept exactly")
  changed_rules string[] @description("rule_id of each finding the rewrite fixes")
  unfixed_rules string[] @description("rule_id of each finding left unfixed because fixing it would change meaning or protected text")
  unsure bool @description("true if any edit might change technical meaning, or the block should be left for a human")
}

// ---------------------------------------------------------------------------
// Function
// ---------------------------------------------------------------------------
// Prompt order puts all static text (rules, output format, style profile, glossary) in the system
// message so providers with automatic prefix caching (OpenAI >=1024 tok, DeepSeek, Gemini implicit)
// can reuse it across the 1,200 calls in a pass. Dynamic input goes last.

function RewriteBlock(
  style_profile: string,
  glossary: string,
  block_kind: string,
  block_markdown: string,
  findings: Finding[],
  protected_spans: ProtectedSpan[]
) -> RewriteResult {
  client RewriteFast
  prompt #"
    {{ _.role("system") }}
    You are a copy editor for technical documentation. You receive ONE markdown block and the
    style findings it failed. Rewrite the block so each finding is fixed, and change nothing else.

    Hard rules:
    1. Keep every inline code span (`...`), every link [text](url), every autolink, and every
       placeholder token like ⟦1⟧ byte-for-byte identical. Each one must appear exactly as often as
       in the input. You may move one within the sentence, but never edit, split, merge, or drop it.
    2. Keep the technical meaning, facts, numbers, names and glossary terms. Do not add claims,
       examples, hedges or new information.
    3. Keep the block's form: a heading stays a heading line, a list item stays one item, a
       paragraph stays a paragraph. Do not add markdown structure (no new lists, headings, bold).
    4. Make the smallest edit that fixes the findings. If text is not covered by a finding, leave it.
    5. If a finding cannot be fixed without breaking rules 1 to 3, leave that part, list the rule in
       unfixed_rules, and set unsure to true.

    {{ ctx.output_format }}

    <style_profile>
    {{ style_profile }}
    </style_profile>

    <glossary>
    {{ glossary }}
    </glossary>

    {{ _.role("user") }}
    <block kind="{{ block_kind }}">
    {{ block_markdown }}
    </block>

    <findings>
    {% for f in findings %}
    - rule: {{ f.rule_id }}
      problem: {{ f.message }}
      flagged: {{ f.evidence or "(whole block)" }}
      fix: {{ f.fix or "(none given)" }}
    {% endfor %}
    </findings>
    {% if protected_spans|length > 0 %}

    <protected_tokens>
    {% for p in protected_spans %}
    - {{ p.token }} = {{ p.kind }}: {{ p.original }}
    {% endfor %}
    </protected_tokens>
    {% endif %}

    Reply with the JSON object only.
  "#
  // ^ The word "JSON" must appear in a USER message: codex-lb maps system messages to Responses
  //   `instructions`, and OpenAI rejects json_object mode when the input messages never say "json".
}

// ---------------------------------------------------------------------------
// Tests (run: baml-cli test --from baml_src -i "RewriteBlock::")
// Note: inline maps in args need commas between fields: { a "x", b "y" }.
// ---------------------------------------------------------------------------

test FillerSemicolonHedge {
  functions [RewriteBlock]
  args {
    style_profile #"
      Write plainly. No filler words (basically, simply, just). No semicolons; split the sentence.
      No hedges (might, perhaps). No intensifiers (really, very). Prefer short active sentences.
    "#
    glossary "docs check: CLI validation command"
    block_kind "paragraph"
    block_markdown #"Basically, the `docs check` command is used in order to validate the page; it is really important that you run it before you call [`docs_end`](../tools#docs_end), since it will catch any issues that might be present."#
    findings [
      { rule_id "filler", message "Remove filler words.", evidence "Basically" },
      { rule_id "wordy-phrase", message "Use a shorter phrase.", evidence "in order to", fix "to" },
      { rule_id "semicolon", message "Split the sentence instead of using a semicolon.", evidence ";" },
      { rule_id "hedge", message "Remove hedging.", evidence "might be" },
      { rule_id "intensifier", message "Remove intensifiers.", evidence "really important" }
    ]
    protected_spans []
  }
  @@assert(code_span_kept, {{ "`docs check`" in this.markdown }})
  @@assert(link_kept, {{ "[`docs_end`](../tools#docs_end)" in this.markdown }})
  @@assert(no_semicolon, {{ ";" not in this.markdown }})
  @@assert(no_filler, {{ "Basically" not in this.markdown }})
}

test PlaceholderMode {
  functions [RewriteBlock]
  args {
    style_profile "Write plainly. No em dashes. Prefer short active sentences."
    glossary ""
    block_kind "list-item"
    block_markdown "The proposal is staged by ⟦1⟧ — and it is then reviewed using ⟦2⟧."
    findings [
      { rule_id "no-em-dash", message "Do not use em dashes.", evidence "—" },
      { rule_id "passive-voice", message "Prefer active voice.", evidence "is staged by" }
    ]
    protected_spans [
      { token "⟦1⟧", kind "code", original "`docs_proposal_stage`" },
      { token "⟦2⟧", kind "link", original "[the review panel](../review)" }
    ]
  }
  @@assert(tokens_kept, {{ "⟦1⟧" in this.markdown and "⟦2⟧" in this.markdown }})
  @@assert(no_em_dash, {{ "—" not in this.markdown }})
}
