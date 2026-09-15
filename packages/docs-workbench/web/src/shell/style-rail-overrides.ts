import { THEME_TOKEN_REGISTRY } from "../theme/theme-folders";
import {
  getStyleRailBaseline,
  hasBlockColumnSplit,
  isBlockLayoutType,
  type StyleRailSettings,
} from "./StyleRail";
import type { StyleRailPaneId } from "./style-rail-nav";

export type StyleRailSettingLeafPath =
  | "accent"
  | "annotate.accent"
  | "annotate.add"
  | "annotate.del"
  | "annotate.washOpacity"
  | "annotate.actionPaneWidth"
  | "colors.background"
  | "colors.sidebar"
  | "colors.text"
  | "typography.bodyFont"
  | "typography.headingFont"
  | "typography.codeFont"
  | "typography.numberFont"
  | "typography.fontSize"
  | "typography.lineHeight"
  | "typography.letterSpacing"
  | "layout.contentWidth"
  | "layout.wideWidth"
  | "layout.contentMargin"
  | "layout.topPadding"
  | "layout.titlePadding"
  | "layout.bottomPadding"
  | "layout.radius"
  | "layout.borderStrength"
  | "layout.backgroundTint"
  | "layout.sidebarTint"
  | "sidebar.textColor"
  | "sidebar.font"
  | "sidebar.fontSize"
  | "sidebar.padding"
  | "sidebar.guides"
  | "sidebar.guideColor"
  | "sidebar.guideWidth"
  | "sidebar.guideOpacity"
  | "grain.enabled"
  | "grain.opacity"
  | "grain.frequency"
  | "grain.contrast"
  | "grain.blendMode"
  | "grain.softening.background"
  | "grain.softening.font"
  | "grain.softening.icons"
  | "highlight.color"
  | "highlight.radius"
  | "highlight.padding"
  | "highlight.dragOpacity"
  | "highlight.dropColor"
  | "highlight.dropWidth"
  | "highlight.dropOpacity"
  | "highlight.dropRadius"
  | "dragSelect.color"
  | "dragSelect.opacity"
  | "list.discSize"
  | "list.circleSize"
  | "list.circleThickness"
  | "list.squareSize"
  | "list.indent"
  | "grip.gap"
  | "grip.offsetY"
  | "grip.size"
  | "grip.color"
  | "grip.fadeMs"
  | "scrollbar.width"
  | "scrollbar.color"
  | "scrollbar.opacity"
  | "scrollbar.padding"
  | "transition.type"
  | "transition.fadeOutMs"
  | "transition.fadeInMs"
  | "peek.width"
  | "peek.durationMs"
  | "peek.padding"
  | "peek.dividerColor"
  | "peek.dividerWidth"
  | "peek.dividerStyle"
  | "reference.color"
  | "reference.underlineColor"
  | "reference.iconSize"
  | "reference.iconColor"
  | "reference.iconGap"
  | "reference.iconPosition"
  // Per-block-type lane overrides. Template members rather than 32 literals:
  // the map is keyed by doc block type, and the pane that owns each pair is
  // derived (see blockLayoutPaneLeaves) instead of hand-listed, so a new
  // block type cannot be added to the schema and silently miss its leaves.
  | `blockLayout.${string}.width`
  | `blockLayout.${string}.justify`
  | `blockLayout.${string}.columnSplit`;

export type StyleRailLeafRef =
  | { kind: "setting"; path: StyleRailSettingLeafPath }
  | { kind: "component"; file: string; key: string };

export function settingLeaf(path: StyleRailSettingLeafPath): StyleRailLeafRef {
  return { kind: "setting", path };
}

export function componentLeaf(file: string, key: string): StyleRailLeafRef {
  return { kind: "component", file, key };
}

const PANE_SETTING_LEAVES: Partial<
  Record<StyleRailPaneId, readonly StyleRailSettingLeafPath[]>
> = {
  "layout.transitions": ["transition.type", "transition.fadeOutMs", "transition.fadeInMs"],
  "theme.colors": ["accent", "colors.background", "colors.sidebar", "colors.text"],
  "theme.annotate": [
    "annotate.accent",
    "annotate.add",
    "annotate.del",
    "annotate.washOpacity",
    "annotate.actionPaneWidth",
  ],
  "theme.typography": [
    "typography.bodyFont",
    "typography.headingFont",
    "typography.codeFont",
    "typography.numberFont",
    "typography.fontSize",
    "typography.lineHeight",
    "typography.letterSpacing",
  ],
  "theme.background": [
    "grain.enabled",
    "grain.opacity",
    "grain.frequency",
    "grain.contrast",
    "grain.blendMode",
    "grain.softening.background",
    "grain.softening.font",
    "grain.softening.icons",
  ],
  "theme.references": [
    "reference.color",
    "reference.underlineColor",
    "reference.iconSize",
    "reference.iconColor",
    "reference.iconGap",
    "reference.iconPosition",
  ],
  "blocks.list-item": [
    "list.discSize",
    "list.circleSize",
    "list.circleThickness",
    "list.squareSize",
    "list.indent",
  ],
  "theme.surfaces": [
    "layout.radius",
    "layout.borderStrength",
    "layout.backgroundTint",
    "layout.sidebarTint",
  ],
  // The Sidebar pane also renders colors.sidebar as a convenient Background
  // row. That leaf belongs to theme.colors, so it affects the row dot but not
  // the layout.sidebar pane count.
  "layout.sidebar": [
    "sidebar.textColor",
    "sidebar.font",
    "sidebar.fontSize",
    "sidebar.padding",
    "sidebar.guides",
    "sidebar.guideColor",
    "sidebar.guideWidth",
    "sidebar.guideOpacity",
  ],
  "layout.scrollbar": [
    "scrollbar.width",
    "scrollbar.color",
    "scrollbar.opacity",
    "scrollbar.padding",
  ],
  "layout.side-peek": [
    "peek.width",
    "peek.durationMs",
    "peek.padding",
    "peek.dividerColor",
    "peek.dividerWidth",
    "peek.dividerStyle",
  ],
  "layout.editor": [
    "layout.contentWidth",
    "layout.wideWidth",
    "layout.contentMargin",
    "layout.topPadding",
    "layout.titlePadding",
    "layout.bottomPadding",
    "highlight.color",
    "highlight.radius",
    "highlight.padding",
    "highlight.dragOpacity",
    "highlight.dropColor",
    "highlight.dropWidth",
    "highlight.dropOpacity",
    "highlight.dropRadius",
    "dragSelect.color",
    "dragSelect.opacity",
    "grip.gap",
    "grip.offsetY",
    "grip.size",
    "grip.color",
    "grip.fadeMs",
  ],
};

