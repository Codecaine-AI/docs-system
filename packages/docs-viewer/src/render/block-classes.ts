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

/**
 * Doc-surface typography wrapper — the container class string a host puts
 * around `DocBlockRenderer`/`DocEditor` so a doc reads as a doc. The single
 * source of truth for doc-surface typography: the workbench DocPage imports
 * it around all three of its doc surfaces and the peek panel wraps its
 * preview in it, so every surface renders docs identically by construction.
 */
export const DOC_SURFACE_TYPOGRAPHY_CLASSES =
  "docs-markdown prose prose-sm dark:prose-invert relative max-w-none font-sans text-[length:var(--style-font-size,18px)] leading-[var(--style-line-height,1.45)]";

/*
 * STYLE-RAIL KNOBS ON THE TEXT BLOCKS — two rules the constants below rely on.
 *
 * 1. Margins are written as `mt-[…] mb-[…]`, never `my-[…]`. Tailwind emits
 *    `margin-block` utilities BEFORE the Typography plugin's `.prose` rules
 *    and `margin-top`/`margin-bottom` utilities AFTER them, at the same
 *    specificity. A `my-*` class therefore loses to `prose-sm` on a themed
 *    host (the old `my-3` on `<p>` and `my-4` on `<blockquote>` never applied
 *    there), while the longhand pair wins — which is what lets a spacing
 *    knob take effect.
 *
 * 2. Where a knob replaced a value the Typography plugin used to supply
 *    (paragraph/quote spacing, h1-h3 sizes), the two hosts rendered
 *    DIFFERENT values before the knob existed: the workbench showed the
 *    `prose-sm` value, an unthemed host (static publish, no Typography
 *    plugin, no semantic.css) showed the utility's. Both are preserved: the
 *    workbench default lives in theme/semantic.css (and equals the registry
 *    default in theme-folders.ts), and the `var()` fallback here is the
 *    unthemed value. Those knobs are UNITLESS em multipliers (the class
 *    multiplies by 1em) because the values they replace were em-relative and
 *    must keep scaling with the reading size. Every other knob's fallback
 *    equals its semantic.css default.
 */

/**
 * `paragraph` — the `<p>` element. Spacing fallback 0.6666667em = the 12px
 * (`my-3`) unthemed hosts rendered at the 18px stock size; the workbench
 * default (semantic.css) is 1.1428571em, the `prose-sm` paragraph margin.
 * The color fallback is `currentColor`, i.e. inherit, as before.
 */
export const PARAGRAPH_CLASSES =
  "mt-[calc(var(--docs-paragraph-spacing,0.6666667)*1em)] mb-[calc(var(--docs-paragraph-spacing,0.6666667)*1em)] text-[length:var(--style-font-size,18px)] leading-[var(--style-line-height,1.45)] text-[color:var(--docs-paragraph-fg,currentColor)]";

/**
 * `heading` — the `<h1>`-`<h6>` element itself. Margins, weight and color
 * follow the heading tokens (fallbacks = the old `mt-6 mb-3 font-semibold
 * text-foreground`); the font family stays on the rail's heading-font
 * setting. Use HEADING_LEVEL_CLASSES to render — it adds the per-level size.
 */
export const HEADING_CLASSES =
  "mt-[var(--docs-heading-margin-top,24px)] mb-[var(--docs-heading-margin-bottom,12px)] font-display [font-weight:var(--docs-heading-weight,600)] text-[color:var(--docs-heading-fg,var(--foreground))]";

/**
 * `heading` — the full class string per level. h1-h3 carry a size knob, an em
 * multiplier of the reading size: the workbench defaults (semantic.css) are
 * the `prose-sm` sizes (2.1428571 / 1.4285714 / 1.2857143), and the fallbacks
 * are the browser's own h1-h3 sizes, which is what an unthemed host showed.
 * h4-h6 render at the reading size on both hosts and have no size knob.
 */
export const HEADING_LEVEL_CLASSES: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: `${HEADING_CLASSES} text-[length:calc(var(--docs-heading-h1-size,2)*1em)]`,
  2: `${HEADING_CLASSES} text-[length:calc(var(--docs-heading-h2-size,1.5)*1em)]`,
  3: `${HEADING_CLASSES} text-[length:calc(var(--docs-heading-h3-size,1.17)*1em)]`,
  4: HEADING_CLASSES,
  5: HEADING_CLASSES,
  6: HEADING_CLASSES,
};

/** `list-item` — the flex row container (registry `div[role=listitem]`, editor `<li>`; `flex` also suppresses the `<li>`'s native marker). The item gap and text color follow the list-item tokens (fallbacks = the old `my-1` and inherited color). */
export const LIST_ITEM_CLASSES =
  "mt-[var(--docs-list-item-gap,4px)] mb-[var(--docs-list-item-gap,4px)] flex text-[length:var(--style-font-size,18px)] leading-[var(--style-line-height,1.45)] text-[color:var(--docs-list-item-fg,currentColor)]";

