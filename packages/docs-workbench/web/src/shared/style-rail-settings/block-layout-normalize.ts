import { BLOCK_COLUMN_SPLIT_MIN, BLOCK_COLUMN_SPLIT_MAX, BLOCK_LAYOUT_CUSTOM_WIDTH_MIN, BLOCK_LAYOUT_CUSTOM_WIDTH_MAX, isBlockLayoutType } from "./block-layout";
import { clampNumber } from "./utils";
import type { BlockLayoutWidth, BlockLayoutJustify, BlockLayoutOverride, StyleRailSettings } from "./types";

const BLOCK_LAYOUT_WIDTHS: readonly BlockLayoutWidth[] = ["text", "code", "wide", "full"];
const BLOCK_LAYOUT_JUSTIFICATIONS: readonly BlockLayoutJustify[] = ["left", "center"];

/**
 * Validates one block type's lane override. Everything unrecognised is
 * DROPPED rather than defaulted: an absent field means "inherit the code
 * default from block-layout.ts", so silently substituting a value here would
 * turn a typo in a hand-edited theme file into a layout the author never
 * asked for. A custom width survives only as a positive, clamped `<n>px`
 * string, which is also what keeps the emitted rule's declaration safe.
 */
function normalizeBlockLayoutOverride(raw: unknown): BlockLayoutOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { width, justify } = raw as { width?: unknown; justify?: unknown };
  const override: BlockLayoutOverride = {};

  if (typeof width === "string") {
    const named = width.trim();
    if ((BLOCK_LAYOUT_WIDTHS as readonly string[]).includes(named)) {
      override.width = named as BlockLayoutWidth;
    } else {
      const px = /^(\d+(?:\.\d+)?)px$/.exec(named);
      const value = px ? Number(px[1]) : Number.NaN;
      if (Number.isFinite(value) && value > 0) {
        override.width = `${Math.round(
          clampNumber(
            value,
            BLOCK_LAYOUT_CUSTOM_WIDTH_MIN,
            BLOCK_LAYOUT_CUSTOM_WIDTH_MAX,
            BLOCK_LAYOUT_CUSTOM_WIDTH_MIN,
          ),
        )}px`;
      }
    }
  }

  if (
    typeof justify === "string"
    && (BLOCK_LAYOUT_JUSTIFICATIONS as readonly string[]).includes(justify)
  ) {
    override.justify = justify as BlockLayoutJustify;
  }

  const { columnSplit } = raw as { columnSplit?: unknown };
  if (typeof columnSplit === "number" && Number.isFinite(columnSplit)) {
    override.columnSplit = Math.round(
      clampNumber(columnSplit, BLOCK_COLUMN_SPLIT_MIN, BLOCK_COLUMN_SPLIT_MAX, BLOCK_COLUMN_SPLIT_MIN),
    );
  }

  // An entry that survived validation with nothing in it is not an override.
  return override.width || override.justify || override.columnSplit !== undefined
    ? override
    : null;
}

/**
 * Validates the whole per-block-type override map, dropping keys that are not
 * real doc block types (a renamed or removed block type must not keep
 * emitting a rule for a selector nothing matches).
 *
 * An absent or malformed map inherits `fallback` (the repo baseline) WHOLESALE
 * rather than per key: the map is sparse, so a per-key merge would make
 * clearing an override locally impossible — the baseline's entry would keep
 * coming back on the next normalize.
 */
export function normalizeBlockLayout(
  raw: unknown,
  fallback: StyleRailSettings["blockLayout"] | undefined,
): StyleRailSettings["blockLayout"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...fallback };
  const kept: StyleRailSettings["blockLayout"] = {};
  for (const [type, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isBlockLayoutType(type)) continue;
    const override = normalizeBlockLayoutOverride(value);
    if (override) kept[type] = override;
  }
  return kept;
}

