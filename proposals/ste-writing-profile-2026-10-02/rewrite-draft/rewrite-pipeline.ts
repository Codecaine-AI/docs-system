// rewrite-pipeline.ts: SKETCH of how the docs CLI would drive RewriteBlock (tier 3).
// Proven on 2026-10-02 against baml 0.222.0 + local codex-lb: `{ client: "LunaLB" }` override,
// ClientRegistry fallback built from static client names, and Collector usage.
// Names marked (assumed) are not existing docs-system exports. Look them up before implementing.

import { ClientRegistry, Collector } from "@boundaryml/baml";
import { b } from "../baml_client/index.js";
import type { Finding, ProtectedSpan, RewriteResult } from "../baml_client/types.js";
import { inlineToDelta, runLintRules, writingRules, type DocDocument, type LintFinding } from "@codecaine-ai/docs-model";
import { codecaineEnv } from "./codecaine-env"; // docs-mcp/src/codecaine-env.ts pattern

const CONCURRENCY = 16;

// ---------------------------------------------------------------------------
// 1. Route selection. BAML resolves env for every client in a chain up front, so build the chain
//    only from routes that are actually available.
// ---------------------------------------------------------------------------
async function codexLbUp(): Promise<boolean> {
  try { return (await fetch("http://127.0.0.1:2455/v1/models", { signal: AbortSignal.timeout(1500) })).ok; }
  catch { return false; }
}

export async function buildRoutes() {
  const lb = await codexLbUp();
  const or = Boolean(codecaineEnv("OPENROUTER_API_KEY"));
  const fast = [lb && "LunaLB", or && "LunaOR", or && "MistralSmallOR"].filter(Boolean) as string[];
  const strong = [lb && "SolLB", or && "SolOR"].filter(Boolean) as string[];
  if (!fast.length) throw new Error("No rewrite route: start codex-lb or set OPENROUTER_API_KEY in ~/.config/codecaine/env");
  const env = {
    CODEX_LB_API_KEY: codecaineEnv("CODEX_LB_API_KEY") ?? "sk-clb-local", // local placeholder, same as eval-suite
    OPENROUTER_API_KEY: codecaineEnv("OPENROUTER_API_KEY") ?? "",
  };
  const registry = (chain: string[]) => {
    const r = new ClientRegistry();
    r.addLlmClient("Route", "fallback", { strategy: chain });
    r.setPrimary("Route");
    return r;
  };
  return { fast: registry(fast), strong: strong.length ? registry(strong) : null, env };
}

// ---------------------------------------------------------------------------
// 2. Protect: replace inline code + links with ⟦n⟧ tokens so the model cannot edit them.
//    Read spans from the delta (runs with `code` / `link` attributes), not from regexes.
// ---------------------------------------------------------------------------
type Protected = { masked: string; spans: ProtectedSpan[] };

export function protect(markdown: string): Protected {
  // (assumed) helper: walk inlineToDelta(markdown).ops, and for each maximal run with a code or link
  // attribute, emit its exact source slice. Simplest first cut: a markdown-aware tokenizer that
  // handles multi-backtick spans, [text](url "title"), <autolinks>, and nested `code` in link text.
  const spans: ProtectedSpan[] = [];
  let i = 0;
  const masked = markdown.replace(/(`+)[\s\S]*?\1|\[(?:[^\]\\]|\\.)*\]\((?:[^)\\]|\\.)*\)|<https?:\/\/[^>]+>/g, (orig) => {
    const token = `⟦${++i}⟧`;
    spans.push({ token, kind: orig.startsWith("`") ? "code" : "link", original: orig });
    return token;
  });
  return { masked, spans };
}

export function restore(masked: string, spans: ProtectedSpan[]): string | null {
  // Each token must appear exactly once. Order may change, bytes may not.
  let out = masked;
  for (const s of spans) {
    if (out.split(s.token).length !== 2) return null;
    out = out.replace(s.token, () => s.original);
  }
  return /⟦\d+⟧/.test(out) ? null : out;
}

// ---------------------------------------------------------------------------
// 3. Verify: code/link invariance on the delta, plus a re-lint of the targeted rules.
// ---------------------------------------------------------------------------
function invariantRuns(markdown: string): string[] {
  // Exact sequence of code/link runs from the same converter docs_write_text uses.
  const { ops } = inlineToDelta(markdown) as { ops: Array<{ insert: string; attributes?: Record<string, unknown> }> };
  return ops.filter((o) => o.attributes?.code || o.attributes?.link)
    .map((o) => JSON.stringify([o.insert, o.attributes?.code ?? null, o.attributes?.link ?? null]));
}

type Verdict = { ok: true; markdown: string; remaining: LintFinding[] } | { ok: false; reason: string };

