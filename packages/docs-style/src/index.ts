/**
 * @codecaine-ai/docs-style: the STE writing-style pipeline for the docs corpus.
 * README.md maps the folders, and src/types.ts holds every contract.
 *
 * The interface is small on purpose:
 * - lintStyle(doc) runs Tier 1 on one page.
 * - sweep(options) runs every tier over a set of pages and returns the changes, in memory.
 * - renderReport(result) turns a sweep into the A-B report.
 * - The adapters plug the real services, or fakes, into sweep: createJevJudge, createBamlRewriter,
 *   and createBamlVerifier, or createFakeJudge, createFakeRewriter, and createFakeVerifier.
 */
export * from "./types";
export * as profile from "./profile";
export { styleRules, toLintRule } from "./rules";
export { lintStyle, loadCorpus, pageStats, pickPilotPages, sweep } from "./sweep";
export { createFakeJudge, createJevJudge, judgeBlocks } from "./judge";
export { createBamlRewriter, createFakeRewriter, protectSpans, restoreSpans, rewriteToOps } from "./rewrite";
export { createBamlVerifier, createFakeVerifier } from "./verify";
export { needsReview, verifyRewrite } from "./guardrails";
export { renderReport } from "./report";
