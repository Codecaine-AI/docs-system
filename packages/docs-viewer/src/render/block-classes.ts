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
 *    (paragraph spacing, h1-h3 sizes), the two hosts rendered
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
 * `paragraph` — the `<p>` element. Spacing is 1em of the paragraph's own
 * size (the theme lab's paragraph gap); body ink. Every fallback equals the
 * LIGHT default in semantic.css, so a host without the theme layer (static
 * publish) renders the same page.
 */
export const PARAGRAPH_CLASSES =
  "mt-[calc(var(--docs-paragraph-spacing,1)*1em)] mb-[calc(var(--docs-paragraph-spacing,1)*1em)] text-[length:var(--style-font-size,18px)] leading-[var(--style-line-height,1.45)] text-[color:var(--docs-paragraph-fg,#2a2a2a)] text-pretty";

/**
 * `heading` — what every level shares: weight and ink follow the heading
 * tokens; the font family stays on the rail's heading-font setting.
 * Spacing is per level (HEADING_MAJOR_SPACING / HEADING_MINOR_SPACING), so
 * render through HEADING_LEVEL_CLASSES.
 */
export const HEADING_CLASSES =
  "font-display font-[var(--docs-heading-weight,600)] text-[color:var(--docs-heading-fg,#1f1f1f)] text-balance scroll-mt-8";

/*
 * Heading rhythm: generous space above (a heading closes the previous
 * section), tight below (it owns the next). h1/h2 take the two knobs as-is;
 * h3-h6 take 0.6x of the space above and 2/3 of the space below, so at the
 * defaults an h2 sits 40px under prose and 12px over it, an h3 24px / 8px.
 */
const HEADING_MAJOR_SPACING =
  "mt-[var(--docs-heading-margin-top,40px)] mb-[var(--docs-heading-margin-bottom,12px)]";
const HEADING_MINOR_SPACING =
  "mt-[calc(var(--docs-heading-margin-top,40px)*0.6)] mb-[calc(var(--docs-heading-margin-bottom,12px)*2/3)]";

/**
 * `heading` — the full class string per level. h1-h3 carry a size knob, an em
 * multiplier of the reading size (1.875 / 1.25 / 1: 30 / 20 / 16px at the
 * 16px reading size). h4-h6 render at the reading size and have no size knob.
 */
export const HEADING_LEVEL_CLASSES: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: `${HEADING_CLASSES} ${HEADING_MAJOR_SPACING} text-[length:calc(var(--docs-heading-h1-size,1.875)*1em)] leading-[var(--ds-line-height-tight)] tracking-[var(--ds-letter-spacing-title)]`,
  2: `${HEADING_CLASSES} ${HEADING_MAJOR_SPACING} text-[length:calc(var(--docs-heading-h2-size,1.25)*1em)] leading-[var(--ds-line-height-tight)] tracking-[var(--ds-letter-spacing-title)]`,
  3: `${HEADING_CLASSES} ${HEADING_MINOR_SPACING} text-[length:calc(var(--docs-heading-h3-size,1)*1em)] leading-[var(--ds-line-height-reading)] tracking-[var(--ds-letter-spacing-normal)]`,
  4: `${HEADING_CLASSES} ${HEADING_MINOR_SPACING} leading-[var(--ds-line-height-reading)]`,
  5: `${HEADING_CLASSES} ${HEADING_MINOR_SPACING} leading-[var(--ds-line-height-reading)]`,
  6: `${HEADING_CLASSES} ${HEADING_MINOR_SPACING} leading-[var(--ds-line-height-reading)]`,
};

