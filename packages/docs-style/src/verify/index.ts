/**
 * The meaning seam: a strong model decides whether a change keeps exactly what a block says, in
 * both directions. The adapters are the BAML client (GPT-6.1 Sol over codex-lb) and a fake.
 */
export { createBamlVerifier, type BamlVerifier, type BamlVerifierOptions, type MeasuredVerdict } from "./baml";
export { createFakeVerifier } from "./fake";
