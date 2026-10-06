/**
 * Shared metrics + class constants for the code block's three surfaces —
 * read plain (descriptor.tsx via CodeShell), read annotated
 * (CodeAnnotations.tsx), and edit (editor-node-view.tsx via CodeShell) — so
 * the header strip, gutter, annotation marks and notes column look identical
 * everywhere. The pseudocode block reuses the header strip.
 *
 * Design (theme lab, App preset): code panels are always dark (the code
 * theme's colors), one quiet panel, no zebra. The header strip carries the
 * code family tile, a 12px lowercase mono language label and an always
 * visible copy button with a focus ring. Annotated ranges show one quiet
 * accent mark between the line number and the code; hovering, focusing or
 * pinning a note/range pair tints the lines, turns their numbers and the
 * mark to the accent, and tints the note. Notes live INSIDE the panel in a
 * slightly lighter notes column behind the internal hairline, each a stacked
 * block (an `L3–5` range chip and the bold title, the body below), beside the
 * code when the block is at least 760px wide and under it otherwise.
 *
 * NOTE: every constant must remain a plain string literal — the workbench
 * web app's Tailwind build scans this package's source for class tokens
 * (`@source` in index.css), so dynamically-built class names would silently
 * produce no CSS. Compose constants with cn() at usage sites, never by
 * string concatenation here.
 *
 * Theme tokens consumed (metric fallbacks equal the semantic.css defaults,
 * so the style-rail sliders start where the unstyled block renders):
 *  - colors: --docs-code-header-bg, --docs-code-header-fg,
 *    --docs-code-lang-fg, --docs-code-annotation-accent,
 *    --docs-code-gutter-fg, --docs-code-gutter-bg, --docs-code-zebra
 *    (+ --docs-code-zebra-opacity), and the internal rule set
 *    --docs-code-rule / --docs-code-rule-width / --docs-code-rule-opacity;
 *  - metrics: --docs-code-text-size, --docs-code-line-height,
 *    --docs-code-gutter-text-size, --docs-code-gutter-width,
 *    --docs-code-gutter-pad-x, --docs-code-header-height,
 *    --docs-code-header-text-size, --docs-code-header-weight,
 *    --docs-code-pad-x, --docs-code-pad-top, --docs-code-pad-bottom,
 *    --docs-code-note-text-size, --docs-code-notes-width;
 *  - the notes column surface --docs-code-notes-bg (unset: the code bg
 *    mixed 6% toward white);
 *  - the frame (render/block-classes.ts CODE_BLOCK_CLASSES):
 *    --docs-code-block-bg/border, --docs-code-border-width,
 *    --docs-code-radius;
 *  - shared role tokens: --docs-fam-code-solid + --docs-tile-glyph (tile),
 *    --docs-focus-ring (focus rings). The notes sit on the code surface, so
 *    --docs-ink / --docs-muted resolve to the panel's inks; their range chip
 *    is linked-panels RangeChip.
 */

/**
 * DEFAULT code line height in px — the fallback of the
 * --docs-code-line-height token. The zebra gradient period, gutter row
 * height, and annotation overlay geometry all resolve from that ONE var
 * (CSS calc at every use site), so they cannot drift apart; JS that needs a
 * number (scroll-into-view) reads the computed var and falls back to this.
 */
export const CODE_LINE_HEIGHT_PX = 21;

/**
 * Wrapper of a code block that has notes: a size container, so the notes
 * column depends on the block's own width, not the viewport. It carries the
 * block's vertical margin (the panel inside drops its own via
 * CODE_FRAME_IN_LAYOUT_CLASSES).
 */
export const CODE_LAYOUT_CLASSES = "not-prose my-4 @container";

/**
 * The panel body under the header strip when notes exist: code | notes side
 * by side from 760px block width, notes under the code below that. Both
 * cells sit INSIDE the dark panel; the notes column draws its own hairline.
 */