/** `list-item` — the flex row container (registry `div[role=listitem]`, editor `<li>`; `flex` also suppresses the `<li>`'s native marker). The item gap and text color follow the list-item tokens. An item that holds child items reads as a label for them (600, ink) — derived in styles/list-markers.css, so authors never bold it by hand. */
export const LIST_ITEM_CLASSES =
  "mt-[var(--docs-list-item-gap,4px)] mb-[var(--docs-list-item-gap,4px)] flex text-[length:var(--style-font-size,18px)] leading-[var(--style-line-height,1.45)] text-[color:var(--docs-list-item-fg,#2a2a2a)]";

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
 * Inline `code` MARK spans (not the code block) — one soft neutral chip for
 * all inline code, no backtick glyphs (hosts that run Tailwind Typography
 * must also suppress its code::before/::after backticks — see
 * docs-workbench index.css). Only the chip's TEXT color varies: the
 * renderers classify the chip's text (components/typed-chip.ts) and add
 * INLINE_CODE_KIND_CLASSES[kind], which sets the private
 * `--docs-chip-kind-fg` this class reads before the plain chip ink. The
 * `--docs-inline-code-*` vars let a themed host restyle it; each fallback
 * is the LIGHT semantic.css default.
 *
 * Size and padding are UNITLESS em multipliers (the component multiplies by
 * 1em), so the chip keeps scaling with the text it sits in — a heading's
 * chip stays proportionally larger than a paragraph's. The weight fallback
 * is `inherit`: the code mark nests INSIDE bold (delta-spans.tsx) and inside
 * headings, and must keep their weight until the knob is moved. The border
 * is 0px wide by default, so the chip is borderless until a theme widens it.
 * A chip never breaks mid-token: the renderers cut its text into nowrap
 * pieces (components/mono-breaks.tsx chipBreaks), so a long path wraps only
 * after a `/ . _ -` between words or at a space; the cloned box decoration
 * keeps the chip whole on each line.
 */
export const INLINE_CODE_CLASSES =
  "not-prose rounded-[var(--docs-inline-code-radius,var(--radius,2px))] border-solid border-[length:var(--docs-inline-code-border-width,0px)] border-[color:var(--docs-inline-code-border,#e6e5e3)] bg-[var(--docs-inline-code-bg,#ebebe9)] px-[calc(var(--docs-inline-code-pad-x,0.35)*1em)] py-[calc(var(--docs-inline-code-pad-y,0.1)*1em)] font-mono text-[length:calc(var(--docs-inline-code-text-size,0.85)*1em)] font-[var(--docs-inline-code-weight,inherit)] text-[color:var(--docs-chip-kind-fg,var(--docs-inline-code-fg,#1f1f1f))] break-normal box-decoration-clone";

/**
 * Typed inline code — per-kind text color for the chip, keyed by
 * `chipKind` (components/typed-chip.ts). Each class sets the private
 * `--docs-chip-kind-fg` that INLINE_CODE_CLASSES (and the workbench's
 * unlayered chip rule) read; `other` sets nothing, so the chip keeps
 * --docs-inline-code-fg. Each kind is its own knob
 * (--docs-inline-code-<kind>-fg); the defaults are VS Code's colors (Light+
 * on the light page, Dark+ on the dark page, semantic.css), and each
 * literal fallback is the Light+ value (type and number darkened for 4.5:1
 * on the chip fill, as in typed-chip.ts). Pointing them all at the chip ink
 * turns typing off.
 */
export const INLINE_CODE_KIND_CLASSES = {
  path: "[--docs-chip-kind-fg:var(--docs-inline-code-path-fg,#a31515)]",
  string: "[--docs-chip-kind-fg:var(--docs-inline-code-string-fg,#a31515)]",
  type: "[--docs-chip-kind-fg:var(--docs-inline-code-type-fg,#22728a)]",
  call: "[--docs-chip-kind-fg:var(--docs-inline-code-call-fg,#795e26)]",
  literal: "[--docs-chip-kind-fg:var(--docs-inline-code-literal-fg,#08794f)]",
  keyword: "[--docs-chip-kind-fg:var(--docs-inline-code-keyword-fg,#0000ff)]",
  prop: "[--docs-chip-kind-fg:var(--docs-inline-code-prop-fg,#001080)]",
  other: "",
} as const;

/**
 * The editor marks a chip's kind with an inline decoration — a span INSIDE
 * the `<code>` mark element — so that span must paint the kind color itself
 * (the custom property it sets does not reach its parent's `color`).
 */
export const INLINE_CODE_KIND_TEXT_CLASSES = "text-[color:var(--docs-chip-kind-fg)]";

