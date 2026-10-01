#!/usr/bin/env bun
// Read-only calibration run: judge every block of the given pages with the Jev engine and print
// each rule's answers with probabilities. Calls the live TypeSafe API. Never writes a page.
// Usage: bun packages/docs-mcp/scripts/jev-lint-sample.ts [--batch N] [--max-requests N] [--json out.json] <doc.json|dir>...
// Calibration defaults to one question per request with no request cap. The service caps requests per call.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DocDocument } from "@codecaine-ai/docs-model";
import { createJevEngine, type JevRequestInfo } from "../src/jev-engine";
import { gateThresholdOf, judgmentRules, ruleTargets, type JudgedFinding } from "../src/lint-feedback";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); if (i < 0) return undefined; const [, value] = args.splice(i, 2); return value; };
const batchSize = Number(flag("--batch") ?? 1);
const maxRequests = Number(flag("--max-requests") ?? Infinity);
const jsonOut = flag("--json");
const files = args.flatMap(function walk(path: string): string[] {
  if (statSync(path).isFile()) return path.endsWith("doc.json") ? [path] : [];
  return readdirSync(path).flatMap((name) => name === "node_modules" || name.startsWith(".") ? [] : walk(join(path, name)));
});

const requests: JevRequestInfo[] = [];
const engine = createJevEngine({ batchSize, maxRequests, timeoutMs: 30_000, onRequest: (info) => requests.push(info) });
type Row = JudgedFinding & { page: string };
const rows: Row[] = [];
const pageMs: number[] = [];
for (const file of files) {
  const doc = JSON.parse(readFileSync(file, "utf8")) as DocDocument;
  const all = Object.keys(doc.blocks).filter((id) => id !== doc.root);
  const blockIds = [...new Set(judgmentRules.flatMap((rule) => ruleTargets(rule, doc, all)))];
  const started = performance.now();
  const found = await engine.judge({ doc, blockIds, rules: judgmentRules });
  pageMs.push(performance.now() - started);
  rows.push(...found.map((f) => ({ ...f, page: file })));
}

const short = (s: string, n = 110) => s.replace(/\s+/g, " ").slice(0, n);
for (const rule of judgmentRules) {
  const mine = rows.filter((r) => r.ruleId === rule.id).sort((a, b) => b.probability - a.probability);
  const report = mine.filter((r) => r.probability >= rule.threshold).length;
  const gate = mine.filter((r) => r.probability >= gateThresholdOf(rule)).length;
  console.log(`\n## ${rule.id}  judged=${mine.length} report(>=${rule.threshold})=${report} gate(>=${gateThresholdOf(rule)})=${gate}`);
  for (const r of mine) console.log(`${r.probability.toFixed(2)}  ${r.page.replace(/^.*?docs\//, "").replace("/doc.json", "")}#${r.blockId}  ${r.message === rule.problem ? "" : `[${r.message}] `}${short(r.evidence)}`);
}
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
const pct = (xs: number[], p: number) => sorted(xs)[Math.min(xs.length - 1, Math.floor(p * xs.length))] ?? 0;
const tokens = requests.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0);
console.log(`\nrequests=${requests.length} failed=${requests.filter((r) => r.status !== 200).length} questions=${requests.reduce((s, r) => s + r.questions, 0)} input_tokens=${tokens} output_tokens=${requests.reduce((s, r) => s + (r.outputTokens ?? 0), 0)} cost=$${(tokens * 0.042 / 1e6).toFixed(5)}`);
console.log(`request ms p50=${pct(requests.map((r) => r.ms), 0.5).toFixed(0)} max=${Math.max(...requests.map((r) => r.ms)).toFixed(0)}  page ms p50=${pct(pageMs, 0.5).toFixed(0)} max=${Math.max(...pageMs).toFixed(0)}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ batchSize, rows: rows.map(({ page, blockId, ruleId, probability, message }) => ({ page, blockId, ruleId, probability, message })), requests }, null, 1));