export const CODE_BODY_GRID_CLASSES =
  "grid grid-cols-1 @min-[760px]:grid-cols-[minmax(0,1fr)_var(--docs-code-notes-width,280px)]";

/** The panel frame inside a layout: the layout owns the margin. */
export const CODE_FRAME_IN_LAYOUT_CLASSES = "my-0 min-w-0";

/**
 * Header strip: family tile, language label (or the edit picker), copy
 * button pushed right. A 4% ink lift over the panel (the
 * --docs-code-header-bg knob) and the standardized hairline rule beneath.
 */
export const CODE_HEADER_CLASSES =
  "flex h-[var(--docs-code-header-height,32px)] items-center gap-2 border-b border-solid border-b-[length:var(--docs-code-rule-width,1px)] border-b-[color:color-mix(in_srgb,var(--docs-code-rule,var(--border))_calc(var(--docs-code-rule-opacity,0.5)*100%),transparent)] bg-[color:var(--docs-code-header-bg,color-mix(in_srgb,currentColor_4%,transparent))] pl-3 pr-1";

/** The code family tile: a 16px solid tile in the code family hue, glyph in the tile-glyph color. */
export const CODE_TILE_CLASSES =
  "inline-flex h-4 w-4 flex-none items-center justify-center rounded-[var(--ds-radius-base)] bg-[color:var(--docs-fam-code-solid,#0b6e99)] text-[color:var(--docs-tile-glyph,#ffffff)]";

/** The glyph inside the tile (lucide icon; stroke width is set at the usage site). */
export const CODE_TILE_ICON_CLASSES = "h-[11px] w-[11px]";

/**
 * Header label — the language indicator (read: static span; edit: the
 * <select> layers CODE_LANG_SELECT_CLASSES on top). Lowercase mono as
 * authored, 12px by default — never the old 10px caps. Color, size and
 * weight follow the --docs-code-header-* tokens on every surface.
 * --docs-code-lang-fg is a DIFFERENT knob: the hover / affordance color of
 * the edit picker only.
 */
export const CODE_LANG_LABEL_CLASSES =
  "font-mono text-[length:var(--docs-code-header-text-size,12px)] leading-none font-[var(--docs-code-header-weight,400)] text-[color:var(--docs-code-header-fg,var(--muted-foreground))]";

/**
 * Edit-surface language picker: same quiet look at rest (transparent, no
 * native affordance); hovering the block reveals the affordance — the text
 * takes --docs-code-lang-fg (the ChevronDown alongside fades in via
 * group-hover/code:opacity-100 at the usage site). Keyboard focus gets the
 * shared focus ring.
 */
export const CODE_LANG_SELECT_CLASSES =
  "cursor-pointer appearance-none rounded-[var(--radius)] bg-transparent pr-5 transition-colors group-hover/code:text-[color:var(--docs-code-lang-fg,var(--color-text-blue))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--docs-focus-ring,#0078df)]";

/** Copy button: always visible (no hover-only controls), 26px hit area, 2px focus ring. */
export const CODE_COPY_BUTTON_CLASSES =
  "ml-auto inline-flex h-6.5 min-w-6.5 cursor-pointer items-center justify-center gap-1 rounded-[var(--radius,2px)] px-[5px] font-sans text-[length:var(--ds-font-size-ui-xs)] leading-none text-[color:var(--docs-code-header-fg,var(--muted-foreground))] transition-colors hover:bg-current/12 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--docs-focus-ring,#0078df)]";

/** The copy glyph inside the button. */
export const CODE_COPY_ICON_CLASSES = "h-[15px] w-[15px]";

/**
 * Scroll body under the header strip. Top/bottom breathing room are the
 * --docs-code-pad-top / --docs-code-pad-bottom tokens; the padding lives
 * HERE, outside the content wrapper, so the zebra layer (which is absolute
 * inside the wrapper) stays aligned to line 1 at any value.
 */