/**
 * External link (`link` mark): link color with a solid hairline underline,
 * so a link is told apart from text by shape as well as color.
 */
export const LINK_CLASSES =
  "text-[color:var(--docs-link,#245a81)] [font-weight:inherit] underline decoration-1 decoration-current/35 underline-offset-2 hover:decoration-current";

/**
 * Doc reference (`reference` with kind "doc"): a sans link in the reference
 * color with a DOTTED underline (never color alone, WCAG 1.4.1) that turns
 * solid on hover. The editor chip adds its rail-driven file glyph beside the
 * label (editor/menus/reference-node.tsx); the underline goes on the label.
 */
export const DOC_REFERENCE_CLASSES =
  "cursor-pointer text-[color:var(--docs-ref-color,#245a81)]";
export const DOC_REFERENCE_LABEL_CLASSES =
  "underline decoration-dotted decoration-1 decoration-current/60 underline-offset-3 group-hover:decoration-solid group-hover:decoration-[color:var(--docs-ref-underline-color,currentColor)] hover:decoration-solid hover:decoration-[color:var(--docs-ref-underline-color,currentColor)]";

/**
 * Source reference (`reference` with kind "source"): a MONO link in the
 * reference color on a solid hairline underline, no glyph — the mono face
 * tells it apart from a doc reference, the underline from plain text. Long
 * paths may wrap inside prose.
 */
export const SOURCE_REFERENCE_CLASSES =
  "cursor-pointer font-mono font-[family-name:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace)] text-[0.85em] text-[color:var(--docs-ref-color,#245a81)] no-underline border-b border-solid border-current/35 hover:border-[color:var(--docs-ref-underline-color,currentColor)] wrap-anywhere";

/** `code` — the outer FRAME element on every surface (header band + scroll body live inside it — see components/code/CodeShell.tsx; padding and scrolling moved in there too). Border color/width, radius, background and the code typography follow the per-block-type tokens; the radius falls back to the global `--radius` and the other fallbacks equal the old `border` + `bg-muted/30` + `text-xs leading-[20px]` utilities so unthemed hosts render unchanged; the typography fallbacks are the 13px / 21px stock. */
export const CODE_BLOCK_CLASSES =
  "not-prose my-4 overflow-hidden rounded-[var(--docs-code-radius,var(--radius,2px))] border-[length:var(--docs-code-border-width,1px)] border-[color:var(--docs-code-block-border,var(--border))] bg-[color:var(--docs-code-block-bg,color-mix(in_srgb,var(--muted)_30%,transparent))] font-mono text-[length:var(--docs-code-text-size,13px)] leading-[var(--docs-code-line-height,21px)]";

/** Card container styling for the callout block type's clipboard / no-node-view HTML (the live editor and the read surface render CalloutDocsBlock instead): the one rail note, no box and no fill. */
export const CARD_BASE_CLASSES =
  "not-prose my-4 border-0 border-l-[length:var(--ds-border-width-rail)] border-solid py-0.5 pl-[11px]";

/** Default note tone: the info rail (every tone shares the note; only the rail, glyph and label carry the tone in CalloutDocsBlock). */
export const CARD_TONE_PRIMARY_CLASSES =
  "border-l-[color:var(--docs-callout-info-accent,#0b6e99)]";

/** Decision-tone card — the same neutral card (kept for API compatibility). */
export const CARD_TONE_DECISION_CLASSES = CARD_TONE_PRIMARY_CLASSES;

/** Card container for the callout block type in the editor (semanticNode). */
export const SEMANTIC_CARD_CLASSES = `${CARD_BASE_CLASSES} ${CARD_TONE_PRIMARY_CLASSES}`;

/** Body text inside a card block (the editor's callout node body). Text color follows the callout token; the currentColor fallback preserves the old behavior (inherit). */
export const CARD_BODY_TEXT_CLASSES =
  "font-sans text-[length:var(--style-font-size,18px)] leading-[var(--style-line-height,1.45)] text-[color:var(--docs-callout-fg,currentColor)]";
