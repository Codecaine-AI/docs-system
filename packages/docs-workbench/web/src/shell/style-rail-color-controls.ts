/**
 * The Style rail's color controls, hidden for now (owner decision for style
 * engines in the @codecaine-ai/design-system rollout: keep the size, density,
 * grain and opacity controls, hide the color controls and keep their code, so
 * saved colors stop overriding the shared look).
 *
 * While the switch is off:
 *  - the panes render no color picker and no Accent choice
 *    (style-rail-panes.tsx);
 *  - no stored color paints: styleRailVars treats every color leaf below as
 *    stock, whether it came from this browser's cache, the repo theme's
 *    railDefaults or the shared global theme, and compileThemeCss drops a
 *    theme folder's color tokens, so the design-system tokens answer;
 *  - the stored values themselves are kept (normalizeSettings, Export theme,
 *    the repo and global theme writes), so turning the switch back on brings
 *    them back unchanged;
 *  - the tint, opacity and strength sliders stay: they are intensity
 *    controls, like grain.
 *
 * No imports, so theme-folders.ts and style-rail-settings.ts can both read it
 * without an import cycle.
 */

/** The shipped state of the switch. */
export const SHOW_STYLE_RAIL_COLOR_CONTROLS = false;

let colorControls = SHOW_STYLE_RAIL_COLOR_CONTROLS;

/** True when the rail shows its color controls and stored colors paint. */
export function styleRailColorControls(): boolean {
  return colorControls;
}

/**
 * Turns the kept color controls back on (or off) for this page: a host that
 * wants them, and the suites that keep the color code tested. Callers re-apply
 * the rail afterwards (applyStyleRailVars, applyThemeCss).
 */
export function setStyleRailColorControls(enabled: boolean): void {
  colorControls = enabled;
}

/**
 * Every settings leaf that holds a color pick (or the accent family). The
 * per-component color tokens are the other half: THEME_TOKEN_REGISTRY entries
 * of kind "color".
 */
export const STYLE_RAIL_COLOR_LEAVES = [
  "accent",
  "colors.background",
  "colors.sidebar",
  "colors.text",
  "sidebar.textColor",
  "sidebar.guideColor",
  "highlight.color",
  "highlight.dropColor",
  "dragSelect.color",
  "grip.color",
  "scrollbar.color",
  "peek.dividerColor",
  "reference.color",
  "reference.underlineColor",
  "reference.iconColor",
  "annotate.accent",
  "annotate.add",
  "annotate.del",
] as const;

export type StyleRailColorLeaf = (typeof STYLE_RAIL_COLOR_LEAVES)[number];

const COLOR_LEAF_SET: ReadonlySet<string> = new Set(STYLE_RAIL_COLOR_LEAVES);

export function isStyleRailColorLeaf(path: string): path is StyleRailColorLeaf {
  return COLOR_LEAF_SET.has(path);
}