export const CODE_SCROLL_BODY_CLASSES =
  "overflow-auto pt-[var(--docs-code-pad-top,12px)] pb-[var(--docs-code-pad-bottom,12px)]";

/**
 * Content wrapper inside the scroll body: as wide as the widest line
 * (min-w-full w-max) so the absolute zebra/annotation layers span the full
 * scrolled width. Sets the code typography itself — line-height integrity
 * must not depend on inheritance from prose.
 */
export const CODE_CONTENT_WRAPPER_CLASSES =
  "relative grid w-max min-w-full grid-cols-[var(--docs-code-gutter-width,40px)_1fr] font-mono text-[length:var(--docs-code-text-size,13px)] leading-[var(--docs-code-line-height,21px)]";

/**
 * Gutter column: sticky over horizontal scroll, so its bg must stay OPAQUE;
 * the code theme sets --docs-code-gutter-bg to its own panel color, so no
 * band is perceptible at rest.
 */
export const CODE_GUTTER_CLASSES =
  "sticky left-0 z-10 select-none bg-[color:var(--docs-code-gutter-bg,color-mix(in_srgb,var(--muted)_30%,var(--background)))]";

/**
 * One gutter line. Numbers take --docs-code-gutter-fg as-is (themes set the
 * exact line-number color, e.g. Dark+ #858585 at 4.5:1); the fallback is the
 * light default, which clears 3:1 on a light panel. Row height and leading
 * are the line-height token; number size and right padding are the gutter's
 * own tokens. Callers that need the annotation mark add `relative` (the
 * annotated READ surface's cell is already sticky, which positions it).
 */
export const CODE_GUTTER_LINE_CLASSES =
  "h-[var(--docs-code-line-height,21px)] pr-[var(--docs-code-gutter-pad-x,12px)] text-right text-[length:var(--docs-code-gutter-text-size,12px)] leading-[var(--docs-code-line-height,21px)] tabular-nums text-[color:var(--docs-code-gutter-fg,#888784)]";

/**
 * Gutter line covered by an annotation, AT REST: one quiet 2px mark centered
 * in the gutter's right padding, the accent at 65% (3:1 against the panel).
 * The number keeps the gutter color. The first and last line of each run
 * inset the mark 3px (CODE_GUTTER_MARK_START/END_CLASSES), so two adjacent
 * annotations read as two marks.
 */
export const CODE_GUTTER_LINE_ANNOTATED_CLASSES =
  "after:pointer-events-none after:absolute after:top-0 after:bottom-0 after:right-[calc(var(--docs-code-gutter-pad-x,12px)/2-1px)] after:w-0.5 after:bg-[var(--docs-code-annotation-accent,#0b6e99)]/65";

/** First line of an annotated run: the mark starts 3px below the line top. */
export const CODE_GUTTER_MARK_START_CLASSES = "after:top-[3px] after:rounded-t-[var(--ds-radius-base)]";

/** Last line of an annotated run: the mark stops 3px above the line bottom. */
export const CODE_GUTTER_MARK_END_CLASSES = "after:bottom-[3px] after:rounded-b-[var(--ds-radius-base)]";

/**
 * Gutter line of the LIT (hovered, focused or pinned) pair: accent number,
 * full-accent mark, and the line tint layered as a background IMAGE so the
 * sticky cell's opaque background-color stays under horizontal scroll.
 */
export const CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES =
  "font-semibold text-[color:var(--docs-code-annotation-accent,#0b6e99)] after:bg-[color:var(--docs-code-annotation-accent,#0b6e99)] bg-linear-to-b from-[var(--docs-code-annotation-accent,#0b6e99)]/12 to-[var(--docs-code-annotation-accent,#0b6e99)]/12";

/**
 * Zebra striping: ONE absolute layer behind the code column whose gradient
 * period is 2 × the line-height token, aligned to line 1 by construction.
 * Code never stripes by default (--docs-code-zebra is transparent in both
 * theme blocks); the knob and --docs-code-zebra-opacity can bring it back.
 */
