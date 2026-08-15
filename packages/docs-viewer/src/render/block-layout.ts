/**
 * Per-block-type PAGE LAYOUT — the single source of truth for how wide a
 * block type is and where it sits horizontally on the page.
 *
 * The doc page is LEFT-ANCHORED and FULL-WIDTH: the host shells no longer
 * center a fixed column (`mx-auto max-w-…`), they hand the renderer the whole
 * padded page and every block claims its own lane inside it. That way all
 * left-justified blocks share one left rail — the eye tracks straight down a
 * single left edge — while a wide table or state-shape can spend the extra
 * horizontal room instead of forcing the whole page to bulge out around it.
 *
 * A block type declares its lane on its registry descriptor (`layout` on
 * DocBlockDescriptor). Omit it and the block gets the default: the standard
 * text measure, left-justified. The declaration drives:
 *
 * - the read/annotate surface: DocBlockRenderer wraps each top-level block in
 *   its lane element, and
 * - the edit surface's atom blocks: editor/views/node-views.tsx's
 *   AtomBlockView puts the same classes on the atom node's NodeViewWrapper.
 *   Editable text nodes remain ProseMirror-owned and take the host's shared
 *   text-lane fallback rather than per-type descriptor overrides.
 *
 * Nested blocks are NOT re-laned — they inherit the lane of the top-level
 * ancestor they render inside, so a paragraph inside a callout stays inside
 * the callout rather than escaping to its own page lane.
 *
 * NOTE: every class token below must remain a plain string literal. The
 * workbench web app's Tailwind build scans this package's source for class
 * tokens (`@source` in web/src/index.css), so a token whose TEXT is built at
 * runtime (`` `max-w-[${n}ch]` ``) silently produces no CSS. Composing whole
 * literal tokens — which is all this module does — is safe.
 */

/**
 * The named lanes a block type can occupy.
 *
 * - `text` — the standard reading measure, `--style-content-width` (the style
 *   rail's "Max width" knob, default 100ch). Everything text-like.
 * - `wide` — the shared wide lane for data-heavy blocks, `--style-wide-width`
 *   (the style rail's "Wide lane" knob, default 1040px). Tables, state shapes,
 *   interaction surfaces, process outlines and media, which are unreadable
 *   when squeezed into a prose measure.
 * - `full` — no cap at all; the block spans the full padded page width.
 */
export type DocBlockLaneWidth = "text" | "wide" | "full";

/**
 * Horizontal placement of the lane within the full page width.
 *
 * - `left` — the default for everything text-like: the lane's left edge sits
 *   on the page's left rail, shared by every other left-justified block.
 * - `center` — an explicit opt-in for a block type whose lane should center
 *   on the page. No shipped block type uses it by default; themes opt in via
 *   `railDefaults.blockLayout.<type>.justify`.
 */
export type DocBlockLaneJustify = "left" | "center";

/**
 * A block type's layout declaration. Both fields are optional — a descriptor
 * that omits `layout` entirely, or omits a field, falls back to
 * DEFAULT_DOC_BLOCK_LAYOUT (text measure, left).
 */
export type DocBlockLayout = {
  width?: DocBlockLaneWidth;
  /**
   * Custom-width escape hatch for a block type that fits neither named lane.
   * Takes precedence over `width`. Must be a plain literal Tailwind token
   * written in the declaring descriptor's own source (e.g. `"max-w-[880px]"`
   * or `"max-w-[var(--docs-my-block-width,72ch)]"`) so the Tailwind scanner
   * can see it — see the module note above.
   */
  customWidthClass?: string;
  justify?: DocBlockLaneJustify;
};

/** Text measure, left-justified — what a block type gets when it declares nothing. */
export const DEFAULT_DOC_BLOCK_LAYOUT: Required<Pick<DocBlockLayout, "width" | "justify">> = {
  width: "text",
  justify: "left",
};

/**
 * Lane width tokens. Each carries its own inline fallback so a standalone
 * host without workbench semantic CSS or style-rail variables still gets the
 * same sane base widths.
 */
const LANE_WIDTH_CLASSES: Record<DocBlockLaneWidth, string> = {
  text: "max-w-[var(--style-content-width,100ch)]",
  wide: "max-w-[var(--style-wide-width,1040px)]",
  full: "max-w-none",
};

/**
 * Lane placement tokens. `left` states the zero left margin explicitly rather
 * than relying on the initial value, so a lane can never inherit centering
 * from a surrounding utility.
 */
const LANE_JUSTIFY_CLASSES: Record<DocBlockLaneJustify, string> = {
  left: "ml-0 mr-auto",
  center: "mx-auto",
};

/** The base every lane element carries: fill the page, then cap. */
const LANE_BASE_CLASSES = "w-full";

/**
 * Resolves a block type's layout declaration to the class string its lane
 * element wears. Called by the read renderer and atom editor NodeViews so
 * those blocks are placed identically in read and edit mode.
 */
export function docBlockLayoutClasses(layout?: DocBlockLayout): string {
  const width =
    layout?.customWidthClass ??
    LANE_WIDTH_CLASSES[layout?.width ?? DEFAULT_DOC_BLOCK_LAYOUT.width];
  const justify = LANE_JUSTIFY_CLASSES[layout?.justify ?? DEFAULT_DOC_BLOCK_LAYOUT.justify];
  return `${LANE_BASE_CLASSES} ${width} ${justify}`;
}

/**
 * The `data-doc-lane` value stamped on every read lane and atom editor
 * NodeView. In edit mode it lets the host's text-measure fallback skip atoms
 * that already carry a lane (see `.docs-editor-prosemirror >
 * *:not([data-doc-lane])` in the workbench's index.css), and on both surfaces
 * it makes lane placement assertable in tests.
 *
 * PER-BLOCK-TYPE OVERRIDES. Every lane element is stamped with BOTH
 * `data-doc-lane` (the resolved lane name) and `data-doc-block-type` (the
 * block type), on the read surface and atom editor NodeViews. That pair is
 * the override hook: a theme or a host stylesheet can retune one block type's
 * width or justification without touching this module or the block's
 * component, e.g.
 *
 *   [data-doc-lane][data-doc-block-type="state-shape"] { max-width: 2000px; }
 *   [data-doc-lane][data-doc-block-type="structured-table"] {
 *     margin-inline: auto;
 *   }
 *
 * Author CSS beats a Tailwind utility of equal specificity by source order,
 * and the attribute pair is two selectors to the utility's one, so these win
 * without `!important`. Use `customWidthClass` on the descriptor instead when
 * the block type should ship a different default for everyone.
 */
export function docBlockLaneName(layout?: DocBlockLayout): string {
  const width = layout?.customWidthClass
    ? "custom"
    : (layout?.width ?? DEFAULT_DOC_BLOCK_LAYOUT.width);
  const justify = layout?.justify ?? DEFAULT_DOC_BLOCK_LAYOUT.justify;
  return `${width}-${justify}`;
}

/**
 * The wide lane, left-justified — the shared declaration for every shipped
 * wide block type (structured-table, interaction-surface, state-shape,
 * process-outline, image, video, canvas and sequence). Centering is a sparse
 * theme/rail override, never a compiled-in presentation default.
 */
export const WIDE_LEFT_BLOCK_LAYOUT: DocBlockLayout = { width: "wide", justify: "left" };
