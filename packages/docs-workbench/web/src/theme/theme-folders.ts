import type { StyleRailSettings } from "../shell/StyleRail";

/**
 * Theme folders — the canonical theme-file format (see
 * docs/20-implementation/40-theming).
 *
 * A theme is a folder: `theme.json` (manifest: name, `base` inheritance,
 * font stacks, optional style-rail defaults) plus `components/<file>.json`
 * token files where every token value is either one string (both modes) or
 * a `{ light, dark }` pair. The loader validates values against
 * THEME_TOKEN_REGISTRY — the closed map from component file + key to the
 * tier-2 CSS vars of the canonical contract (theme/semantic.css) — and
 * compiles one <style> tag with a light and a dark block, so themes are
 * purely an alternative SOURCE for tier-2 tokens; component code and the
 * style-rail overlay are untouched (inline rail overrides still win over
 * any theme).
 *
 * BUILT-IN themes are compiled-in constants with the same shape (they are
 * not user-editable, so they don't need to be files); CUSTOM themes live
 * as folders under the repo's `themes/` directory, served by docs-server
 * (`GET/POST /api/themes`).
 */

export type ThemeModeValue = string | { light: string; dark: string };

export type ThemeComponents = Record<string, Record<string, ThemeModeValue>>;

/** Theme manifests may override any rail leaf without restating its siblings. */
export type StyleRailDefaults = {
  [Key in keyof StyleRailSettings]?: StyleRailSettings[Key] extends object
    ? DeepPartial<StyleRailSettings[Key]>
    : StyleRailSettings[Key];
};

type DeepPartial<Value> = Value extends object
  ? { [Key in keyof Value]?: DeepPartial<Value[Key]> }
  : Value;

export type ThemeManifest = {
  name: string;
  /** Id of the theme this one layers over; missing token values fall through. */
  base?: string;
  /** Dark-mode flag applied when the theme is selected. */
  dark?: boolean;
  /** Font stacks written to the per-surface font tokens (custom stacks allowed). */
  fonts?: Partial<Record<"body" | "heading" | "code" | "number", string>>;
  /**
   * The repo-side style-rail settings file: this block IS where the rail's
   * knobs persist, and loading a theme installs it as the rail's BASELINE
   * (StyleRail.tsx setStyleRailBaseline) — what "default" means, what Reset
   * returns to, and what a --theme-locked serve or static export renders.
   * Browser localStorage is only a cache/fallback when this block is absent;
   * it never overrides a loaded repo value.
   */
  railDefaults?: StyleRailDefaults;
};

export type ThemeDefinition = {
  id: string;
  manifest: ThemeManifest;
  components: ThemeComponents;
  source: "builtin" | "repo";
};

export type ThemeTokenDefinition =
  | {
      vars: string[];
      kind: "color";
    }
  | {
      vars: string[];
      kind: "length";
      min: number;
      max: number;
      step: number;
      unit: "px";
      defaultValue: number;
    }
  | {
      vars: string[];
      kind: "number";
      min: number;
      max: number;
      step: number;
      unit?: never;
      defaultValue: number;
    };

const color = (...vars: string[]): ThemeTokenDefinition => ({ vars, kind: "color" });

/**
 * The closed token vocabulary: component file -> token key -> the CSS vars
 * it writes. Unknown files/keys in a theme are ignored (tolerant reads,
 * same policy as the style-rail settings blob).
 *
 * The file names mirror the frozen 16-type BLOCK VOCABULARY exactly (one
 * theme file per block type; each type's vocabulary doc states its keys),
 * plus six non-block files: shell, surfaces, inline-code (the text mark),
 * editor-controls, linking (the shared linked-panels layer), and annotate.
 */
