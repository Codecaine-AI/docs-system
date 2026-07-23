import { THEME_TOKEN_REGISTRY } from "../theme/theme-folders";
import {
  DEFAULT_STYLE_RAIL_SETTINGS,
  type StyleRailSettings,
} from "./StyleRail";
import type { StyleRailPaneId } from "./style-rail-nav";

export type StyleRailSettingLeafPath =
  | "accent"
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
  | "reference.iconPosition";

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
  "theme.colors": ["accent", "colors.background", "colors.sidebar", "colors.text"],
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
  "layout.column": [
    "layout.contentWidth",
    "layout.contentMargin",
    "layout.topPadding",
    "layout.titlePadding",
    "layout.bottomPadding",
  ],
  "layout.surfaces": [
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

function settingValue(
  settings: StyleRailSettings,
  path: StyleRailSettingLeafPath,
): string | number | boolean | null {
  const parts = path.split(".");
  let value: unknown = settings;
  for (const part of parts) value = (value as Record<string, unknown>)[part];
  return value as string | number | boolean | null;
}

export function isLeafOverridden(
  settings: StyleRailSettings,
  leaf: StyleRailLeafRef,
): boolean {
  if (leaf.kind === "setting") {
    return settingValue(settings, leaf.path)
      !== settingValue(DEFAULT_STYLE_RAIL_SETTINGS, leaf.path);
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
  let count = (PANE_SETTING_LEAVES[paneId] ?? []).reduce(
    (total, path) => total + Number(isLeafOverridden(settings, settingLeaf(path))),
    0,
  );

  if (!paneId.startsWith("blocks.")) return count;
  const file = paneId.slice("blocks.".length);
  for (const key of Object.keys(THEME_TOKEN_REGISTRY[file] ?? {})) {
    count += Number(isLeafOverridden(settings, componentLeaf(file, key)));
  }
  return count;
}