/**
 * `list-item` — the marker box (Notion metrics: a 24px fallback column whose
 * host-controlled width is the per-level indent; marker centered, text starting
 * at its right edge, color inherited). The box stays empty on both list kinds;
 * unordered glyphs and ordered counters arrive via host-stylesheet `::before`
 * rules targeting `[data-doc-list-marker]` (see docs-workbench index.css).
 */
export const LIST_ITEM_BULLET_CLASSES = "w-6 shrink-0 select-none text-center";

/** `list-item` — the content column next to the bullet. */
export const LIST_ITEM_CONTENT_CLASSES = "min-w-0 flex-1";

/** `list-item` — nested-children wrapper (registry-only). No extra indent: a child's own marker box supplies the per-level step, matching Notion (a nested paragraph aligns flush with the parent item's text). */
export const LIST_ITEM_CHILDREN_CLASSES = "";

/**
 * Inline `code` MARK spans (not the code block) — Notion-style chip: soft
 * neutral background, red monospace text, no backtick glyphs (hosts that
 * run Tailwind Typography must also suppress its code::before/::after
 * backticks — see docs-workbench index.css). The `--docs-inline-code-*`
 * vars let a themed host restyle it; the fallbacks are Notion's own values
 * and equal the semantic.css defaults.
 *
 * Size and padding are UNITLESS em multipliers (the component multiplies by
 * 1em), so the chip keeps scaling with the text it sits in — a heading's
 * chip stays proportionally larger than a paragraph's. The weight fallback
 * is `inherit`: the code mark nests INSIDE bold (delta-spans.tsx) and inside
 * headings, and must keep their weight until the knob is moved. The border
 * is 0px wide by default, so the chip is borderless until a theme widens it.
 */
export const INLINE_CODE_CLASSES =
  "not-prose rounded-[var(--docs-inline-code-radius,4px)] border-solid border-[length:var(--docs-inline-code-border-width,0px)] border-[color:var(--docs-inline-code-border,var(--border))] bg-[var(--docs-inline-code-bg,rgba(135,131,120,0.15))] px-[calc(var(--docs-inline-code-pad-x,0.35)*1em)] py-[calc(var(--docs-inline-code-pad-y,0.1)*1em)] font-mono text-[length:calc(var(--docs-inline-code-text-size,0.85)*1em)] [font-weight:var(--docs-inline-code-weight,inherit)] text-[color:var(--docs-inline-code-fg,#eb5757)]";

/** `code` — the outer FRAME element on every surface (header band + scroll body live inside it — see components/code/CodeShell.tsx; padding and scrolling moved in there too). Border color/width, radius, background and the code typography follow the per-block-type tokens; the fallbacks equal the old `rounded-md` + `border` + `bg-muted/30` + `text-xs leading-[20px]` utilities so unthemed hosts render unchanged. */
export const CODE_BLOCK_CLASSES =
  "not-prose my-4 overflow-hidden rounded-[var(--docs-code-radius,6px)] border-[length:var(--docs-code-border-width,1px)] border-[color:var(--docs-code-block-border,var(--border))] bg-[color:var(--docs-code-block-bg,color-mix(in_srgb,var(--muted)_30%,transparent))] font-mono text-[length:var(--docs-code-text-size,12px)] leading-[var(--docs-code-line-height,20px)]";

/**
 * `quote` — the `<blockquote>` element. Every value follows a quote token;
 * the fallbacks equal the old utilities (`my-4 border-l-2 border-primary/40
 * pl-3 text-muted-foreground`, no fill, no vertical padding) so unthemed
 * hosts render unchanged. Spacing is an em multiplier — fallback 0.8888889em
 * = that 16px at the 18px stock size; the workbench default (semantic.css) is
 * 1.3333333em, the `prose-sm` blockquote margin. Text scale multiplies the
 * rail's reading size, so a quote keeps tracking it until the knob moves.
 */
export const QUOTE_CLASSES =
  "mt-[calc(var(--docs-quote-spacing,0.8888889)*1em)] mb-[calc(var(--docs-quote-spacing,0.8888889)*1em)] border-l-[length:var(--docs-quote-border-width,2px)] border-[color:var(--docs-quote-border,color-mix(in_srgb,var(--primary)_40%,transparent))] bg-[color:var(--docs-quote-bg,transparent)] py-[var(--docs-quote-pad-y,0px)] pl-[var(--docs-quote-indent,12px)] text-[length:calc(var(--style-font-size,18px)*var(--docs-quote-text-scale,1))] italic leading-[var(--style-line-height,1.45)] text-[color:var(--docs-quote-fg,var(--muted-foreground))]";

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
  "font-sans text-[length:var(--style-font-size,18px)] leading-[var(--style-line-height,1.45)] text-[color:var(--docs-callout-fg,currentColor)]";
