/**
 * Shared metrics + class constants for the code block's three surfaces —
 * read plain (descriptor.tsx via CodeShell), read annotated
 * (CodeAnnotations.tsx), and edit (editor-node-view.tsx via CodeShell) — so
 * the header row, gutter, zebra striping, and annotation accents look
 * identical everywhere.
 *
 * Design principle: one surface, one accent, interaction reveals the rest.
 * At rest the block is a single quiet surface — no pills, no bands, no
 * tinted cards. Annotated ranges announce themselves with a 2px accent bar
 * and an accent line number only; the tint ("lit" state) appears when a
 * note/range pair is hovered or sticky-clicked.
 *
 * NOTE: every constant must remain a plain string literal — the workbench
 * web app's Tailwind build scans this package's source for class tokens
 * (`@source` in index.css), so dynamically-built class names would silently
 * produce no CSS. Compose constants with cn() at usage sites, never by
 * string concatenation here.
 *
 * Theme tokens consumed (all with fixed fallbacks equal to the semantic.css
 * defaults, so the style-rail sliders start where the unstyled block renders):
 *  - colors: --docs-code-lang-fg, --docs-code-header-fg,
 *    --docs-code-annotation-accent, --docs-code-gutter-fg,
 *    --docs-code-gutter-bg, --docs-code-zebra (+ --docs-code-zebra-opacity),
 *    and the internal rule set --docs-code-rule / --docs-code-rule-width /
 *    --docs-code-rule-opacity;
 *  - metrics: --docs-code-text-size, --docs-code-line-height,
 *    --docs-code-gutter-text-size, --docs-code-gutter-width,
 *    --docs-code-gutter-pad-x, --docs-code-header-height,
 *    --docs-code-header-text-size, --docs-code-header-weight,
 *    --docs-code-pad-x, --docs-code-pad-top, --docs-code-pad-bottom,
 *    --docs-code-note-text-size, --docs-code-notes-width;
 *  - the frame (render/block-classes.ts CODE_BLOCK_CLASSES):
 *    --docs-code-block-bg/border, --docs-code-border-width,
 *    --docs-code-radius.
 * All three surfaces read the SAME vars. The annotated READ surface
 * additionally rides the shared linked-panels tokens (system rule R3):
 * --docs-link-bg / --docs-link-pin / --docs-link-rail-width /
 * --docs-link-ring-width for the lit-extent wash, gutter rail, and pinned
 * ring (via ../linked-panels/classes LINK_TARGET_* constants). Its row stripe
 * (R4) reads --docs-code-zebra like the other two surfaces; that token
 * defaults to the shared --docs-zebra, so the linked-panels zebra knob still
 * drives every code block until the code block's own zebra is set.
 */

/**
 * DEFAULT code line height in px — the fallback of the
 * --docs-code-line-height token. The zebra gradient period, gutter row
 * height, and annotation overlay geometry all resolve from that ONE var
 * (CSS calc at every use site), so they cannot drift apart; JS that needs a
 * number (scroll-into-view) reads the computed var and falls back to this.
 */
export const CODE_LINE_HEIGHT_PX = 20;

/** Grid variant of the frame when a notes aside is present (annotated read + edit). */
export const CODE_FRAME_GRID_CLASSES =
  "lg:grid lg:grid-cols-[minmax(0,1fr)_var(--docs-code-notes-width,320px)]";

/**
 * Internal hairline rules (header bottom rule, code/notes column divider,
 * dividers between notes) all run through ONE standardized token set,
 * mirroring the structured-table rule mechanism (table-classes.ts):
 * width via border-*-[length:var(--docs-code-rule-width,1px)] and color via
 * color-mix over var(--docs-code-rule,var(--border)) at
 * calc(var(--docs-code-rule-opacity,0.5)*100%). The rule reads as one
 * continuous line across both header cells, crossed by the column divider.
 */

/**
 * Header row / code-column header cell: language label (or picker) left,
 * copy button right. Low-profile — no background, subtle bottom rule.
 * Height must stay identical to CODE_NOTES_HEADER_CLASSES so the rule
 * aligns across columns.
 */
export const CODE_HEADER_CLASSES =
  "flex h-[var(--docs-code-header-height,28px)] items-center justify-between border-b border-solid border-b-[length:var(--docs-code-rule-width,1px)] border-b-[color:color-mix(in_srgb,var(--docs-code-rule,var(--border))_calc(var(--docs-code-rule-opacity,0.5)*100%),transparent)] px-2";

