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
 *    wash plus a 3px inset gutter rail; pinned targets add a 1.5px ring.
 *  - R4: zebra belongs to code (even lines); prose rows divide with
 *    hairlines and never stripe. Hover/pin highlight overrides both.
 *
 * Theme tokens consumed (all with fixed fallbacks so blocks render in
 * host-neutral contexts without the workbench stylesheet):
 *  --docs-zebra    zebra stripe on even code lines
 *  --docs-link-bg  lit-extent background wash
 *  --docs-link-pin pin/rail accent (gutter rail, ring, lit line numbers)
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
 * Line metric: the 20px code line height is the load-bearing
 * CODE_LINE_HEIGHT_PX constant from ../code/classes (re-exported below);
 * the h-5 / leading-[20px] literals here MUST stay in sync with it.
 */

export { CODE_LINE_HEIGHT_PX } from "../code/classes";

/** Base classes every linkable element carries (rest state). */
export const LINK_TARGET_CLASSES =
  "cursor-pointer transition-[background-color,box-shadow] duration-150 focus-visible:outline-none";

/**
 * Lit (hovered / focused / pinned) target: background wash + 3px inset
 * gutter rail in the pin color. Fallback hues are the approved mockup's
 * paper (light) and ink (dark) values.
 */
export const LINK_TARGET_LIT_CLASSES =
  "bg-[color:var(--docs-link-bg,#eee6d2)] shadow-[inset_3px_0_0_var(--docs-link-pin,#b48f2e)] dark:bg-[color:var(--docs-link-bg,#2b3040)] dark:shadow-[inset_3px_0_0_var(--docs-link-pin,#d4af4a)]";

/** Pinned target: the rail plus a 1.5px ring, both in the pin color (applied after LIT — the combined shadow wins via cn()). */
export const LINK_TARGET_PINNED_CLASSES =
  "shadow-[inset_3px_0_0_var(--docs-link-pin,#b48f2e),0_0_0_1.5px_var(--docs-link-pin,#b48f2e)] dark:shadow-[inset_3px_0_0_var(--docs-link-pin,#d4af4a),0_0_0_1.5px_var(--docs-link-pin,#d4af4a)]";

/** CodeLines scroll container — soft wrap OFF, horizontal scroll (R1 panels never wrap). */
export const CODE_LINES_PANEL_CLASSES = "flex h-full flex-col overflow-x-auto pt-3";

/**
 * CodeLines body: as wide as the widest line (w-max min-w-full) so zebra
 * and lit rows span the full scrolled width. Sets the code typography
 * itself — mono at EXACTLY the 20px line metric (CODE_LINE_HEIGHT_PX).
 */
export const CODE_LINES_BODY_CLASSES = "grid w-max min-w-full font-mono text-xs leading-[20px]";

/** One numbered line row: 20px tall, literal whitespace, no wrap. */
export const NUMBERED_LINE_CLASSES = "flex h-5 items-stretch whitespace-pre leading-[20px]";

/** Zebra tint on even lines (panel-local numbering); a lit row's wash replaces it via cn(). */
export const CODE_LINE_ZEBRA_CLASSES =
  "bg-[color:var(--docs-zebra,color-mix(in_srgb,var(--muted)_20%,transparent))]";

/** Gutter cell: right-aligned local line number behind a hairline rule; numbers are faint gutter fg. */
export const CODE_LINE_GUTTER_CLASSES =
  "mr-3.5 w-11 flex-none select-none border-r border-solid border-[color:var(--docs-code-rule,var(--border))] pr-3 text-right text-[11px] leading-[20px] text-[color:color-mix(in_srgb,var(--docs-code-gutter-fg,var(--muted-foreground))_55%,transparent)]";

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