export const CODE_ZEBRA_LAYER_CLASSES =
  "pointer-events-none absolute bottom-0 left-[var(--docs-code-gutter-width,40px)] right-0 top-0 opacity-[var(--docs-code-zebra-opacity,1)] bg-[repeating-linear-gradient(transparent_0_var(--docs-code-line-height,21px),var(--docs-code-zebra,var(--docs-zebra,transparent))_var(--docs-code-line-height,21px)_calc(var(--docs-code-line-height,21px)*2))]";

/**
 * Absolute overlay over one contiguous annotated line run, AT REST: geometry
 * only, NO tint. The element supplies its run as two unitless custom
 * properties — --docs-code-row-start (0-based first line) and
 * --docs-code-row-span (line count) — and top/height multiply them by the
 * line-height token HERE, so the overlay tracks the knob with the rows.
 */
export const CODE_ANNOTATION_ROW_CLASSES =
  "pointer-events-none absolute left-[var(--docs-code-gutter-width,40px)] right-0 top-[calc(var(--docs-code-line-height,21px)*var(--docs-code-row-start,0))] h-[calc(var(--docs-code-line-height,21px)*var(--docs-code-row-span,1))]";

/** Overlay of the LIT pair: the accent at 12% (the lit numbers keep 4.5:1 on it). */
export const CODE_ANNOTATION_ROW_LIT_CLASSES =
  "bg-[var(--docs-code-annotation-accent,#0b6e99)]/12";

/** The code cell (second grid column) — a <pre> so whitespace stays literal with horizontal scroll (soft wrap OFF everywhere). */
export const CODE_CELL_CLASSES = "relative m-0 bg-transparent p-0 px-[var(--docs-code-pad-x,12px)]";

/**
 * Annotated READ surface: the <pre> scroll body holding the per-line rows.
 * Same typography and padding tokens as the content wrapper + scroll body of
 * the other two surfaces (CODE_CONTENT_WRAPPER_CLASSES / CODE_SCROLL_BODY_CLASSES).
 */
export const CODE_ANNOTATED_PRE_CLASSES =
  "m-0 max-h-110 overflow-auto p-0 pt-[var(--docs-code-pad-top,12px)] pb-[var(--docs-code-pad-bottom,12px)] font-mono text-[length:var(--docs-code-text-size,13px)] leading-[var(--docs-code-line-height,21px)]";

/** Annotated READ surface: one per-line row (line click target). */
export const CODE_LINE_ROW_CLASSES =
  "grid h-[var(--docs-code-line-height,21px)] grid-cols-[var(--docs-code-gutter-width,40px)_1fr] leading-[var(--docs-code-line-height,21px)]";

/**
 * Annotated READ surface: an annotated line is a link target (hover, focus,
 * click). Keyboard focus draws the shared 2px focus ring inside the row.
 */
export const CODE_LINE_ROW_LINKABLE_CLASSES =
  "cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--docs-focus-ring,#0078df)]";

/** Annotated READ surface: a LIT line's tint (replaces any zebra stripe via cn()). */
export const CODE_LINE_ROW_LIT_CLASSES =
  "bg-[var(--docs-code-annotation-accent,#0b6e99)]/12";

/** Annotated READ surface: the line's code text cell — same horizontal padding token as CODE_CELL_CLASSES. */
export const CODE_LINE_TEXT_CELL_CLASSES = "hljs whitespace-pre px-[var(--docs-code-pad-x,12px)]";

/**
 * Annotated READ surface: the zebra stripe on even lines, reading the code
 * block's --docs-code-zebra token exactly like the zebra layer of the other
 * two surfaces, with the --docs-code-zebra-opacity knob composed in via
 * color-mix. Transparent by default (code never stripes). Applied from JS
 * (line % 2 === 0) so a lit line's tint replaces it via cn().
 */
