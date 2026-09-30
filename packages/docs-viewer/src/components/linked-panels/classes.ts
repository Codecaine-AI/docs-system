/**
 * Shared class constants for the linked-panels layer — the primitives the
 * state-shape, interaction-surface, and code blocks compose: one linking
 * engine (LinkGroup), numbered code panels (CodeLines/NumberedLine), the
 * L#–# range chip (RangeChip), the uppercase-mono card frame (CardShell),
 * and hairline-divided prose rows (ProseRows).
 *
 * System rules encoded here (approved design, state-shape docs v2):
 *  - R1: every code panel is line-numbered; numbering is local per panel.
 *  - R3: extents are painted, not implied — lit targets get a background
 *    wash plus an inset gutter rail (3px by default); pinned targets add a
 *    ring (1.5px by default).
 *  - R4: zebra belongs to code (even lines); prose rows divide with
 *    hairlines and never stripe. Hover/pin highlight overrides both.
 *
 * Theme tokens consumed (all with fixed fallbacks so blocks render in
 * host-neutral contexts without the workbench stylesheet; the metric
 * fallbacks equal the semantic.css defaults so the style-rail sliders start
 * where the unstyled panel renders):
 *  --docs-zebra                  zebra stripe on even code lines
 *  --docs-link-bg                lit-extent background wash (semantic.css
 *                                mixes it off the pin at --docs-link-wash %)
 *  --docs-link-pin               pin/rail accent (gutter rail, ring, lit numbers)
 *  --docs-link-rail-width        width of the lit target's inset rail
 *  --docs-link-ring-width        width of the pinned target's ring
 *  --docs-link-text-size         CodeLines code text size
 *  --docs-link-line-height       CodeLines row height / leading / zebra period
 *  --docs-link-gutter-text-size  CodeLines line-number size
 *  --docs-link-gutter-width      CodeLines gutter column width
 * plus the existing --docs-code-gutter-fg / --docs-code-rule /
 * --docs-code-annotation-accent family for gutter text, hairlines, and the
 * range chip.
 *
 * NOTE: every constant must remain a plain string literal — the workbench
 * web app's Tailwind build scans this package's source for class tokens
 * (`@source` in index.css), so dynamically-built class names would silently
 * produce no CSS. Compose constants with cn() at usage sites, never by
 * string concatenation here.
 *
 * Line metric: CodeLines rows, leading, and the filler's zebra period all
 * resolve from the ONE --docs-link-line-height token, so they cannot drift
 * apart. Its 20px default equals CODE_LINE_HEIGHT_PX
 * from ../code/classes (re-exported below for callers that want the number).
 */

export { CODE_LINE_HEIGHT_PX } from "../code/classes";

/** Base classes every linkable element carries (rest state). */
export const LINK_TARGET_CLASSES =
  "cursor-pointer transition-[background-color,box-shadow] duration-150 focus-visible:outline-none";

/**
 * Lit (hovered / focused / pinned) target: background wash + inset gutter
 * rail in the pin color, --docs-link-rail-width wide (3px default). Fallback
 * hues are the approved mockup's paper (light) and ink (dark) values.
 */
export const LINK_TARGET_LIT_CLASSES =
  "bg-[color:var(--docs-link-bg,#eee6d2)] shadow-[inset_var(--docs-link-rail-width,3px)_0_0_var(--docs-link-pin,#b48f2e)] dark:bg-[color:var(--docs-link-bg,#2b3040)] dark:shadow-[inset_var(--docs-link-rail-width,3px)_0_0_var(--docs-link-pin,#d4af4a)]";

/** Pinned target: the rail plus a --docs-link-ring-width ring (1.5px default), both in the pin color (applied after LIT — the combined shadow wins via cn()). */
export const LINK_TARGET_PINNED_CLASSES =
  "shadow-[inset_var(--docs-link-rail-width,3px)_0_0_var(--docs-link-pin,#b48f2e),0_0_0_var(--docs-link-ring-width,1.5px)_var(--docs-link-pin,#b48f2e)] dark:shadow-[inset_var(--docs-link-rail-width,3px)_0_0_var(--docs-link-pin,#d4af4a),0_0_0_var(--docs-link-ring-width,1.5px)_var(--docs-link-pin,#d4af4a)]";

/** CodeLines scroll container — soft wrap OFF, horizontal scroll (R1 panels never wrap). */
export const CODE_LINES_PANEL_CLASSES = "flex h-full flex-col overflow-x-auto pt-3";

/**
 * CodeLines body: as wide as the widest line (w-max min-w-full) so zebra
 * and lit rows span the full scrolled width. Sets the code typography
 * itself — mono at the --docs-link-text-size / --docs-link-line-height
 * tokens (12px / 20px by default).
 */
