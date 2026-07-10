/**
 * Shared text-block class strings — the single source of truth for how the
 * text-block type blocks LOOK, used by BOTH rendering surfaces:
 *
 * - the read/annotate surface: block-registry.ts's block type descriptors (and
 *   the docs-blocks card components they delegate to), and
 * - the edit surface: editor/core/schema.ts's ProseMirror `renderHTML` specs.
 *
 * The registry's utility-class styling is the target look (it already wins
 * over DocPage's `prose prose-sm` cascade on the annotate surface); the
 * editor emits the SAME classes so the same utilities win the same way in
 * edit mode. Change a constant here and both surfaces move together.
 *
 * NOTE: every constant must remain a plain string literal (or a template of
 * literals defined in this file) — the workbench web app's Tailwind build
 * scans this package's source for class tokens (`@source` in index.css), so
 * dynamically-built class names would silently produce no CSS.
 */

/** `paragraph` — the `<p>` element. */
export const PARAGRAPH_CLASSES = "my-3 text-sm leading-[1.7]";

/**
 * `heading` — the `<h1>`-`<h6>` element itself (per-level font sizes still
 * come from the surrounding `prose prose-sm` cascade on both surfaces; these
 * utilities override the cascade's margins/weight/font/color identically).
 */
export const HEADING_CLASSES = "mt-6 mb-3 font-display font-semibold text-foreground";

/** `list-item` — the flex row container (registry `div[role=listitem]`, editor `<li>`; `flex` also suppresses the `<li>`'s native marker). */
export const LIST_ITEM_CLASSES = "my-1 flex gap-2 text-sm leading-[1.7]";

/** `list-item` — the hand-drawn `•` bullet span. */
export const LIST_ITEM_BULLET_CLASSES = "select-none text-muted-foreground";

/** `list-item` — the content column next to the bullet. */
export const LIST_ITEM_CONTENT_CLASSES = "min-w-0 flex-1";

/** `list-item` — the nested-children indent (registry-only wrapper; the editor mirrors it via a scoped CSS rule in the host stylesheet, see index.css). */
export const LIST_ITEM_CHILDREN_CLASSES = "ml-4";

/** `code` — the `<pre>` element (the inner `<code>` is unstyled on both surfaces). */
export const CODE_BLOCK_CLASSES =
  "not-prose my-4 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed";

/** `quote` — the `<blockquote>` element. */
export const QUOTE_CLASSES =
  "my-4 border-l-2 border-primary/40 pl-3 text-sm italic leading-[1.7] text-muted-foreground";

/** Card container chrome for the callout block type (tone fragment appended separately). */
export const CARD_BASE_CLASSES = "not-prose my-4 rounded-md border p-3";

/** Default card tone (callout info/warning/risk/success). */
export const CARD_TONE_PRIMARY_CLASSES = "border-primary/30 bg-primary/5";

/** Decision-tone card (callouts with tone="decision" — e.g. coerced legacy decision blocks). */
export const CARD_TONE_DECISION_CLASSES = "border-primary/25 bg-primary/5";

/** Card container for the callout block type in the editor (semanticNode). */
export const SEMANTIC_CARD_CLASSES = `${CARD_BASE_CLASSES} ${CARD_TONE_PRIMARY_CLASSES}`;

/** Body text inside a card block (the editor's callout node body). */
export const CARD_BODY_TEXT_CLASSES = "font-sans text-sm leading-[1.7]";