/** Notes-column header cell: same height + bottom rule as the code header so the line runs continuously across the block. */
export const CODE_NOTES_HEADER_CLASSES =
  "flex h-[var(--docs-code-header-height,28px)] items-center border-b border-solid border-b-[length:var(--docs-code-rule-width,1px)] border-b-[color:color-mix(in_srgb,var(--docs-code-rule,var(--border))_calc(var(--docs-code-rule-opacity,0.5)*100%),transparent)] px-3";

/**
 * Header label — the language indicator (read: static span; edit: the
 * <select> layers CODE_LANG_SELECT_CLASSES on top) and the notes column's
 * "Notes" label. Quiet muted uppercase text — NO pill: no background, no
 * border. Color, size and weight follow the --docs-code-header-* tokens on
 * every surface. --docs-code-lang-fg is a DIFFERENT knob: the hover /
 * affordance color of the edit picker only (CODE_LANG_SELECT_CLASSES below).
 */
export const CODE_LANG_LABEL_CLASSES =
  "font-display text-[length:var(--docs-code-header-text-size,10px)] [font-weight:var(--docs-code-header-weight,500)] uppercase tracking-wider text-[color:var(--docs-code-header-fg,var(--muted-foreground))]";

/**
 * Edit-surface language picker: same quiet look at rest (transparent, no
 * native affordance); hovering the block reveals the affordance — the text
 * takes --docs-code-lang-fg (the ChevronDown alongside fades in via
 * group-hover/code:opacity-100 at the usage site).
 */
export const CODE_LANG_SELECT_CLASSES =
  "cursor-pointer appearance-none bg-transparent pr-5 transition-colors group-hover/code:text-[color:var(--docs-code-lang-fg,var(--color-text-blue))]";

/** Ghost copy button — invisible until the block is hovered or it is focused. */
export const CODE_COPY_BUTTON_CLASSES =
  "inline-flex items-center gap-1 rounded-sm p-1 font-sans text-[11px] text-[color:var(--docs-code-gutter-fg,var(--muted-foreground))] opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/code:opacity-100";

/**
 * Scroll body under the header row. Top/bottom breathing room are the
 * --docs-code-pad-top (0 by default) / --docs-code-pad-bottom tokens; the
 * padding lives HERE, outside the content wrapper, so the zebra layer (which
 * is absolute inside the wrapper) stays aligned to line 1 at any value.
 */
export const CODE_SCROLL_BODY_CLASSES =
  "overflow-auto pt-[var(--docs-code-pad-top,0px)] pb-[var(--docs-code-pad-bottom,8px)]";

/**
 * Content wrapper inside the scroll body: as wide as the widest line
 * (min-w-full w-max) so the absolute zebra/annotation layers span the full
 * scrolled width. Sets the code typography itself — line-height integrity
 * must not depend on inheritance from prose.
 */
export const CODE_CONTENT_WRAPPER_CLASSES =
  "relative grid w-max min-w-full grid-cols-[var(--docs-code-gutter-width,48px)_1fr] font-mono text-[length:var(--docs-code-text-size,12px)] leading-[var(--docs-code-line-height,20px)]";

/**
 * Gutter column: sticky over horizontal scroll, so its bg must stay OPAQUE —
 * but the default mix matches the block background composited over the page
 * background (var(--muted) 30% over var(--background), mirroring
 * --docs-code-block-bg), so no band is perceptible at rest. The
 * --docs-code-gutter-bg token still lets the style-rail bring the band back.
 */
export const CODE_GUTTER_CLASSES =
  "sticky left-0 z-10 select-none bg-[color:var(--docs-code-gutter-bg,color-mix(in_srgb,var(--muted)_30%,var(--background)))]";

/**
 * One gutter line (per-line divs so annotated lines can restyle their
 * number). Numbers take --docs-code-gutter-fg as-is (themes set the exact
 * line-number color, e.g. Dark+ #858585); only the token-less fallback is
 * the faint 55% muted mix. The
 * transparent border-l-2 reserves the accent bar's width. Row height and
 * leading are the line-height token; number size and right padding are the
 * gutter's own tokens.
 */