export const CODE_LINE_ROW_ZEBRA_CLASSES =
  "bg-[color:color-mix(in_srgb,var(--docs-code-zebra,var(--docs-zebra,transparent))_calc(var(--docs-code-zebra-opacity,1)*100%),transparent)]";

/**
 * Notes column, INSIDE the panel: a surface 6% lighter than the code (the
 * code bg mixed toward white, in both page modes), split from the code by the
 * panel's internal hairline (the header rule's tokens): a left rule beside
 * the code, a top rule under it in a narrow block. Notes stack from the top;
 * the top padding puts the first note's head row on code line 1 (the note's
 * own 8px top padding makes up the rest of --docs-code-pad-top). Consecutive
 * notes are split by a faint hairline: the internal rule at half its opacity.
 */
export const CODE_NOTES_ASIDE_CLASSES =
  "grid min-w-0 content-start gap-1 px-2 pb-3 [&>*+*]:border-0 [&>*+*]:border-solid [&>*+*]:border-t-[length:var(--docs-code-rule-width,1px)] [&>*+*]:border-t-[color:color-mix(in_srgb,var(--docs-code-rule,var(--border))_calc(var(--docs-code-rule-opacity,0.5)*50%),transparent)] pt-[max(0px,calc(var(--docs-code-pad-top,12px)-8px))] font-sans bg-[color:var(--docs-code-notes-bg,color-mix(in_srgb,var(--docs-code-block-bg,#1e1e1e)_94%,#ffffff))] border-0 border-solid border-t-[length:var(--docs-code-rule-width,1px)] border-t-[color:color-mix(in_srgb,var(--docs-code-rule,var(--border))_calc(var(--docs-code-rule-opacity,0.5)*100%),transparent)] @min-[760px]:border-t-0 @min-[760px]:border-l-[length:var(--docs-code-rule-width,1px)] @min-[760px]:border-l-[color:color-mix(in_srgb,var(--docs-code-rule,var(--border))_calc(var(--docs-code-rule-opacity,0.5)*100%),transparent)]";

/**
 * One note, AT REST: a stacked block (head row, then the body), never run
 * in. The whole note is the control: hover/focus lights the pair, click pins
 * it, and keyboard focus draws the shared focus ring.
 */
export const CODE_NOTE_CLASSES =
  "block w-full min-w-0 cursor-pointer rounded-[var(--radius,2px)] px-2 py-2 text-left font-sans transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--docs-focus-ring,#0078df)]";

/** The LIT note: the line tint (accent at 12%) behind it, and its body steps up to the panel ink. */
export const CODE_NOTE_LIT_CLASSES =
  "bg-[var(--docs-code-annotation-accent,#0b6e99)]/12 [&_[data-note-body]]:text-[color:var(--docs-ink,#d4d4d4)]";

/** A note's head row: the range chip and the title, on one code-line-high row. */
export const CODE_NOTE_HEAD_CLASSES =
  "flex min-w-0 items-baseline gap-2 leading-[var(--docs-code-line-height,21px)]";

/** The range chip in the head row: the head's gap replaces its own margin. */
export const CODE_NOTE_CHIP_CLASSES = "mr-0 flex-none";

/** A note's title: bold, the panel ink, 1px over the body size. */
export const CODE_NOTE_LABEL_CLASSES =
  "min-w-0 text-[length:calc(var(--docs-code-note-text-size,13px)+1px)] font-semibold text-[color:var(--docs-ink,#d4d4d4)]";

/** A note's body, on its own lines under the head: smaller sans in the panel's muted ink. */
export const CODE_NOTE_BODY_CLASSES =
  "mt-0.5 block text-[length:var(--docs-code-note-text-size,13px)] leading-[var(--ds-line-height-ui)] text-[color:var(--docs-muted,#9d9d9d)] transition-colors";
