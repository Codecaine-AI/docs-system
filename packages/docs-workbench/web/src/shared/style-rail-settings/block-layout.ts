import { DOC_BLOCK_TYPES } from "@codecaine-ai/docs-model/doc-schema";

/** Which block types render two panes, and therefore expose a Column split. */
const TWO_PANE_BLOCK_TYPES = new Set(["state-shape", "interaction-surface"]);

export function hasBlockColumnSplit(file: string): boolean {
  return TWO_PANE_BLOCK_TYPES.has(file);
}

/** Left-pane percentage bounds — neither pane may be squeezed to nothing. */
export const BLOCK_COLUMN_SPLIT_MIN = 20;
export const BLOCK_COLUMN_SPLIT_MAX = 80;

/**
 * The split each two-pane block renders at with NO override. These MUST match
 * the `--docs-pane-split` fallbacks baked into the components' grid templates
 * — an unset knob emits nothing, so the component's literal is what actually
 * renders and a mismatch would make the slider start somewhere the page is
 * not. Pinned by a test.
 */
export const BLOCK_COLUMN_SPLIT_DEFAULTS: Record<string, number> = {
  "state-shape": 44,
  "interaction-surface": 44,
};

/**
 * The block types the Layout knobs apply to. `blocks.*` panes also cover
 * non-block components (inline code, linking, shell, surfaces, editor
 * controls), which have no lane at all, so every entry point — the pane UI,
 * the override leaves, the CSS emitter and the normalizer — gates on this
 * set rather than on the pane id.
 */
const BLOCK_LAYOUT_TYPES: ReadonlySet<string> = new Set(DOC_BLOCK_TYPES);

/** True when `file` is a real doc block type and can carry a lane override. */
export function isBlockLayoutType(file: string): boolean {
  return BLOCK_LAYOUT_TYPES.has(file);
}

/** Custom lane width bounds in px — narrower than a prose measure, wider than any display. */
export const BLOCK_LAYOUT_CUSTOM_WIDTH_MIN = 240;
export const BLOCK_LAYOUT_CUSTOM_WIDTH_MAX = 3000;

