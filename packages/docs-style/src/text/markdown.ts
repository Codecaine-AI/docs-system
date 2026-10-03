/**
 * The bridge between block text (delta spans) and inline markdown. The rewrite model, the
 * guardrails, and the report all read and write inline markdown; the docs model stores spans.
 */
import { deltaToMarkdownInline, inlineToDelta, type DeltaSpan, type DocBlock } from "@codecaine-ai/docs-model";

/** A block's text as inline markdown, trimmed. Empty for blocks without text. */
export function blockMarkdown(block: DocBlock | undefined): string {
  return block?.text ? deltaToMarkdownInline(block.text).trim() : "";
}

/** Inline markdown back to delta spans, the same conversion docs_write_text uses. */
export function markdownToSpans(markdown: string): DeltaSpan[] {
  return inlineToDelta(markdown).spans;
}
