/**
 * Test fixtures for the sweep: tiny pages built inline, and fake adapters that record what they
 * were asked. No network, no disk.
 */
import type { DeltaSpan, DocBlock } from "@codecaine-ai/docs-model";
import { createFakeJudge } from "../judge";
import { createFakeRewriter } from "../rewrite";
import type { JudgeQuestion, MeaningDifference, RewriteRequest, RewriteStrength, SweepPage } from "../types";
import { createFakeVerifier } from "../verify";

export const code = (insert: string): DeltaSpan => ({ insert, attributes: { code: true } });

export function paragraph(id: string, ...text: (string | DeltaSpan)[]): DocBlock {
  return { id, type: "paragraph", props: {}, text: text.map((t) => (typeof t === "string" ? { insert: t } : t)), children: [] };
}

/** A list item and its nested items. The children follow it in the returned array. */
export function listItem(id: string, text: string, ...children: DocBlock[]): DocBlock[] {
  return [{ id, type: "list-item", props: {}, text: [{ insert: text }], children: children.map((child) => child.id) }, ...children];
}

export function heading(id: string, text: string, level: number): DocBlock {
  return { id, type: "heading", props: { level }, text: [{ insert: text }], children: [] };
}

/** A page of top-level blocks. A list item's children follow it in `blocks` and stay nested. */
export function page(pagePath: string, ...blocks: (DocBlock | DocBlock[])[]): SweepPage {
  const all = blocks.flat();
  const nested = new Set(all.flatMap((block) => block.children));
  const root: DocBlock = { id: "root", type: "paragraph", props: {}, children: all.filter((block) => !nested.has(block.id)).map((block) => block.id) };
  return {
    path: pagePath,
    doc: { schemaVersion: 1, id: pagePath.replaceAll("/", ":") || "root", title: "Style Fixture", root: "root", blocks: Object.fromEntries([root, ...all].map((b) => [b.id, b])) },
  };
}

/** A paragraph that joins three clauses with semicolons. Each clause names its subject. */
export const stepsParagraph = (id: string, subject: string) =>
  paragraph(id, `The ${subject} tool reads the page; the ${subject} checker reviews each block; the ${subject} writer saves a report.`);

/** The fix for stepsParagraph: each semicolon becomes a period, and the next clause starts a sentence. */
export function splitClauses(markdown: string): string {
  return markdown.replace(/; (\p{L})/gu, (_, letter: string) => `. ${letter.toUpperCase()}`);
}

/** A block of any rewritable type with one text span. */
export function block(id: string, type: "paragraph" | "callout" | "list-item", text: string): DocBlock {
  return { id, type, props: {}, text: [{ insert: text }], children: [] };
}

/** A fake model that records each request it gets. */
export function recordingRewriter(answer: (request: RewriteRequest, strength: RewriteStrength) => string) {
  const calls: { request: RewriteRequest; strength: RewriteStrength }[] = [];
  const rewriter = createFakeRewriter((request, strength) => {
    calls.push({ request, strength });
    return answer(request, strength);
  });
  return { rewriter, calls };
}

/** A fake Jev that records each question it gets. */
export function recordingJudge(answer: (question: JudgeQuestion) => number) {
  const questions: JudgeQuestion[] = [];
  const judge = createFakeJudge((question) => {
    questions.push(question);
    return answer(question);
  });
  return { judge, questions };
}

/**
 * A fake Jev for runs that should accept rewrites: the fact check passes (P 0), each question in
 * `answers` gets its probability, and every other question gets 0.
 */
export const jev = (answers: Record<string, number> = {}) => recordingJudge((question) => answers[question.question] ?? 0);

/** A fake Sol that records each comparison and answers with `differences` (none means same meaning). */
export function recordingVerifier(differences: (input: { before: string; after: string }) => MeaningDifference[] = () => []) {
  const compared: { before: string; after: string; blockType: string; heading?: string }[] = [];
  const verifier = createFakeVerifier((input) => {
    compared.push(input);
    return differences(input);
  });
  return { verifier, compared };
}

/** A fake Sol that finds every change keeps its meaning. */
export const sameMeaning = createFakeVerifier(() => []);