export const CODE_GUTTER_LINE_CLASSES =
  "h-[var(--docs-code-line-height,20px)] border-l-2 border-transparent pr-[var(--docs-code-gutter-pad-x,8px)] text-right text-[length:var(--docs-code-gutter-text-size,12px)] leading-[var(--docs-code-line-height,20px)] text-[color:var(--docs-code-gutter-fg,color-mix(in_srgb,var(--muted-foreground)_55%,transparent))]";

/** Gutter line covered by an annotation, AT REST: 2px accent bar + accent number — no bg fill. */
export const CODE_GUTTER_LINE_ANNOTATED_CLASSES =
  "border-[color:var(--docs-code-annotation-accent,#0ea5e9)] font-medium text-[color:var(--docs-code-annotation-accent,#0ea5e9)]";

/** Gutter line of the LIT (hovered or sticky-clicked) annotation pair: accent tint appears. */
export const CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES =
  "bg-[color:color-mix(in_srgb,var(--docs-code-annotation-accent,#0ea5e9)_25%,transparent)]";

/**
 * Zebra striping: ONE absolute layer behind the code column whose gradient
 * period is 2 × the line-height token, aligned to line 1 by construction
 * (the content wrapper has zero top padding). Subtle by default; the
 * --docs-code-zebra color knob (defaulting to the shared --docs-zebra) and
 * the --docs-code-zebra-opacity knob (CSS opacity on this layer) let the
 * rail tune it.
 */
export const CODE_ZEBRA_LAYER_CLASSES =
  "pointer-events-none absolute bottom-0 left-[var(--docs-code-gutter-width,48px)] right-0 top-0 opacity-[var(--docs-code-zebra-opacity,1)] bg-[repeating-linear-gradient(transparent_0_var(--docs-code-line-height,20px),var(--docs-code-zebra,var(--docs-zebra,color-mix(in_srgb,var(--muted)_20%,transparent)))_var(--docs-code-line-height,20px)_calc(var(--docs-code-line-height,20px)*2))]";

/**
 * Absolute overlay over one contiguous annotated line run, AT REST: geometry
 * only, NO tint. The element supplies its run as two unitless custom
 * properties — --docs-code-row-start (0-based first line) and
 * --docs-code-row-span (line count) — and top/height multiply them by the
 * line-height token HERE, so the overlay tracks the knob with the rows.
 */
export const CODE_ANNOTATION_ROW_CLASSES =
  "pointer-events-none absolute left-[var(--docs-code-gutter-width,48px)] right-0 top-[calc(var(--docs-code-line-height,20px)*var(--docs-code-row-start,0))] h-[calc(var(--docs-code-line-height,20px)*var(--docs-code-row-span,1))]";

/** Overlay of the LIT (hovered or sticky-clicked) annotation pair: tint + inset ring. */
export const CODE_ANNOTATION_ROW_LIT_CLASSES =
  "bg-[color:color-mix(in_srgb,var(--docs-code-annotation-accent,#0ea5e9)_20%,transparent)] ring-1 ring-inset ring-[color:color-mix(in_srgb,var(--docs-code-annotation-accent,#0ea5e9)_70%,transparent)]";

/** The code cell (second grid column) — a <pre> so whitespace stays literal with horizontal scroll (soft wrap OFF everywhere). */
export const CODE_CELL_CLASSES = "relative m-0 bg-transparent p-0 px-[var(--docs-code-pad-x,12px)]";

/**
 * Annotated READ surface: the <pre> scroll body holding the per-line rows.
 * Same typography and padding tokens as the content wrapper + scroll body of
 * the other two surfaces (CODE_CONTENT_WRAPPER_CLASSES / CODE_SCROLL_BODY_CLASSES).
 */
export const CODE_ANNOTATED_PRE_CLASSES =
  "m-0 max-h-[440px] overflow-auto p-0 pt-[var(--docs-code-pad-top,0px)] pb-[var(--docs-code-pad-bottom,8px)] font-mono text-[length:var(--docs-code-text-size,12px)] leading-[var(--docs-code-line-height,20px)]";

/** Annotated READ surface: one per-line row (line click target). */
export const CODE_LINE_ROW_CLASSES =
  "grid h-[var(--docs-code-line-height,20px)] grid-cols-[var(--docs-code-gutter-width,48px)_1fr] leading-[var(--docs-code-line-height,20px)]";

/** Annotated READ surface: the line's code text cell — same horizontal padding token as CODE_CELL_CLASSES. */
export const CODE_LINE_TEXT_CELL_CLASSES = "hljs whitespace-pre px-[var(--docs-code-pad-x,12px)]";

