/**
 * Prose helpers every rule shares. Prose extraction and sentence splitting come from docs-model,
 * so this package sees exactly the text the core lint rules see.
 */
export {
  authoredProse,
  excludedBlockIds,
  proseText,
  sentences,
  wordCount,
  type ProseField,
} from "@codecaine-ai/docs-model/writing/prose";
export { steWordCount } from "./words";
export { tag, type Token } from "./tagger";
export { blockMarkdown, markdownToSpans } from "./markdown";
// Page context for judge states: the heading above a block, and a block's sentences.
export * from "./context";
// Instruction detection: procedural.ts favors precision (Tier 1), imperative.ts favors recall (Tier 2 selection).
export * from "./procedural";
export * from "./imperative";
// Sentence fields that skip titles, headings, column headers, and label bullets.
export * from "./sentence-fields";
// Mentions: quoted text names a word without using it.
export * from "./quotes";
// Verb forms: be and have forms, and past participles.
export * from "./verbs";
// Safe span edits and inflection, used by autofix.
export * from "./span-edit";
export * from "./inflect";
// The meaning view of a change, with link and reference targets and bullet depth: the fact check,
// the meaning verifier, and the autofix checks all read this one form.
export * from "./meaning-markdown";
