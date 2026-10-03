// Model clients for the Tier 3 rewrite.
//
// These static clients serve `baml-cli test` only. At runtime, src/rewrite/baml.ts builds the
// same clients with ClientRegistry from the routes that exist. A BAML fallback chain resolves
// the env var of every client in it up front, so a missing OPENROUTER_API_KEY would break a
// static chain even when codex-lb is up. There is deliberately no fallback client here.
//
// Routes:
//   codex-lb    local proxy over pooled ChatGPT accounts, http://127.0.0.1:2455/v1. It accepts
//               the placeholder key "sk-clb-local" and strips temperature.
//   OpenRouter  the portable route, used only when codex-lb is unreachable and
//               OPENROUTER_API_KEY is set.

// Retries cover network, HTTP, and timeout errors. Bad output never triggers a retry here.
// The TypeScript sweep retries on the strong client when a rewrite fails a guardrail.
retry_policy RewriteRetry {
  max_retries 2
  strategy {
    type exponential_backoff
    delay_ms 300
    multiplier 2
    max_delay_ms 8000
  }
}

// Fast: GPT-6 Luna through codex-lb. Effort "low" spent 0 reasoning tokens in the 2026-10-02 runs.
// json_object mode through codex-lb needs the word "json" in a user message (see rewrite.baml).
client<llm> LunaLB {
  provider "openai-generic"
  retry_policy RewriteRetry
  options {
    base_url "http://127.0.0.1:2455/v1"
    api_key "sk-clb-local"
    model "gpt-6-luna"
    reasoning_effort "low"
    response_format { type "json_object" }
    // Only a finished reply counts: a reply cut off at "length" fails instead of parsing as text.
    finish_reason_allow_list ["stop"]
    http {
      connect_timeout_ms 3000
      request_timeout_ms 30000
    }
  }
}

// Strong: GPT-6.1 Sol through codex-lb, for the one retry after a fast rewrite fails a guardrail.
client<llm> SolLB {
  provider "openai-generic"
  retry_policy RewriteRetry
  options {
    base_url "http://127.0.0.1:2455/v1"
    api_key "sk-clb-local"
    model "gpt-6.1-sol"
    reasoning_effort "low"
    response_format { type "json_object" }
    // Only a finished reply counts: a reply cut off at "length" fails instead of parsing as text.
    finish_reason_allow_list ["stop"]
    http {
      connect_timeout_ms 3000
      request_timeout_ms 60000
    }
  }
}

// Fast, portable: GPT-6 Luna on OpenRouter. OpenAI honours temperature only with effort "none".
// Unverified at runtime: no OPENROUTER_API_KEY existed on the build machine.
client<llm> LunaOR {
  provider "openai-generic"
  retry_policy RewriteRetry
  options {
    base_url "https://openrouter.ai/api/v1"
    api_key env.OPENROUTER_API_KEY
    model "openai/gpt-6-luna"
    temperature 0.2
    reasoning { effort "none" }
    response_format { type "json_object" }
    // Only a finished reply counts: a reply cut off at "length" fails instead of parsing as text.
    finish_reason_allow_list ["stop"]
    headers {
      "HTTP-Referer" "https://github.com/codecaine-ai/docs-system"
      "X-Title" "codecaine-docs-style"
    }
    http {
      connect_timeout_ms 3000
      request_timeout_ms 30000
    }
  }
}

// Strong, portable: GPT-6.1 Sol on OpenRouter. The slug is unverified.
client<llm> SolOR {
  provider "openai-generic"
  retry_policy RewriteRetry
  options {
    base_url "https://openrouter.ai/api/v1"
    api_key env.OPENROUTER_API_KEY
    model "openai/gpt-6.1-sol"
    reasoning { effort "low" }
    response_format { type "json_object" }
    // Only a finished reply counts: a reply cut off at "length" fails instead of parsing as text.
    finish_reason_allow_list ["stop"]
    headers {
      "HTTP-Referer" "https://github.com/codecaine-ai/docs-system"
      "X-Title" "codecaine-docs-style"
    }
    http {
      connect_timeout_ms 3000
      request_timeout_ms 60000
    }
  }
}

// Meaning verifier: GPT-6.1 Sol through codex-lb at reasoning "medium", with a strict JSON schema
// so the reply always has the MeaningCheck shape. src/verify/baml.ts builds the same client at
// runtime; this one serves `baml-cli test`.
client<llm> SolVerifyLB {
  provider "openai-generic"
  retry_policy RewriteRetry
  options {
    base_url "http://127.0.0.1:2455/v1"
    api_key "sk-clb-local"
    model "gpt-6.1-sol"
    reasoning_effort "medium"
    response_format {
      type "json_schema"
      json_schema {
        name "meaning_check"
        strict true
        schema {
          type "object"
          additionalProperties false
          required ["differences", "same"]
          properties {
            differences {
              type "array"
              items {
                type "object"
                additionalProperties false
                required ["kind", "before", "after", "why"]
                properties {
                  kind {
                    type "string"
                    "enum" ["fact", "number", "name", "condition", "limit", "modality", "scope", "relation", "reference", "hierarchy", "emphasis", "added", "other"]
                  }
                  before { type "string" }
                  after { type "string" }
                  why { type "string" }
                }
              }
            }
            same { type "boolean" }
          }
        }
      }
    }
    // Only a finished reply counts: a reply cut off at "length" fails instead of parsing as text.
    finish_reason_allow_list ["stop"]
    http {
      connect_timeout_ms 3000
      request_timeout_ms 180000
    }
  }
}
