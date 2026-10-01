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
      defaultValue: 2,
    },
  },
  // The inline `code` mark chip (docs-viewer render/block-classes.ts
  // INLINE_CODE_CLASSES + the workbench's unlayered index.css rule — both
  // read every var below). Text size and padding are UNITLESS em multipliers
  // (the consumers multiply by 1em), so the chip keeps scaling with the text
  // it sits in; a px knob would flatten a heading's chip to a paragraph's.
  "inline-code": {
    fg: color("--docs-inline-code-fg"),
    bg: color("--docs-inline-code-bg"),
    border: color("--docs-inline-code-border"),
    // 0px by default: the chip is borderless until a theme widens it.
    borderWidth: {
      vars: ["--docs-inline-code-border-width"],
      kind: "length",
      min: 0,
      max: 3,
      step: 0.5,
      unit: "px",
      defaultValue: 0,
    },
    // semantic.css points the default at the global --radius (2px at stock).
    radius: {
      vars: ["--docs-inline-code-radius"],
      kind: "length",
      min: 0,
      max: 12,
      step: 1,
      unit: "px",
      defaultValue: 2,
    },
    textSize: {
      vars: ["--docs-inline-code-text-size"],
      kind: "number",
      min: 0.6,
      max: 1.2,
      step: 0.05,
      defaultValue: 0.85,
    },
    padX: {
      vars: ["--docs-inline-code-pad-x"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 0.35,
    },
    padY: {
      vars: ["--docs-inline-code-pad-y"],
      kind: "number",
      min: 0,
      max: 0.5,
      step: 0.05,
      defaultValue: 0.1,
    },
    // The var is unset by default so the chip INHERITS its weight (bold text
    // and headings keep theirs); 400 is what that resolves to in body text.
    weight: {
      vars: ["--docs-inline-code-weight"],
      kind: "number",
      min: 300,
      max: 800,
      step: 100,
      defaultValue: 400,
    },
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
  // The code block's own zebra (code.zebra) defaults to this zebra, so this
  // knob restripes code blocks too until that one is set.
  linking: {
    zebra: color("--docs-zebra"),
    highlight: color("--docs-link-bg"),
    pin: color("--docs-link-pin"),
    // How strongly the lit wash mixes off the pin color — a UNITLESS PERCENT
    // (semantic.css multiplies by 1%). Dark runs hotter (18); the registry
    // default is the light value. Setting Link highlight outright bypasses it.
    washStrength: {
      vars: ["--docs-link-wash"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 14,
    },
    railWidth: {
      vars: ["--docs-link-rail-width"],
      kind: "length",
      min: 0,
      max: 8,
      step: 0.5,
      unit: "px",
      defaultValue: 3,
    },
    ringWidth: {
      vars: ["--docs-link-ring-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1.5,
    },
    // The CodeLines panel (state-shape example, interaction-surface
    // signature): its own metrics, independent of the code block's.
    textSize: {
      vars: ["--docs-link-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    },
    lineHeight: {
      vars: ["--docs-link-line-height"],
      kind: "length",
      min: 14,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 20,
    },
    gutterTextSize: {
      vars: ["--docs-link-gutter-text-size"],
      kind: "length",
      min: 8,
      max: 16,
      step: 0.5,
      unit: "px",
      defaultValue: 11,
    },
    gutterWidth: {
      vars: ["--docs-link-gutter-width"],
      kind: "length",
      min: 24,
      max: 96,
      step: 1,
      unit: "px",
      defaultValue: 44,
    },
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
  // Rich-text blocks (docs-viewer render/block-classes.ts + components/
  // rich-text). Both surfaces share one class string per block, so a knob
  // moves read and edit together.
  //
  // `spacing`, the heading `h*Size` knobs and the `*TextScale` knobs are
  // UNITLESS multipliers — the class multiplies by 1em (or by the rail's
  // reading size). The values they replaced came from Tailwind Typography's
  // em-relative prose-sm metrics, which is also why their defaults are the
  // long decimals below: they are those metrics exactly, so nothing moves
  // until a knob does, at any reading size.
  paragraph: {
    fg: color("--docs-paragraph-fg"),
    // Margin above and below, in em of the paragraph's own text size.
    spacing: {
      vars: ["--docs-paragraph-spacing"],
      kind: "number",
      min: 0,
      max: 3,
      step: 0.05,
      defaultValue: 1.1428571,
    },
  },
  heading: {
    fg: color("--docs-heading-fg"),
    weight: {
      vars: ["--docs-heading-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: 600,
    },
    marginTop: {
      vars: ["--docs-heading-margin-top"],
      kind: "length",
      min: 0,
      max: 72,
      step: 1,
      unit: "px",
      defaultValue: 24,
    },
    marginBottom: {
      vars: ["--docs-heading-margin-bottom"],
      kind: "length",
      min: 0,
      max: 48,
      step: 1,
      unit: "px",
      defaultValue: 12,
    },
    // Per-level size, in em of the reading size. h4-h6 render at the reading
    // size itself and have no knob.
    h1Size: {
      vars: ["--docs-heading-h1-size"],
      kind: "number",
      min: 1,
      max: 4,
      step: 0.05,
      defaultValue: 2.1428571,
    },
    h2Size: {
      vars: ["--docs-heading-h2-size"],
      kind: "number",
      min: 1,
      max: 3,
      step: 0.05,
      defaultValue: 1.4285714,
    },
    h3Size: {
      vars: ["--docs-heading-h3-size"],
      kind: "number",
      min: 1,
      max: 3,
      step: 0.05,
      defaultValue: 1.2857143,
    },
  },
  // Marker sizes and the indent step are rail settings of their own
  // (StyleRailSettings.list), not registry tokens.
  "list-item": {
    marker: color("--docs-list-marker-fg"),
    fg: color("--docs-list-item-fg"),
    itemGap: {
      vars: ["--docs-list-item-gap"],
      kind: "length",
      min: 0,
      max: 24,
      step: 0.5,
      unit: "px",
      defaultValue: 4,
    },
  },
  quote: {
    fg: color("--docs-quote-fg"),
    border: color("--docs-quote-border"),
    bg: color("--docs-quote-bg"),
    borderWidth: {
      vars: ["--docs-quote-border-width"],
      kind: "length",
      min: 0,
      max: 8,
      step: 0.5,
      unit: "px",
      defaultValue: 2,
    },
    // Gap between the rule and the text.
    indent: {
      vars: ["--docs-quote-indent"],
      kind: "length",
      min: 0,
      max: 48,
      step: 1,
      unit: "px",
      defaultValue: 12,
    },
    padY: {
      vars: ["--docs-quote-pad-y"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 0,
    },
    spacing: {
      vars: ["--docs-quote-spacing"],
      kind: "number",
      min: 0,
      max: 4,
      step: 0.05,
      defaultValue: 1.3333333,
    },
    // Multiplies the rail's reading size, so a quote tracks it at 1.
    textScale: {
      vars: ["--docs-quote-text-scale"],
      kind: "number",
      min: 0.75,
      max: 2,
      step: 0.05,
      defaultValue: 1,
    },
  },
  // Every var below is read by all three code surfaces — plain read,
  // annotated read, and the editor node view — through the shared constants
  // in docs-viewer components/code/classes.ts and render/block-classes.ts.
  code: {
    bg: color("--docs-code-block-bg"),
    border: color("--docs-code-block-border"),
    borderWidth: {
      vars: ["--docs-code-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    // semantic.css points the default at the global --radius (2px at stock).
    radius: {
      vars: ["--docs-code-radius"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 2,
    },
    textSize: {
      vars: ["--docs-code-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    },
    // ONE token drives row height, zebra period and annotation overlays.
    lineHeight: {
      vars: ["--docs-code-line-height"],
      kind: "length",
      min: 14,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 20,
    },
    padX: {
      vars: ["--docs-code-pad-x"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 12,
    },
    padTop: {
      vars: ["--docs-code-pad-top"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 0,
    },
    padBottom: {
      vars: ["--docs-code-pad-bottom"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 8,
    },
    // Header band: the language label and the notes column's "Notes" label.
    headerHeight: {
      vars: ["--docs-code-header-height"],
      kind: "length",
      min: 20,
      max: 48,
      step: 1,
      unit: "px",
      defaultValue: 28,
    },
    headerFg: color("--docs-code-header-fg"),
    headerTextSize: {
      vars: ["--docs-code-header-text-size"],
      kind: "length",
      min: 8,
      max: 16,
      step: 0.5,
      unit: "px",
      defaultValue: 10,
    },
    headerWeight: {
      vars: ["--docs-code-header-weight"],
      kind: "number",
      min: 300,
      max: 800,
      step: 100,
      defaultValue: 500,
    },
    string: color("--syntax-string"),
    number: color("--syntax-number"),
    boolean: color("--syntax-boolean"),
    null: color("--syntax-null"),
    key: color("--syntax-key"),
    // Hover / chevron color of the EDIT surface's language picker only — the
    // label's resting color is headerFg.
    languageFg: color("--docs-code-lang-fg"),
    annotationAccent: color("--docs-code-annotation-accent"),
    gutterFg: color("--docs-code-gutter-fg"),
    gutterBg: color("--docs-code-gutter-bg"),
    gutterTextSize: {
      vars: ["--docs-code-gutter-text-size"],
      kind: "length",
      min: 8,
      max: 16,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    },
    gutterWidth: {
      vars: ["--docs-code-gutter-width"],
      kind: "length",
      min: 24,
      max: 96,
      step: 1,
      unit: "px",
      defaultValue: 48,
    },
    gutterPadX: {
      vars: ["--docs-code-gutter-pad-x"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 8,
    },
    // Defaults to the shared linking zebra (semantic.css), so it only needs
    // setting when code blocks should stripe differently from linked panels.
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
    // Annotation notes aside (annotated read + edit surfaces).
    noteTextSize: {
      vars: ["--docs-code-note-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    },
    notesWidth: {
      vars: ["--docs-code-notes-width"],
      kind: "length",
      min: 200,
      max: 480,
      step: 10,
      unit: "px",
      defaultValue: 320,
    },
  },
  // Callout (docs-viewer rich-text/CalloutDocsBlock — one renderer for both
  // surfaces). `border` recolors the frame for every tone; it is undeclared
  // in semantic.css, and unset the frame follows each tone's accent. `fill`
  // is the body background, `fg` the body ink. Each tone carries its accent
  // (icon, frame, header texture), header fill and header ink; risk renders
  // with the warning palette. `radius` follows the global --radius in
  // semantic.css (2px at stock). `bodyTextScale` multiplies the rail's
  // reading size.
  callout: {
    border: color("--docs-callout-border"),
    fill: color("--docs-callout-body-bg"),
    fg: color("--docs-callout-fg"),
    infoAccent: color("--docs-callout-info-accent"),
    infoHeaderBg: color("--docs-callout-info-header-bg"),
    infoHeaderFg: color("--docs-callout-info-header-fg"),
    decisionAccent: color("--docs-callout-decision-accent"),
    decisionHeaderBg: color("--docs-callout-decision-header-bg"),
    decisionHeaderFg: color("--docs-callout-decision-header-fg"),
    warningAccent: color("--docs-callout-warning-accent"),
    warningHeaderBg: color("--docs-callout-warning-header-bg"),
    warningHeaderFg: color("--docs-callout-warning-header-fg"),
    successAccent: color("--docs-callout-success-accent"),
    successHeaderBg: color("--docs-callout-success-header-bg"),
    successHeaderFg: color("--docs-callout-success-header-fg"),
    borderWidth: {
      vars: ["--docs-callout-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    radius: {
      vars: ["--docs-callout-radius"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 2,
    },
    padX: {
      vars: ["--docs-callout-pad-x"],
      kind: "length",
      min: 0,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: 16,
    },
    headerPadY: {
      vars: ["--docs-callout-header-pad-y"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 12,
    },
    bodyPadY: {
      vars: ["--docs-callout-body-pad-y"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 14,
    },
    titleTextSize: {
      vars: ["--docs-callout-title-text-size"],
      kind: "length",
      min: 10,
      max: 24,
      step: 0.5,
      unit: "px",
      defaultValue: 14,
    },
    titleWeight: {
      vars: ["--docs-callout-title-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: 700,
    },
    iconSize: {
      vars: ["--docs-callout-icon-size"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 16,
    },
    bodyTextScale: {
      vars: ["--docs-callout-body-text-scale"],
      kind: "number",
      min: 0.6,
      max: 1.5,
      step: 0.05,
      defaultValue: 1,
    },
    margin: {
      vars: ["--docs-callout-margin"],
      kind: "length",
      min: 0,
      max: 64,
      step: 1,
      unit: "px",
      defaultValue: 16,
    },
  },
  divider: {
    color: color("--docs-divider-color"),
    thickness: {
      vars: ["--docs-divider-thickness"],
      kind: "length",
      min: 0,
      max: 8,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    // Margin above and below, in em of the reading size.
    spacing: {
      vars: ["--docs-divider-spacing"],
      kind: "number",
      min: 0,
      max: 6,
      step: 0.05,
      defaultValue: 2.8571429,
    },
  },
  // Image and video share one figure shape: a bordered media frame plus a
  // caption line. `radius` follows the global --radius in semantic.css (2px
  // at stock).
  image: {
    border: color("--docs-image-border"),
    caption: color("--docs-image-caption-fg"),
    borderWidth: {
      vars: ["--docs-image-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    radius: {
      vars: ["--docs-image-radius"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 2,
    },
    captionTextSize: {
      vars: ["--docs-image-caption-text-size"],
      kind: "length",
      min: 9,
      max: 20,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    },
    captionGap: {
      vars: ["--docs-image-caption-gap"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 4,
    },
    margin: {
      vars: ["--docs-image-margin"],
      kind: "length",
      min: 0,
      max: 64,
      step: 1,
      unit: "px",
      defaultValue: 16,
    },
  },
  video: {
    border: color("--docs-video-border"),
    caption: color("--docs-video-caption-fg"),
    borderWidth: {
      vars: ["--docs-video-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    radius: {
      vars: ["--docs-video-radius"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 2,
    },
    captionTextSize: {
      vars: ["--docs-video-caption-text-size"],
      kind: "length",
      min: 9,
      max: 20,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    },
    captionGap: {
      vars: ["--docs-video-caption-gap"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 4,
    },
    margin: {
      vars: ["--docs-video-margin"],
      kind: "length",
      min: 0,
      max: 64,
      step: 1,
      unit: "px",
      defaultValue: 16,
    },
  },
  // File tree (docs-viewer file-tree/FileTreeDocsBlock). Every default is the
  // literal the component used to hardcode. `radius` follows the global
  // --radius in semantic.css (2px at stock). Each diff state (added / removed
  // / modified / renamed) is ONE knob writing three vars — name ink, gutter
  // marker, row tint base — whose stock values are three shades of one hue.
  // `changeTint` is a UNITLESS PERCENTAGE: the component multiplies it by 1%
  // inside color-mix(), because a rail colour override is an opaque hex and
  // the row wash has to stay translucent.
  "file-tree": {
    bg: color("--docs-file-tree-bg"),
    border: color("--docs-file-tree-border"),
    borderWidth: {
      vars: ["--docs-file-tree-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    radius: {
      vars: ["--docs-file-tree-radius"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 2,
    },
    padY: {
      vars: ["--docs-file-tree-pad-y"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 8,
    },
    padX: {
      vars: ["--docs-file-tree-pad-x"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 12,
    },
    textSize: {
      vars: ["--docs-file-tree-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    },
    lineHeight: {
      vars: ["--docs-file-tree-line-height"],
      kind: "length",
      min: 14,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: 24,
    },
    folderFg: color("--docs-file-tree-folder-fg"),
    folderWeight: {
      vars: ["--docs-file-tree-folder-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: 500,
    },
    fileFg: color("--docs-file-tree-file-fg"),
    fileWeight: {
      vars: ["--docs-file-tree-file-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: 400,
    },
    note: color("--docs-file-tree-note-fg"),
    noteTextSize: {
      vars: ["--docs-file-tree-note-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    },
    guide: color("--docs-file-tree-guide-fg"),
    mutedFg: color("--docs-file-tree-muted-fg"),
    added: color(
      "--docs-file-tree-added-fg",
      "--docs-file-tree-added-marker",
      "--docs-file-tree-added-tint",
    ),
    removed: color(
      "--docs-file-tree-removed-fg",
      "--docs-file-tree-removed-marker",
      "--docs-file-tree-removed-tint",
    ),
    modified: color(
      "--docs-file-tree-modified-fg",
      "--docs-file-tree-modified-marker",
      "--docs-file-tree-modified-tint",
    ),
    renamed: color(
      "--docs-file-tree-renamed-fg",
      "--docs-file-tree-renamed-marker",
      "--docs-file-tree-renamed-tint",
    ),
    changeTint: {
      vars: ["--docs-file-tree-change-tint"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 10,
    },
  },
  // Every value the table renders is a token here. Some of them DERIVE their
  // semantic.css default from another token rather than holding a literal:
  // Corner radius and Handle radius follow the global --radius (2px at
  // stock), Header text size follows Text size (size - 1px), and the three
  // Column rule tokens follow their Row rule twins. For those, the registry
  // default is what the derivation yields at stock, and a slider parked ON
  // that default means "follow the source token".
  "structured-table": {
    border: color("--docs-table-border"),
    borderWidth: {
      vars: ["--docs-table-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    radius: {
      vars: ["--docs-table-radius"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 2,
    },
    bg: color("--docs-table-bg"),
    headerBg: color("--docs-table-header-bg"),
    headerFg: color("--docs-table-header-fg"),
    headerTextSize: {
      vars: ["--docs-table-header-text-size"],
      kind: "length",
      min: 10,
      max: 24,
      step: 0.5,
      unit: "px",
      defaultValue: 13,
    },
    headerWeight: {
      vars: ["--docs-table-header-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: 500,
    },
    headerRule: color("--docs-table-header-rule"),
    headerRuleWidth: {
      vars: ["--docs-table-header-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 2,
    },
    headerRuleOpacity: {
      vars: ["--docs-table-header-rule-opacity"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 0.7,
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
    columnRule: color("--docs-table-column-rule"),
    columnRuleWidth: {
      vars: ["--docs-table-column-rule-width"],
      kind: "length",
      min: 0,
      max: 3,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    columnRuleOpacity: {
      vars: ["--docs-table-column-rule-opacity"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 1,
    },
    rowHoverBg: color("--docs-table-row-hover-bg"),
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
    // Floor for a body row's height; rows still grow to fit wrapped cells.
    // 0px lets Row padding alone set the height.
    rowMinHeight: {
      vars: ["--docs-table-row-min-height"],
      kind: "length",
      min: 0,
      max: 96,
      step: 1,
      unit: "px",
      defaultValue: 0,
    },
    // Body cell text. The range reaches past the prose default (18px) so a
    // table can be set level with the text around it.
    fontSize: {
      vars: ["--docs-table-font-size"],
      kind: "length",
      min: 10,
      max: 24,
      step: 0.5,
      unit: "px",
      defaultValue: 14,
    },
    // Unitless multiplier of the cell's own font size, header and body alike.
    lineHeight: {
      vars: ["--docs-table-line-height"],
      kind: "number",
      min: 1,
      max: 2.2,
      step: 0.05,
      defaultValue: 1.55,
    },
    bodyWeight: {
      vars: ["--docs-table-body-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: 400,
    },
    fg: color("--docs-table-fg"),
    // The optional title line above the table.
    titleFg: color("--docs-table-title-fg"),
    titleTextSize: {
      vars: ["--docs-table-title-text-size"],
      kind: "length",
      min: 10,
      max: 24,
      step: 0.5,
      unit: "px",
      defaultValue: 14,
    },
    titleWeight: {
      vars: ["--docs-table-title-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: 500,
    },
    titleGap: {
      vars: ["--docs-table-title-gap"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 6,
    },
    handleRadius: {
      vars: ["--docs-table-handle-radius"],
      kind: "length",
      min: 0,
      max: 10,
      step: 0.5,
      unit: "px",
      defaultValue: 2,
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
  // Interaction Surface shares State Shape's content styling, so most
  // --docs-interaction-* colors DEFAULT to the matching --docs-shape-* token
  // in semantic.css (and in the component's var() fallbacks): untouched, the
  // block follows the State shape knobs; set here, the override wins for this
  // block only. "Header" is the operation card header (its background is
  // per kind: Action / Query / Event); "Column head" is the Field / Type /
  // Signature strip. Every length default must equal both the semantic.css
  // default and the component's literal var() fallback, so a slider starts
  // where the unstyled block actually renders. Corner radius follows the global
  // --radius (2px at stock) in both modes.
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
    titleFg: color("--docs-interaction-title-fg"),
    headerFg: color("--docs-interaction-header-fg"),
    columnHeadBg: color("--docs-interaction-column-head-bg"),
    columnHeadFg: color("--docs-interaction-column-head-fg"),
    sigName: color("--docs-interaction-sig-name"),
    sigType: color("--docs-interaction-sig-type"),
    sigPunct: color("--docs-interaction-sig-punct"),
    noteName: color("--docs-interaction-note-name"),
    noteType: color("--docs-interaction-note-type"),
    noteTypeBg: color("--docs-interaction-note-type-bg"),
    noteFg: color("--docs-interaction-note-fg"),
    childRule: color("--docs-interaction-child-rule"),
    // Card frame: corner radius, border (also the header underline and the
    // pane divider, which are drawn as one frame), and the row hairlines.
    radius: {
      vars: ["--docs-interaction-radius"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 2,
    },
    borderWidth: {
      vars: ["--docs-interaction-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    ruleWidth: {
      vars: ["--docs-interaction-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    // One horizontal inset for the card header, column heads, and rows.
    padX: {
      vars: ["--docs-interaction-pad-x"],
      kind: "length",
      min: 4,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 16,
    },
    opGap: {
      vars: ["--docs-interaction-op-gap"],
      kind: "length",
      min: 0,
      max: 48,
      step: 1,
      unit: "px",
      defaultValue: 24,
    },
    // Block title (the caption above the cards).
    titleTextSize: {
      vars: ["--docs-interaction-title-text-size"],
      kind: "length",
      min: 10,
      max: 22,
      step: 0.5,
      unit: "px",
      defaultValue: 14,
    },
    titleWeight: {
      vars: ["--docs-interaction-title-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: 700,
    },
    titleGap: {
      vars: ["--docs-interaction-title-gap"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 12,
    },
    // Operation card header: its height comes from the vertical padding.
    headerPadY: {
      vars: ["--docs-interaction-header-pad-y"],
      kind: "length",
      min: 4,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 16,
    },
    headerTextSize: {
      vars: ["--docs-interaction-header-text-size"],
      kind: "length",
      min: 10,
      max: 22,
      step: 0.5,
      unit: "px",
      defaultValue: 14,
    },
    headerWeight: {
      vars: ["--docs-interaction-header-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: 700,
    },
    badgeTextSize: {
      vars: ["--docs-interaction-badge-text-size"],
      kind: "length",
      min: 8,
      max: 14,
      step: 0.5,
      unit: "px",
      defaultValue: 10,
    },
    // Operation purpose paragraph; the size also drives parameter tooltips.
    descTextSize: {
      vars: ["--docs-interaction-desc-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    },
    descLineHeight: {
      vars: ["--docs-interaction-desc-line-height"],
      kind: "length",
      min: 12,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 20,
    },
    // Field / Type / Signature / Returns strips.
    columnHeadTextSize: {
      vars: ["--docs-interaction-column-head-text-size"],
      kind: "length",
      min: 8,
      max: 14,
      step: 0.5,
      unit: "px",
      defaultValue: 10,
    },
    columnHeadPadY: {
      vars: ["--docs-interaction-column-head-pad-y"],
      kind: "length",
      min: 0,
      max: 20,
      step: 1,
      unit: "px",
      defaultValue: 8,
    },
    columnHeadRuleWidth: {
      vars: ["--docs-interaction-column-head-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 2,
    },
    // Parameter rows (the Field / Type ledger).
    rowPad: {
      vars: ["--docs-interaction-row-pad"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 12,
    },
    indent: {
      vars: ["--docs-interaction-indent"],
      kind: "length",
      min: 8,
      max: 48,
      step: 1,
      unit: "px",
      defaultValue: 22,
    },
    noteNameTextSize: {
      vars: ["--docs-interaction-note-name-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 13,
    },
    noteNameWeight: {
      vars: ["--docs-interaction-note-name-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: 600,
    },
    noteTypeTextSize: {
      vars: ["--docs-interaction-note-type-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    },
    // Signature text size, line height and gutter are NOT here: the signature
    // pane is a shared CodeLines panel, tuned once in the "linking" folder.
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
    headerFg: color("--docs-shape-header-fg"),
    // The strong structural line inside the card: the header's bottom rule
    // and the example-pane divider. (Border is the card frame.)
    headerRule: color("--docs-shape-header-rule"),
    descFg: color("--docs-shape-desc-fg"),
    childRule: color("--docs-shape-child-rule"),
    childBg: color("--docs-shape-child-bg"),
    columnHeadBg: color("--docs-shape-column-head-bg"),
    rowPad: {
      vars: ["--docs-shape-row-pad"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      // Must match semantic.css's --docs-shape-row-pad default (and the
      // component's var() fallback) so the slider starts where the unstyled
      // block actually renders. 6px keeps a field row near one text line;
      // the hairline separates rows, so they do not need the extra air.
      defaultValue: 6,
    },
    // Floor for a field row's height; rows still grow to fit wrapped names
    // or an open description. 0px lets Row padding alone set the height.
    rowMinHeight: {
      vars: ["--docs-shape-row-min-height"],
      kind: "length",
      min: 0,
      max: 64,
      step: 1,
      unit: "px",
      defaultValue: 0,
    },
    // Field-name weight. 400 (regular) by default: the mono face and the
    // tree rules already set names apart from the type column.
    nameWeight: {
      vars: ["--docs-shape-name-weight"],
      kind: "number",
      min: 300,
      max: 800,
      step: 100,
      defaultValue: 400,
    },
    // Field-name size. Also the name cell's font-size, so the tree tick
    // (placed at .65em) stays centred on the name as this changes.
    textSize: {
      vars: ["--docs-shape-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 13,
    },
    typeTextSize: {
      vars: ["--docs-shape-type-text-size"],
      kind: "length",
      min: 9,
      max: 16,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    },
    headerTextSize: {
      vars: ["--docs-shape-header-text-size"],
      kind: "length",
      min: 10,
      max: 22,
      step: 0.5,
      unit: "px",
      defaultValue: 14,
    },
    headerWeight: {
      vars: ["--docs-shape-header-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 100,
      defaultValue: 700,
    },
    // The uppercase "Field / Type" and "Example" column heads.
    columnHeadTextSize: {
      vars: ["--docs-shape-column-head-text-size"],
      kind: "length",
      min: 8,
      max: 14,
      step: 0.5,
      unit: "px",
      defaultValue: 10,
    },
    // Horizontal inset shared by the header, column heads and field rows.
    padX: {
      vars: ["--docs-shape-pad-x"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 16,
    },
    headerPadY: {
      vars: ["--docs-shape-header-pad-y"],
      kind: "length",
      min: 0,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 16,
    },
    columnHeadPadY: {
      vars: ["--docs-shape-column-head-pad-y"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 8,
    },
    // The frame, header-rule, pane-divider, texture and tree-tick /
    // tree-inset defaults below are the LIGHT values. semantic.css's dark
    // block keeps the heavier dark rendering (2px frame / header rule /
    // divider, 0.4 texture, 10px tick, 8px inset), so in
    // dark the slider rests at the light number until it is moved — the
    // same one-default-two-modes trade as the process-outline strengths.
    borderWidth: {
      vars: ["--docs-shape-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    radius: {
      vars: ["--docs-shape-radius"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 2,
    },
    // Hairline under each field row.
    ruleWidth: {
      vars: ["--docs-shape-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    headerRuleWidth: {
      vars: ["--docs-shape-header-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    columnHeadRuleWidth: {
      vars: ["--docs-shape-column-head-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 2,
    },
    // Divider between the field list and the example pane (left edge when
    // side by side, top edge when stacked).
    paneRuleWidth: {
      vars: ["--docs-shape-pane-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    headerTextureOpacity: {
      vars: ["--docs-shape-header-texture-opacity"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 0.1,
    },
    // Nested-field tree geometry: per-level indent, the horizontal tick's
    // length, the first rail's inset from the row edge, and the line width.
    indent: {
      vars: ["--docs-shape-indent"],
      kind: "length",
      min: 8,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: 22,
    },
    treeTick: {
      vars: ["--docs-shape-tree-tick"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 8,
    },
    treeInset: {
      vars: ["--docs-shape-tree-inset"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 6,
    },
    childRuleWidth: {
      vars: ["--docs-shape-child-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
  },
  // Process Outline (docs-viewer process-outline/ProcessOutlineDocsBlock). Every
  // default is the value the approved renderer draws, and the component reads
  // each var with that same literal as its fallback. The connector rail is
  // overlapping elbow + stem strokes, so rail and depth colors must stay opaque
  // — alpha doubles up at the joins. Rail colors depth 0 (root lines); Depth
  // 1..6 color each nesting level's rail, elbow, arrowhead, chips and trace
  // pill, and levels past 6 inherit depth 6. Deep ink (depth >= 3) derives
  // from ink in semantic.css.
  // The strength knobs (-tint / -mix / accent) are UNITLESS PERCENTAGES, not
  // lengths: the component multiplies them by 1% inside color-mix() at the use
  // site, because a var() in a custom property resolves at :root where the
  // depth color does not exist. Colors whose light and dark semantic.css
  // values differ take one rail override for both modes. Text-size minimums
  // sit at the renderer's 12px floor (13px for the root line), so no slider
  // travel is dead.
  "process-outline": {
    ink: color("--docs-process-outline-ink"),
    deepInk: color("--docs-process-outline-deep-ink"),
    rail: color("--docs-process-outline-rail"),
    cycle1: color("--docs-process-outline-cycle-1"),
    cycle2: color("--docs-process-outline-cycle-2"),
    cycle3: color("--docs-process-outline-cycle-3"),
    cycle4: color("--docs-process-outline-cycle-4"),
    cycle5: color("--docs-process-outline-cycle-5"),
    cycle6: color("--docs-process-outline-cycle-6"),
    keywordFg: color("--docs-process-outline-keyword-fg"),
    noteFg: color("--docs-process-outline-note-fg"),
    // Note rule and bullet dots are flat colors of their own (the approved
    // design tunes note text, dots and rule independently); Note accent
    // strength mixes the level's depth color into both and is 0 by default.
    noteRule: color("--docs-process-outline-note-rule"),
    noteBullet: color("--docs-process-outline-note-bullet"),
    noteBg: color("--docs-process-outline-note-bg"),
    noteBorder: color("--docs-process-outline-note-border"),
    codeBg: color("--docs-process-outline-code-bg"),
    traceBg: color("--docs-process-outline-trace-bg"),
    selectBg: color("--docs-process-outline-select-bg"),
    // The flow frame: top/bottom rules and the padding inside them. Bottom
    // padding is Padding Y + 1px (the approved optical offset).
    border: color("--docs-process-outline-border"),
    borderWidth: {
      vars: ["--docs-process-outline-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    padY: {
      vars: ["--docs-process-outline-pad-y"],
      kind: "length",
      min: 0,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: 14,
    },
    padX: {
      vars: ["--docs-process-outline-pad-x"],
      kind: "length",
      min: 0,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: 16,
    },
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
      defaultValue: 12,
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
      defaultValue: 2,
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
      min: 12,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12.5,
    },
    rootTextSize: {
      vars: ["--docs-process-outline-root-text-size"],
      kind: "length",
      min: 13,
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
    keywordWeight: {
      vars: ["--docs-process-outline-keyword-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: 700,
    },
    emptyTextSize: {
      vars: ["--docs-process-outline-empty-text-size"],
      kind: "length",
      min: 12,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    },
    noteTextSize: {
      vars: ["--docs-process-outline-note-text-size"],
      kind: "length",
      min: 12,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
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
      defaultValue: 8,
    },
    // Notes are bullet lines behind a 1px left rule. The card box (border,
    // fill, horizontal padding) sits at zero/transparent, and a theme that
    // wants the bordered card back (classic) sets those tokens — "no box" is
    // expressed in tokens instead of in a second DOM shape.
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
      defaultValue: 1,
    },
    notePadY: {
      vars: ["--docs-process-outline-note-pad-y"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 1,
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
    // Space between the left rule and the bullets, on top of Note padding X.
    noteRuleGap: {
      vars: ["--docs-process-outline-note-rule-gap"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 8,
    },
    // The trace mark is a mini pill reading "trace" at the end of the step
    // line. Its two strength knobs are the CHIP formula reused, so a theme
    // tunes both families the same way.
    traceTextSize: {
      vars: ["--docs-process-outline-trace-text-size"],
      kind: "length",
      min: 12,
      max: 16,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    },
    // A hairline outline in the line's depth color marks the step being
    // hand-edited (the block-wide selection wash is suppressed); 0 leaves
    // just the caret.
    focusRing: {
      vars: ["--docs-process-outline-focus-ring"],
      kind: "length",
      min: 0,
      max: 3,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
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
      defaultValue: 0,
    },
    chipTint: {
      vars: ["--docs-process-outline-chip-tint"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 10,
    },
    chipInkMix: {
      vars: ["--docs-process-outline-chip-ink-mix"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 64,
    },
    traceTint: {
      vars: ["--docs-process-outline-trace-tint"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 10,
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
      defaultValue: 15,
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
  // Sequence embed (docs-workbench pages/SequenceEmbed + sequence-embed.css).
  // The frame knobs style the inline preview the docs viewer owns. The diagram
  // colors feed the sequence package's own --seq-* vars (mapped in
  // sequence-embed.css), so they recolor the SVG without touching the package;
  // a color set in the diagram's own style section still wins. Actor border
  // follows Diagram lines and Note background follows Actor fill until set.
  // The diagram is light-on-white in both modes today, so every default is the
  // same in light and dark.
  sequence: {
    border: color("--docs-sequence-border"),
    bg: color("--docs-sequence-bg"),
    expandFg: color("--docs-sequence-expand-fg"),
    diagramBg: color("--docs-sequence-diagram-bg"),
    diagramText: color("--docs-sequence-diagram-text"),
    diagramLine: color("--docs-sequence-line"),
    actorFill: color("--docs-sequence-actor-fill"),
    actorBorder: color("--docs-sequence-actor-border"),
    noteBg: color("--docs-sequence-note-bg"),
    fragment: color("--docs-sequence-fragment"),
    borderWidth: {
      vars: ["--docs-sequence-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    radius: {
      vars: ["--docs-sequence-radius"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 2,
    },
    padding: {
      vars: ["--docs-sequence-padding"],
      kind: "length",
      min: 0,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: 12,
    },
    // Cap on the inline preview's height; the 55vh viewport cap still applies.
    maxHeight: {
      vars: ["--docs-sequence-max-height"],
      kind: "length",
      min: 160,
      max: 1200,
      step: 20,
      unit: "px",
      defaultValue: 420,
    },
    expandTextSize: {
      vars: ["--docs-sequence-expand-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    },
  },
  // Canvas embed (docs-workbench pages/CanvasEmbed): the frame around the
  // inline board. `radius` follows the global --radius in semantic.css (2px at
  // stock). The board paints its own opaque background (canvas package), so
  // Background shows only in the Padding mat, which is 0 by default.
  canvas: {
    border: color("--docs-canvas-border"),
    bg: color("--docs-canvas-bg"),
    borderWidth: {
      vars: ["--docs-canvas-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    },
    radius: {
      vars: ["--docs-canvas-radius"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 2,
    },
    padding: {
      vars: ["--docs-canvas-padding"],
      kind: "length",
      min: 0,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: 0,
    },
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