export const CODE_LINES_BODY_CLASSES =
  "grid w-max min-w-full font-mono text-[length:var(--docs-link-text-size,12px)] leading-[var(--docs-link-line-height,20px)]";

/** One numbered line row: one line-height token tall, literal whitespace, no wrap. */
export const NUMBERED_LINE_CLASSES =
  "flex h-[var(--docs-link-line-height,20px)] items-stretch whitespace-pre leading-[var(--docs-link-line-height,20px)]";

/** Zebra tint on even lines (panel-local numbering); a lit row's wash replaces it via cn(). */
export const CODE_LINE_ZEBRA_CLASSES =
  "bg-[color:var(--docs-zebra,color-mix(in_srgb,var(--muted)_20%,transparent))]";

/** Gutter cell: right-aligned local line number behind a hairline rule; numbers are faint gutter fg. Column width and number size are the --docs-link-gutter-* tokens. */
export const CODE_LINE_GUTTER_CLASSES =
  "mr-3.5 w-[var(--docs-link-gutter-width,44px)] flex-none select-none border-r border-solid border-[color:var(--docs-code-rule,var(--border))] pr-3 text-right text-[length:var(--docs-link-gutter-text-size,11px)] leading-[var(--docs-link-line-height,20px)] text-[color:color-mix(in_srgb,var(--docs-code-gutter-fg,var(--muted-foreground))_55%,transparent)]";

/**
 * CodeLines filler: the zebra rhythm continued past the last line down to
 * the panel's bottom edge, as one-line bands of the SAME stripe color and
 * line-height token the rows use. Two literals because the first band is
 * line n+1: EVEN starts tinted, ODD starts clear.
 */
export const CODE_LINES_FILLER_CLASSES = "relative min-h-3 flex-1";
export const CODE_LINES_FILLER_EVEN_CLASSES =
  "bg-[repeating-linear-gradient(to_bottom,var(--docs-zebra,color-mix(in_srgb,var(--muted)_20%,transparent))_0px,var(--docs-zebra,color-mix(in_srgb,var(--muted)_20%,transparent))_var(--docs-link-line-height,20px),transparent_var(--docs-link-line-height,20px),transparent_calc(var(--docs-link-line-height,20px)*2))]";
export const CODE_LINES_FILLER_ODD_CLASSES =
  "bg-[repeating-linear-gradient(to_bottom,transparent_0px,transparent_var(--docs-link-line-height,20px),var(--docs-zebra,color-mix(in_srgb,var(--muted)_20%,transparent))_var(--docs-link-line-height,20px),var(--docs-zebra,color-mix(in_srgb,var(--muted)_20%,transparent))_calc(var(--docs-link-line-height,20px)*2))]";

/** The gutter rule continued through the CodeLines filler — MUST share the gutter cell's width token so the hairline runs unbroken to the panel's bottom edge. */
export const CODE_LINES_FILLER_RULE_CLASSES =
  "absolute inset-y-0 left-0 w-[var(--docs-link-gutter-width,44px)] border-r border-solid border-[color:var(--docs-code-rule,var(--border))]";

/** Gutter number of a LIT line: pin color + bold. */
export const CODE_LINE_GUTTER_LIT_CLASSES =
  "font-bold text-[color:var(--docs-link-pin,#b48f2e)] dark:text-[color:var(--docs-link-pin,#d4af4a)]";

/** Line text cell (literal whitespace inherited from the row; right padding so the last glyph never touches the scroll edge). */
export const CODE_LINE_TEXT_CLASSES = "pr-4";

/** The L#–# range chip: small bold mono in the shared annotation accent. */
export const RANGE_CHIP_CLASSES =
  "whitespace-nowrap font-mono text-[10.5px] font-bold tracking-[0.02em] text-[color:var(--docs-code-annotation-accent,#0ea5e9)]";

/** CardShell frame: rounded bordered card; overflow-hidden so panels clip to the radius. */
export const CARD_SHELL_CLASSES = "overflow-hidden rounded-lg border bg-background";

/** CardShell header bar: uppercase mono, left label + optional right legend, hairline bottom rule over a faint wash. */
export const CARD_SHELL_BAR_CLASSES =
  "flex items-center justify-between gap-3 border-b border-solid border-[color:var(--docs-code-rule,var(--border))] bg-[color:color-mix(in_srgb,var(--muted)_30%,transparent)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground";

/** Prose note stacks (R4): hairline divider between rows — never zebra. */
export const PROSE_ROWS_CLASSES =
  "grid divide-y divide-solid divide-[color:var(--docs-code-rule,var(--border))]";