export const THEME_TOKEN_REGISTRY: Record<string, Record<string, ThemeTokenDefinition>> = {
  // -- non-block surfaces ---------------------------------------------------
  shell: {
    background: color("--background", "--card", "--popover"),
    sidebar: color("--sidebar"),
    text: color(
      "--foreground",
      "--card-foreground",
      "--popover-foreground",
      "--sidebar-foreground",
      "--docs-viewer-text-body",
      "--docs-viewer-text-heading",
    ),
    accent: color("--accent"),
    link: color("--docs-viewer-link"),
  },
  surfaces: {
    border: color("--border", "--input", "--sidebar-border", "--docs-border-default"),
    muted: color("--muted", "--docs-surface-muted"),
    icon: color("--docs-icon-muted"),
    radius: {
      vars: ["--radius"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 8,
    },
  },
  "inline-code": {
    fg: color("--docs-inline-code-fg"),
    bg: color("--docs-inline-code-bg"),
  },
  "editor-controls": {
    highlight: color("--docs-highlight-color"),
    dropLine: color("--docs-dropcursor-color"),
    grip: color("--docs-grip-color"),
  },
  // The shared linked-panels layer (docs-viewer components/linked-panels):
  // zebra stripe on even code lines, the lit-extent background wash, and
  // the pin/rail accent — consumed by the state-shape, interaction-surface,
  // and code blocks. Registered ONCE here, not per component.
  linking: {
    zebra: color("--docs-zebra"),
    highlight: color("--docs-link-bg"),
    pin: color("--docs-link-pin"),
  },
  annotate: {
    accent: color("--annotation-accent"),
    surface: color("--annotation-surface"),
    text: color("--annotation-text"),
    muted: color("--annotation-muted"),
    border: color("--annotation-border"),
    danger: color("--annotation-danger"),
    add: color("--docs-annotation-add"),
    del: color("--docs-annotation-del"),
    wash: color("--docs-annotation-wash"),
  },
  // -- one file per block-vocabulary type ------------------------------------
  paragraph: {
    fg: color("--docs-paragraph-fg"),
  },
  heading: {
    fg: color("--docs-heading-fg"),
  },
  "list-item": {
    marker: color("--docs-list-marker-fg"),
  },
  quote: {
    fg: color("--docs-quote-fg"),
    border: color("--docs-quote-border"),
  },
  code: {
    bg: color("--docs-code-block-bg"),
    border: color("--docs-code-block-border"),
    string: color("--syntax-string"),
    number: color("--syntax-number"),
    boolean: color("--syntax-boolean"),
    null: color("--syntax-null"),
    key: color("--syntax-key"),
    languageFg: color("--docs-code-lang-fg"),
    annotationAccent: color("--docs-code-annotation-accent"),
    gutterFg: color("--docs-code-gutter-fg"),
    gutterBg: color("--docs-code-gutter-bg"),
    zebra: color("--docs-code-zebra"),
    rule: color("--docs-code-rule"),
    ruleWidth: {
      vars: ["--docs-code-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    ruleOpacity: {
      vars: ["--docs-code-rule-opacity"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 0.5,
    },
    zebraOpacity: {
      vars: ["--docs-code-zebra-opacity"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 1,
    },
  },
  callout: {
    border: color("--docs-viewer-callout-border"),
    fill: color("--docs-viewer-callout-fill"),
    fg: color("--docs-callout-fg"),
  },
  divider: {
    color: color("--docs-divider-color"),
  },
  image: {
    border: color("--docs-image-border"),
    caption: color("--docs-image-caption-fg"),
  },
  video: {
    border: color("--docs-video-border"),
    caption: color("--docs-video-caption-fg"),
  },
  "file-tree": {
    border: color("--docs-file-tree-border"),
    note: color("--docs-file-tree-note-fg"),
  },
  "structured-table": {
    border: color("--docs-table-border"),
    headerBg: color("--docs-table-header-bg"),
    headerFg: color("--docs-table-header-fg"),
    headerRule: color("--docs-table-header-rule"),
    headerRuleWidth: {
      vars: ["--docs-table-header-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1.5,
    },
    headerRuleOpacity: {
      vars: ["--docs-table-header-rule-opacity"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 0.5,
    },
    rowRule: color("--docs-table-row-rule"),
    rowRuleWidth: {
      vars: ["--docs-table-row-rule-width"],
      kind: "length",
      min: 0,
      max: 3,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    rowRuleOpacity: {
      vars: ["--docs-table-row-rule-opacity"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 1,
    },
    cellPaddingY: {
      vars: ["--docs-table-cell-pad-y"],
      kind: "length",
      min: 4,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 10,
    },
    cellPaddingX: {
      vars: ["--docs-table-cell-pad-x"],
      kind: "length",
      min: 8,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 12,
    },
    fontSize: {
      vars: ["--docs-table-font-size"],
      kind: "length",
      min: 12,
      max: 16,
      step: 0.5,
      unit: "px",
      defaultValue: 14,
    },
    handleRadius: {
      vars: ["--docs-table-handle-radius"],
      kind: "length",
      min: 0,
      max: 10,
      step: 0.5,
      unit: "px",
      defaultValue: 3,
    },
    handleOffset: {
      vars: ["--docs-table-handle-offset"],
      kind: "length",
      min: 4,
      max: 20,
      step: 1,
      unit: "px",
      defaultValue: 12,
    },
    selectionPadding: {
      vars: ["--docs-table-selection-pad"],
      kind: "length",
      min: 0,
      max: 8,
      step: 0.5,
      unit: "px",
      defaultValue: 3,
    },
  },
  "interaction-surface": {
    actionHeaderBg: color("--docs-operation-action-header-bg"),
    actionHeaderInk: color("--docs-operation-action-header-ink"),
    queryHeaderBg: color("--docs-operation-query-header-bg"),
    queryHeaderInk: color("--docs-operation-query-header-ink"),
    eventHeaderBg: color("--docs-operation-event-header-bg"),
    eventHeaderInk: color("--docs-operation-event-header-ink"),
    border: color("--docs-interaction-border"),
    bg: color("--docs-interaction-bg"),
    rule: color("--docs-interaction-rule"),
    headerBg: color("--docs-interaction-header-bg"),
    headerFg: color("--docs-interaction-header-fg"),
    sigName: color("--docs-interaction-sig-name"),
    sigType: color("--docs-interaction-sig-type"),
    sigPunct: color("--docs-interaction-sig-punct"),
    noteName: color("--docs-interaction-note-name"),
    noteType: color("--docs-interaction-note-type"),
    noteFg: color("--docs-interaction-note-fg"),
    childRule: color("--docs-interaction-child-rule"),
    rowPad: {
      vars: ["--docs-interaction-row-pad"],
      kind: "length",
      min: 4,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 8,
    },
    opGap: {
      vars: ["--docs-interaction-op-gap"],
      kind: "length",
      min: 6,
      max: 28,
      step: 1,
      unit: "px",
      defaultValue: 14,
    },
  },
  // The --docs-shape-* tokens tone the state-shape structure tree (heading,
  // field names, type chips, optional pills, muted notes, hairlines, card
  // frame); the example pane's
  // furniture (zebra, link wash, pin rail) rides the shared linked-panels
  // tokens in the "linking" folder instead.
  "state-shape": {
    border: color("--docs-shape-border"),
    bg: color("--docs-shape-bg"),
    name: color("--docs-shape-name"),
    type: color("--docs-shape-type"),
    typeBg: color("--docs-shape-type-bg"),
    muted: color("--docs-shape-muted"),
    optionalFg: color("--docs-shape-optional-fg"),
    optionalBg: color("--docs-shape-optional-bg"),
    rule: color("--docs-shape-rule"),
    headerBg: color("--docs-shape-header-bg"),
    descFg: color("--docs-shape-desc-fg"),
    childRule: color("--docs-shape-child-rule"),
    rowPad: {
      vars: ["--docs-shape-row-pad"],
      kind: "length",
      min: 4,
      max: 24,
      step: 1,
      unit: "px",
      // Must match semantic.css's --docs-shape-row-pad default so the slider
      // starts where the unstyled block actually renders. 10px: 14px made a
      // handful of fields fill a whole screen, and the row already separates
      // by name weight and a hairline, so it does not need the extra air.
      defaultValue: 10,
    },
  },
  // The Process Outline connector rail is drawn as overlapping elbow + stem
  // strokes, so the rail color must stay opaque — alpha doubles up at the
  // joins. Rail is now the FALLBACK for the five-hue depth cycle (Cycle 1..5,
  // re-declared per nesting level in the component): a level's rail, elbow,
  // arrowhead, chip and note rule all resolve from its cycle color. Deep ink
  // (depth >= 3) derives from ink in semantic.css.
  // The three strength knobs (Note accent, Chip tint, Chip ink mix) are
  // UNITLESS PERCENTAGES, not lengths: the component multiplies them by 1%
  // inside color-mix() at the use site, because a var() in a custom property
  // resolves at :root where the depth color does not exist. Their light and
  // dark semantic.css values differ (dark runs hotter); the registry default
  // is the light one, and a rail override — like every color override —
  // writes one value for both modes.
  "process-outline": {
    ink: color("--docs-process-outline-ink"),
    rail: color("--docs-process-outline-rail"),
    cycle1: color("--docs-process-outline-cycle-1"),
    cycle2: color("--docs-process-outline-cycle-2"),
    cycle3: color("--docs-process-outline-cycle-3"),
    cycle4: color("--docs-process-outline-cycle-4"),
    cycle5: color("--docs-process-outline-cycle-5"),
    keywordFg: color("--docs-process-outline-keyword-fg"),
    noteFg: color("--docs-process-outline-note-fg"),
    noteBg: color("--docs-process-outline-note-bg"),
    noteBorder: color("--docs-process-outline-note-border"),
    codeBg: color("--docs-process-outline-code-bg"),
    traceBg: color("--docs-process-outline-trace-bg"),
    selectBg: color("--docs-process-outline-select-bg"),
    indent: {
      vars: ["--docs-process-outline-indent"],
      kind: "length",
      min: 16,
      max: 72,
      step: 1,
      unit: "px",
      defaultValue: 46,
    },
    rowGap: {
      vars: ["--docs-process-outline-row-gap"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 12,
    },
    branchGap: {
      vars: ["--docs-process-outline-branch-gap"],
      kind: "length",
      min: 0,
      max: 48,
      step: 1,
      unit: "px",
      defaultValue: 20,
    },
    rootGap: {
      vars: ["--docs-process-outline-root-gap"],
      kind: "length",
      min: 0,
      max: 64,
      step: 1,
      unit: "px",
      defaultValue: 30,
    },
    arrowGap: {
      vars: ["--docs-process-outline-arrow-gap"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 4,
    },
    lineHeight: {
      vars: ["--docs-process-outline-line-height"],
      kind: "length",
      min: 16,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: 22,
    },
    textSize: {
      vars: ["--docs-process-outline-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12.5,
    },
    rootTextSize: {
      vars: ["--docs-process-outline-root-text-size"],
      kind: "length",
      min: 10,
      max: 22,
      step: 0.5,
      unit: "px",
      defaultValue: 13.5,
    },
    rootWeight: {
      vars: ["--docs-process-outline-root-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: 650,
    },
    branchWeight: {
      vars: ["--docs-process-outline-branch-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: 400,
    },
    stepWeight: {
      vars: ["--docs-process-outline-step-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: 400,
    },
    emptyTextSize: {
      vars: ["--docs-process-outline-empty-text-size"],
      kind: "length",
      min: 9,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    },
    noteTextSize: {
      vars: ["--docs-process-outline-note-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 11.5,
    },
    noteLineHeight: {
      vars: ["--docs-process-outline-note-line-height"],
      kind: "length",
      min: 12,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 17,
    },
    noteInset: {
      vars: ["--docs-process-outline-note-inset"],
      kind: "length",
      min: 0,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: 10,
    },
    // The note "card" is boxless by default — border, rule and padding all sit
    // at zero, and a theme that wants the bordered card back (classic) sets
    // them. Zero defaults are what make "no box" expressible in tokens instead
    // of in a second DOM shape.
    noteBorderWidth: {
      vars: ["--docs-process-outline-note-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 0,
    },
    noteRuleWidth: {
      vars: ["--docs-process-outline-note-rule-width"],
      kind: "length",
      min: 0,
      max: 6,
      step: 0.5,
      unit: "px",
      defaultValue: 0,
    },
    notePadY: {
      vars: ["--docs-process-outline-note-pad-y"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 0,
    },
    notePadX: {
      vars: ["--docs-process-outline-note-pad-x"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 0,
    },
    // The trace mark is a mini pill reading "trace" at the end of the step
    // line. Its two strength knobs are the CHIP formula reused, so a theme
    // tunes both families the same way; size 0 hides it outright.
    traceTextSize: {
      vars: ["--docs-process-outline-trace-text-size"],
      kind: "length",
      min: 0,
      max: 14,
      step: 0.5,
      unit: "px",
      defaultValue: 9.5,
    },
    // Zero width by default: while a step line is being hand-edited the caret
    // IS the affordance, and the block-wide selection wash is suppressed.
    focusRing: {
      vars: ["--docs-process-outline-focus-ring"],
      kind: "length",
      min: 0,
      max: 3,
      step: 0.5,
      unit: "px",
      defaultValue: 0,
    },
    arrowSize: {
      vars: ["--docs-process-outline-arrow-size"],
      kind: "length",
      min: 3,
      max: 12,
      step: 0.5,
      unit: "px",
      defaultValue: 6,
    },
    stroke: {
      vars: ["--docs-process-outline-stroke"],
      kind: "length",
      min: 0.5,
      max: 4,
      step: 0.25,
      unit: "px",
      defaultValue: 1.5,
    },
    noteAccent: {
      vars: ["--docs-process-outline-note-accent"],
      kind: "number",
      min: 0,
      max: 100,
      step: 5,
      defaultValue: 55,
    },
    chipTint: {
      vars: ["--docs-process-outline-chip-tint"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 13,
    },
    chipInkMix: {
      vars: ["--docs-process-outline-chip-ink-mix"],
      kind: "number",
      min: 0,
      max: 100,
      step: 5,
      defaultValue: 60,
    },
    traceTint: {
      vars: ["--docs-process-outline-trace-tint"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 16,
    },
    traceInkMix: {
      vars: ["--docs-process-outline-trace-ink-mix"],
      kind: "number",
      min: 0,
      max: 100,
      step: 5,
      defaultValue: 70,
    },
    // Dragging across step lines highlights each line in its own depth colour
    // (the chip formula again) instead of washing the block. Tint 0 turns the
    // range invisible; a theme that wants a flat selection colour sets
    // select-bg opaque and drops the tint.
    selectTint: {
      vars: ["--docs-process-outline-select-tint"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 22,
    },
    selectPad: {
      vars: ["--docs-process-outline-select-pad"],
      kind: "length",
      min: 0,
      max: 8,
      step: 0.5,
      unit: "px",
      defaultValue: 2,
    },
  },
  sequence: {
    border: color("--docs-sequence-border"),
  },
  canvas: {
    border: color("--docs-canvas-border"),
  },
};

const FONT_VARS: Record<string, string[]> = {
  body: ["--font-tx02"],
  heading: ["--font-display", "--style-heading-font"],
  code: ["--docs-font-code"],
  number: ["--docs-font-numeric"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readModeValue(value: unknown): { light: string; dark: string } | null {
  if (typeof value === "string" && value.trim()) return { light: value, dark: value };
  if (isRecord(value) && typeof value.light === "string" && typeof value.dark === "string") {
    return { light: value.light, dark: value.dark };
  }
  return null;
}

/** Tolerant reader for a wire/file theme payload; unknown fields drop, bad values skip. */
export function readThemeDefinition(
  id: string,
  raw: unknown,
  source: ThemeDefinition["source"],
): ThemeDefinition | null {
  if (!isRecord(raw)) return null;
  const manifestRaw = isRecord(raw.manifest) ? raw.manifest : raw;
  const name = typeof manifestRaw.name === "string" && manifestRaw.name.trim() ? manifestRaw.name : id;
  const manifest: ThemeManifest = { name };
  if (typeof manifestRaw.base === "string") manifest.base = manifestRaw.base;
  if (typeof manifestRaw.dark === "boolean") manifest.dark = manifestRaw.dark;
  if (isRecord(manifestRaw.fonts)) {
    const fonts: ThemeManifest["fonts"] = {};
    for (const surface of Object.keys(FONT_VARS) as Array<keyof typeof FONT_VARS>) {
      const stack = manifestRaw.fonts[surface];
      if (typeof stack === "string" && stack.trim()) fonts[surface as "body"] = stack;
    }
    if (Object.keys(fonts).length > 0) manifest.fonts = fonts;
  }
  if (isRecord(manifestRaw.railDefaults)) {
    manifest.railDefaults = manifestRaw.railDefaults as StyleRailDefaults;
  }
  const components: ThemeComponents = {};
  const componentsRaw = isRecord(raw.components) ? raw.components : {};
  for (const [file, tokens] of Object.entries(componentsRaw)) {
    if (!THEME_TOKEN_REGISTRY[file] || !isRecord(tokens)) continue;
    const kept: Record<string, ThemeModeValue> = {};
    for (const [key, value] of Object.entries(tokens)) {
      if (!THEME_TOKEN_REGISTRY[file][key]) continue;
      const mode = readModeValue(value);
      if (mode) kept[key] = mode.light === mode.dark ? mode.light : mode;
    }
    if (Object.keys(kept).length > 0) components[file] = kept;
  }
  return { id, manifest, components, source };
}

/**
 * Theme inheritance is leaf-wise for rail settings, just like it is for
 * component tokens. A child that changes one annotate color, one layout
 * dimension, or one block lane must not discard the base theme's sibling
 * settings in the same group.
 */
function mergeRailDefaults(
  base: StyleRailDefaults | undefined,
  override: StyleRailDefaults,
): StyleRailDefaults {
  const merged: Record<string, unknown> = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(override)) {
    const inherited = merged[key];
    merged[key] = isRecord(inherited) && isRecord(value)
      ? mergeRailDefaults(inherited as StyleRailDefaults, value as StyleRailDefaults)
      : value;
  }
  return merged as StyleRailDefaults;
}

/** Flattens a base chain (base-first) into one definition; cycles/missing bases just stop the walk. */
export function resolveThemeChain(
  theme: ThemeDefinition,
  lookup: (id: string) => ThemeDefinition | undefined,
): ThemeDefinition {
  const chain: ThemeDefinition[] = [];
  const seen = new Set<string>();
  let current: ThemeDefinition | undefined = theme;
  while (current && !seen.has(current.id)) {
    chain.unshift(current);
    seen.add(current.id);
    current = current.manifest.base ? lookup(current.manifest.base) : undefined;
  }
  const merged: ThemeDefinition = {
    id: theme.id,
    source: theme.source,
    manifest: { name: theme.manifest.name },
    components: {},
  };
  for (const layer of chain) {
    if (layer.manifest.dark !== undefined) merged.manifest.dark = layer.manifest.dark;
    if (layer.manifest.fonts) {
      merged.manifest.fonts = { ...merged.manifest.fonts, ...layer.manifest.fonts };
    }
    if (layer.manifest.railDefaults) {
      merged.manifest.railDefaults = mergeRailDefaults(
        merged.manifest.railDefaults,
        layer.manifest.railDefaults,
      );
    }
    for (const [file, tokens] of Object.entries(layer.components)) {
      merged.components[file] = { ...merged.components[file], ...tokens };
    }
  }
  return merged;
}

/** Compiles a RESOLVED theme into the CSS injected as the theme layer. */
export function compileThemeCss(theme: ThemeDefinition): string {
  const light: string[] = [];
  const dark: string[] = [];
  for (const [file, tokens] of Object.entries(theme.components)) {
    for (const [key, value] of Object.entries(tokens)) {
      const token = THEME_TOKEN_REGISTRY[file]?.[key];
      if (!token) continue;
      const mode = readModeValue(value);
      if (!mode) continue;
      for (const cssVar of token.vars) {
        light.push(`  ${cssVar}: ${mode.light};`);
        dark.push(`  ${cssVar}: ${mode.dark};`);
      }
    }
  }
  for (const [surface, stack] of Object.entries(theme.manifest.fonts ?? {})) {
    for (const cssVar of FONT_VARS[surface] ?? []) {
      light.push(`  ${cssVar}: ${stack};`);
      dark.push(`  ${cssVar}: ${stack};`);
    }
  }
  const blocks: string[] = [];
  if (light.length > 0) blocks.push(`:root, [data-theme="light"] {\n${light.join("\n")}\n}`);
  if (dark.length > 0) blocks.push(`[data-theme="dark"] {\n${dark.join("\n")}\n}`);
  return blocks.join("\n\n");
}

const THEME_STYLE_TAG_ID = "docs-theme-folder-css";

/** Injects (or clears, for null) the resolved theme's CSS layer. */
export function applyThemeCss(theme: ThemeDefinition | null): void {
  let tag = document.getElementById(THEME_STYLE_TAG_ID);
  if (!theme) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement("style");
    tag.id = THEME_STYLE_TAG_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = compileThemeCss(theme);
}

/**
 * Built-in global themes (the former style-rail presets, plus Default).
 * Compiled-in constants sharing the folder format's shape — custom themes
 * are folders in the repo's themes/ directory.
 */
export const BUILTIN_THEMES: ThemeDefinition[] = [
  {
    id: "default",
    source: "builtin",
    // The ONLY built-in while Ford iterates on what the default theme IS.
    // The repo's themes/default/ folder (auto-saved from the rail by the
    // workbench) OVERRIDES this compiled-in fallback when present — see
    // App.tsx resolveThemeById. Empty railDefaults still mean "selecting
    // Default resets the overlay to the saved core theme" via
    // normalizeSettings.
    manifest: { name: "Default", dark: false, railDefaults: {} },
    components: {},
  },
];
