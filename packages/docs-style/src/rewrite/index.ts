/**
 * Tier 3 rewrite: protect a block's spans, ask a model for the smallest fixing edit, restore the
 * spans, and turn the result into doc ops. The Rewriter adapters are the BAML client (real runs)
 * and a fake (tests).
 */
export { protectSpans, restoreSpans } from "./protect";
export { rewriteToOps } from "./ops";
export { createBamlRewriter } from "./baml";
export { createFakeRewriter } from "./fake";
export { RewriteAnswerError } from "./answer";
