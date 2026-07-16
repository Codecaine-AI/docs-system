"use client";

/**
 * Aggregator for the rich-text component's ProseMirror editor nodes — each
 * sub-component lives in its own file (paragraph.tsx, heading.tsx, ...)
 * holding BOTH its editor node and its read-surface descriptor, so
 * adjusting one block type touches exactly one file. This module's export
 * set is pinned to exactly the block nodes by editor-nodes-sync.test.ts
 * (marks live in editor-marks.ts for that reason).
 *
 * Schema shape shared by all text-bearing nodes ("docBlockText block*",
 * the wrapper, atom leaves): see editor/core/schema.ts's module doc.
 */

export { DocParagraph } from "./paragraph";
export { DocHeading } from "./heading";
export { DocListItem } from "./list-item";
export { DocQuote } from "./quote";
export { DocCallout } from "./callout";
export { DocDivider } from "./divider";
export { DocImage } from "./image";
export { DocVideo } from "./video";