function verify(doc: DocDocument, blockId: string, before: string, after: string, targeted: LintFinding[]): Verdict {
  const a = invariantRuns(before), z = invariantRuns(after);
  if ([...a].sort().join("\n") !== [...z].sort().join("\n")) return { ok: false, reason: "code/link runs changed" };
  if (after.trim() === before.trim()) return { ok: false, reason: "no change" };
  const ratio = after.length / Math.max(1, before.length);
  if (ratio < 0.4 || ratio > 1.4) return { ok: false, reason: `length ratio ${ratio.toFixed(2)}` }; // runaway edits
  const patched = withBlockText(doc, blockId, inlineToDelta(after)); // (assumed) clone + replace one block
  const report = runLintRules(patched, { phase: "check" } as never, writingRules);
  const mine = report.findings.filter((f) => f.blockId === blockId);
  const stillFailing = mine.filter((f) => targeted.some((t) => t.ruleId === f.ruleId));
  const introduced = mine.filter((f) => !targeted.some((t) => t.ruleId === f.ruleId));
  if (introduced.length) return { ok: false, reason: `introduced ${introduced.map((f) => f.ruleId).join(",")}` };
  if (stillFailing.length === targeted.length) return { ok: false, reason: "fixed nothing" };
  return { ok: true, markdown: after, remaining: stillFailing };
}

// ---------------------------------------------------------------------------
// 4. One block: fast model, then the strong model once on failure, then give up (leave for a human).
// ---------------------------------------------------------------------------
export type BlockJob = { path: string; doc: DocDocument; blockId: string; kind: string; markdown: string; findings: LintFinding[] };
export type BlockOutcome =
  | { status: "staged"; job: BlockJob; markdown: string; model: string; remaining: LintFinding[]; unsure: boolean; tokens: [number, number] }
  | { status: "skipped"; job: BlockJob; reason: string; tokens: [number, number] };

export async function rewriteOne(job: BlockJob, routes: Awaited<ReturnType<typeof buildRoutes>>, profile: string, glossary: string): Promise<BlockOutcome> {
  const { masked, spans } = protect(job.markdown);
  const findings: Finding[] = job.findings.map((f) => ({ rule_id: f.ruleId, message: f.message, evidence: f.evidence || null, fix: f.suggestion || null }));
  const tokens: [number, number] = [0, 0];
  let lastReason = "";
  for (const [label, registry] of [["fast", routes.fast], ["strong", routes.strong]] as const) {
    if (!registry) break;
    const collector = new Collector(`rewrite-${job.blockId}-${label}`);
    let res: RewriteResult;
    try {
      res = await b.RewriteBlock(profile, glossary, job.kind, masked, findings, spans, { clientRegistry: registry, collector, env: routes.env });
    } catch (e) {
      lastReason = `call failed: ${(e as Error).message.slice(0, 120)}`; // parse errors land here too
      continue;
    } finally {
      tokens[0] += collector.usage.inputTokens ?? 0;
      tokens[1] += collector.usage.outputTokens ?? 0;
    }
    const restored = restore(res.markdown, spans);
    if (!restored) { lastReason = "placeholder lost or duplicated"; continue; }
    const v = verify(job.doc, job.blockId, job.markdown, restored, job.findings);
    if (!v.ok) { lastReason = v.reason; continue; }
    // Never trust res.changed_rules. In testing, Luna listed "passive-voice" as fixed while passive text remained.
    return { status: "staged", job, markdown: v.markdown, model: collector.last?.calls.find((c) => c.selected)?.clientName ?? label, remaining: v.remaining, unsure: res.unsure, tokens };
  }
  return { status: "skipped", job, reason: lastReason, tokens };
}

// ---------------------------------------------------------------------------
// 5. Whole pass: bounded pool, then one proposal per page (or a changeset across pages).
// ---------------------------------------------------------------------------
export async function rewritePass(jobs: BlockJob[], store: DocsStore, profile: string, glossary: string) {
  const routes = await buildRoutes();
  const outcomes = await pool(jobs, CONCURRENCY, (job) => rewriteOne(job, routes, profile, glossary));
  const byPage = Map.groupBy(outcomes.filter((o) => o.status === "staged"), (o) => o.job.path);
  for (const [path, staged] of byPage) {
    const { hash } = await store.docGet(path); // (assumed) current revision hash
    await store.stageProposal(path, {
      summary: `Style rewrite: ${staged.length} block(s), tier-3 (${[...new Set(staged.map((s) => s.model))].join(", ")})`,
      expectedHash: hash,
      ops: staged.map((s) => ({ type: "updateBlock", blockId: s.job.blockId, text: inlineToDelta(s.markdown).ops })),
    });
  }
  return outcomes; // report: staged / skipped(reason) / unsure, plus summed tokens for cost tracking
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

// (assumed) declarations so the sketch reads cleanly
declare function withBlockText(doc: DocDocument, blockId: string, delta: unknown): DocDocument;
type DocsStore = {
  docGet(path: string): Promise<{ hash: string }>;
  stageProposal(path: string, input: { summary: string; expectedHash: string; ops: unknown[] }): Promise<unknown>;
};
