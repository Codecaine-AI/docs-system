import type { ThemeTokenDefinition } from "../types";
import { chrome } from "./chrome";
import { text } from "./text";
import { media } from "./media";
import { structuredTable } from "./structured-table";
import { interactionSurface } from "./interaction-surface";
import { stateShape } from "./state-shape";
import { processOutline } from "./process-outline";
import { layout } from "./layout";

/**
 * The closed token vocabulary: component file -> token key -> the CSS vars
 * it writes. Unknown files/keys in a theme are ignored (tolerant reads,
 * same policy as the style-rail settings blob).
 *
 * The file names mirror the frozen 16-type BLOCK VOCABULARY exactly (one
 * theme file per block type; each type's vocabulary doc states its keys),
 * plus six non-block files: shell, surfaces, inline-code (the text mark),
 * editor-controls, linking (the shared linked-panels layer), and annotate.
 * One file is shared by two block types: outline-rows (call-stack and
 * component-tree draw the same rows).
 */
export const THEME_TOKEN_REGISTRY: Record<string, Record<string, ThemeTokenDefinition>> = {
  ...chrome,
  ...text,
  ...media,
  ...structuredTable,
  ...interactionSurface,
  ...stateShape,
  ...processOutline,
  ...layout,
};