type ComponentPaneId = Extract<StyleRailPaneId, `blocks.${string}`> | "theme.surfaces";

const PANE_COMPONENT_FILE: Partial<Record<StyleRailPaneId, string>> = {
  "blocks.inline-code": "inline-code",
  "blocks.paragraph": "paragraph",
  "blocks.heading": "heading",
  "blocks.list-item": "list-item",
  "blocks.quote": "quote",
  "blocks.code": "code",
  "blocks.callout": "callout",
  "blocks.divider": "divider",
  "blocks.image": "image",
  "blocks.video": "video",
  "blocks.file-tree": "file-tree",
  "blocks.structured-table": "structured-table",
  "blocks.interaction-surface": "interaction-surface",
  "blocks.state-shape": "state-shape",
  "blocks.linking": "linking",
  "blocks.process-outline": "process-outline",
  "blocks.sequence": "sequence",
  "blocks.canvas": "canvas",
  "theme.surfaces": "surfaces",
} satisfies Record<ComponentPaneId, string>;

function settingValue(
  settings: StyleRailSettings,
  path: StyleRailSettingLeafPath,
): string | number | boolean | null {
  const parts = path.split(".");
  let value: unknown = settings;
  for (const part of parts) {
    // The blockLayout map is SPARSE — most block types have no entry, and an
    // entry may carry only one of the two fields. Walking off the end is the
    // normal "no override here" case, not a bug, so it reads as null rather
    // than throwing on a property access against undefined.
    if (value === null || value === undefined) return null;
    value = (value as Record<string, unknown>)[part];
  }
  return (value ?? null) as string | number | boolean | null;
}

/**
 * The two lane leaves a block-type pane owns. Derived from the pane's
 * component file so the pane list and the block-type list cannot drift: a
 * pane whose file is not a doc block type (inline-code, linking, shell,
 * surfaces, editor-controls) owns no lane leaves and gets none.
 */
function blockLayoutPaneLeaves(paneId: StyleRailPaneId): readonly StyleRailSettingLeafPath[] {
  const file = PANE_COMPONENT_FILE[paneId];
  if (!file || !isBlockLayoutType(file)) return [];
  return [
    `blockLayout.${file}.width`,
    `blockLayout.${file}.justify`,
    // Only the two-pane blocks own a split, so only they can have it drift.
    ...(hasBlockColumnSplit(file)
      ? ([`blockLayout.${file}.columnSplit`] as const)
      : []),
  ];
}

/**
 * Is this leaf an OVERRIDE — i.e. has it drifted from what the repo says
 * "default" is?
 *
 * The reference is the repo BASELINE (`themes/<id>/theme.json`
 * railDefaults), not the compiled-in stock constant. This is the user-
 * facing sense of "default": a knob left at the committed theme value is
 * NOT an override, because every other consumer of this repo renders that
 * same value. Only local drift lights a dot. (styleRailVars still measures
 * against stock — see its docstring — because "no override" there means
 * "let semantic.css answer", which is a different question.)
 *
 * Component tokens keep comparing against the registry default: those live
 * in the theme's own token files, so a value equal to the registry default
 * is genuinely nothing to persist.
 */
export function isLeafOverridden(
  settings: StyleRailSettings,
  leaf: StyleRailLeafRef,
): boolean {
  if (leaf.kind === "setting") {
    return settingValue(settings, leaf.path)
      !== settingValue(getStyleRailBaseline(), leaf.path);
  }

  const token = THEME_TOKEN_REGISTRY[leaf.file]?.[leaf.key];
  const fileSettings = settings.components[leaf.file];
  if (!token || !fileSettings || !Object.hasOwn(fileSettings, leaf.key)) return false;
  if (token.kind === "color") return true;
  return fileSettings[leaf.key] !== `${token.defaultValue}${token.unit ?? ""}`;
}

export function paneOverrideCount(
  settings: StyleRailSettings,
  paneId: StyleRailPaneId,
): number {
  let count = [
    ...(PANE_SETTING_LEAVES[paneId] ?? []),
    ...blockLayoutPaneLeaves(paneId),
  ].reduce(
    (total, path) => total + Number(isLeafOverridden(settings, settingLeaf(path))),
    0,
  );

  const file = PANE_COMPONENT_FILE[paneId];
  if (!file) return count;
  for (const key of Object.keys(THEME_TOKEN_REGISTRY[file] ?? {})) {
    count += Number(isLeafOverridden(settings, componentLeaf(file, key)));
  }
  return count;
}
