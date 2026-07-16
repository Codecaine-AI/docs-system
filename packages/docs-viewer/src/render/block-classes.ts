/**
 * Shared text-block class strings — the single source of truth for how the
 * text-block type blocks LOOK, used by BOTH rendering surfaces:
 *
 * - the read/annotate surface: block-registry.ts's block type descriptors (and
 *   the component cards they delegate to), and
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
export const LIST_ITEM_CLASSES = "my-1 flex text-sm leading-[1.7]";

/**
 * `list-item` — the marker box (Notion metrics: a fixed 24px column with the
 * marker centered, text starting at its right edge; marker inherits the text
 * color). Holds a literal `•` for unordered items; ordered items leave it
 * empty and the number arrives via a CSS counter on
 * `[data-doc-ordered] > [data-doc-list-marker]::before` (host stylesheet —
 * see docs-workbench index.css).
 */
export const LIST_ITEM_BULLET_CLASSES = "w-6 shrink-0 select-none text-center";

/** `list-item` — the content column next to the bullet. */
export const LIST_ITEM_CONTENT_CLASSES = "min-w-0 flex-1";

/** `list-item` — nested-children wrapper (registry-only). No extra indent: a child's own 24px marker box supplies the per-level step, matching Notion (a nested paragraph aligns flush with the parent item's text). */
export const LIST_ITEM_CHILDREN_CLASSES = "";

/**
 * Inline `code` MARK spans (not the code block) — Notion-style chip: soft
 * neutral background, red monospace text, no backtick glyphs (hosts that
 * run Tailwind Typography must also suppress its code::before/::after
 * backticks — see docs-workbench index.css). The `--docs-inline-code-*`
 * vars let a themed host recolor it; the fallbacks are Notion's own values.
 */
export const INLINE_CODE_CLASSES =
  "not-prose rounded bg-[var(--docs-inline-code-bg,rgba(135,131,120,0.15))] px-[0.35em] py-[0.1em] font-mono text-[0.85em] text-[var(--docs-inline-code-fg,#eb5757)]";

/** `code` — the `<pre>` element (the inner `<code>` is unstyled on both surfaces). Border/background follow the per-block-type tokens; the fallbacks equal the old `border` + `bg-muted/30` utilities so unthemed hosts render unchanged. */
export const CODE_BLOCK_CLASSES =
  "not-prose my-4 overflow-auto rounded-md border border-[color:var(--docs-code-block-border,var(--border))] bg-[color:var(--docs-code-block-bg,color-mix(in_srgb,var(--muted)_30%,transparent))] p-3 font-mono text-xs leading-relaxed";

/** `quote` — the `<blockquote>` element. Border/text colors follow the per-block-type tokens; the fallbacks equal the old `border-primary/40` + `text-muted-foreground` utilities. */
export const QUOTE_CLASSES =
  "my-4 border-l-2 border-[color:var(--docs-quote-border,color-mix(in_srgb,var(--primary)_40%,transparent))] pl-3 text-sm italic leading-[1.7] text-[color:var(--docs-quote-fg,var(--muted-foreground))]";

/** Card container styling for the callout block type (tone fragment appended separately). */
export const CARD_BASE_CLASSES = "not-prose my-4 rounded-md border p-3";

/** Default card tone (callout info/warning/risk/success). */
export const CARD_TONE_PRIMARY_CLASSES = "border-primary/30 bg-primary/5";

/** Decision-tone card (callouts with tone="decision" — e.g. coerced legacy decision blocks). */
export const CARD_TONE_DECISION_CLASSES = "border-primary/25 bg-primary/5";

/** Card container for the callout block type in the editor (semanticNode). */
export const SEMANTIC_CARD_CLASSES = `${CARD_BASE_CLASSES} ${CARD_TONE_PRIMARY_CLASSES}`;

/** Body text inside a card block (the editor's callout node body). Text color follows the callout token; the currentColor fallback preserves the old behavior (inherit). */
export const CARD_BODY_TEXT_CLASSES =
  "font-sans text-sm leading-[1.7] text-[color:var(--docs-callout-fg,currentColor)]";
