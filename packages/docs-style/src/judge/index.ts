/**
 * Tier 2: the Judge adapters (Jev over HTTP, and a fake for tests) and judgeBlocks, which asks
 * each rule's yes/no question about the blocks it applies to.
 */
export { createJevJudge } from "./jev";
export { createFakeJudge } from "./fake";
export { judgeBlocks } from "./judge-blocks";