/**
 * Annotated READ surface (system rule R4): zebra on ALL even lines —
 * annotated lines included — reading the code block's --docs-code-zebra
 * token exactly like the zebra layer of the other two surfaces (falling back
 * to the shared --docs-zebra, then the muted mix), with the
 * --docs-code-zebra-opacity knob composed in via color-mix. Applied from
 * JS (line % 2 === 0), NOT an even: variant, so a lit extent's wash
 * (LINK_TARGET_LIT_CLASSES, later in the cn() call) replaces the stripe via
 * tailwind-merge instead of losing the specificity fight to a pseudo-class.
 */
export const CODE_LINE_ROW_ZEBRA_CLASSES =
  "bg-[color:color-mix(in_srgb,var(--docs-code-zebra,var(--docs-zebra,color-mix(in_srgb,var(--muted)_20%,transparent)))_calc(var(--docs-code-zebra-opacity,1)*100%),transparent)]";

/**
 * Annotated READ surface, gutter cell of a LIT line (system rule R3): the
 * extent wash layered as a flat background-IMAGE gradient — the sticky
 * cell's background-color must stay opaque under horizontal scroll, and an
 * image composites over it — plus the pin rail at the gutter edge (the
 * row's own inset rail from LINK_TARGET_LIT_CLASSES would hide behind this
 * sticky opaque cell). Pin-color bold numbers come from the shared
 * CODE_LINE_GUTTER_LIT_CLASSES alongside.
 */
export const CODE_GUTTER_LINE_LIT_WASH_CLASSES =
  "bg-[image:linear-gradient(var(--docs-link-bg,#eee6d2),var(--docs-link-bg,#eee6d2))] shadow-[inset_var(--docs-link-rail-width,3px)_0_0_var(--docs-link-pin,#b48f2e)] dark:bg-[image:linear-gradient(var(--docs-link-bg,#2b3040),var(--docs-link-bg,#2b3040))] dark:shadow-[inset_var(--docs-link-rail-width,3px)_0_0_var(--docs-link-pin,#d4af4a)]";

/**
 * Notes aside: right column at lg with the vertical column divider (rule
 * tokens), stacked below at narrow widths with the same rule as a top
 * divider instead. Padding lives on the header cell / notes list, not here,
 * so the notes header cell can align with the code header cell.
 */
export const CODE_NOTES_ASIDE_CLASSES =
  "border-t border-solid border-t-[length:var(--docs-code-rule-width,1px)] border-t-[color:color-mix(in_srgb,var(--docs-code-rule,var(--border))_calc(var(--docs-code-rule-opacity,0.5)*100%),transparent)] bg-background font-sans lg:border-t-0 lg:border-l lg:border-l-[length:var(--docs-code-rule-width,1px)] lg:border-l-[color:color-mix(in_srgb,var(--docs-code-rule,var(--border))_calc(var(--docs-code-rule-opacity,0.5)*100%),transparent)]";

/** The notes list under the notes header cell (p-1 + each note's p-2 keeps note text aligned with the header label's px-3). */
export const CODE_NOTES_LIST_CLASSES = "grid p-1";

/** Hairline divider BETWEEN note items — applied to every note but the first (never around them). */
export const CODE_NOTE_DIVIDER_CLASSES =
  "border-t border-solid border-t-[length:var(--docs-code-rule-width,1px)] border-t-[color:color-mix(in_srgb,var(--docs-code-rule,var(--border))_calc(var(--docs-code-rule-opacity,0.5)*100%),transparent)]";

/**
 * One note in the aside, AT REST: plain text — no card border, no
 * background. Size is the --docs-code-note-text-size token; the 4/3 leading
 * is the ratio the former text-xs utility carried (12px / 16px), kept
 * unitless so the line box scales with the size knob.
 */
export const CODE_NOTE_CLASSES =
  "rounded-sm p-2 text-left text-[length:var(--docs-code-note-text-size,12px)] leading-[calc(4/3)] transition-colors";

/** The LIT (hovered or sticky-clicked) note: subtle accent tint only — no ring, no border. */
export const CODE_NOTE_LIT_CLASSES =
  "bg-[color:color-mix(in_srgb,var(--docs-code-annotation-accent,#0ea5e9)_8%,transparent)]";
