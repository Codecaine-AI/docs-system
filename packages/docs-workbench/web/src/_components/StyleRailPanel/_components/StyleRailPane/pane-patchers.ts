import { getStyleRailBaseline, type StyleRailSettings, type BlockLayoutOverride } from "../../../../shared/style-rail-settings";
import { THEME_TOKEN_REGISTRY } from "../../../../theme/theme-folders";
import { componentLeaf, isLeafOverridden } from "../../overrides";

export function createPanePatchers(settings: StyleRailSettings, onSettingsChange: (settings: StyleRailSettings) => void) {
  const { colors, typography, layout, grain } = settings;
  const patchColors = (patch: Partial<StyleRailSettings["colors"]>) =>
    onSettingsChange({ ...settings, colors: { ...colors, ...patch } });
  const patchTypography = (patch: Partial<StyleRailSettings["typography"]>) =>
    onSettingsChange({ ...settings, typography: { ...typography, ...patch } });
  const patchLayout = (patch: Partial<StyleRailSettings["layout"]>) =>
    onSettingsChange({ ...settings, layout: { ...layout, ...patch } });
  const patchSidebar = (patch: Partial<StyleRailSettings["sidebar"]>) =>
    onSettingsChange({ ...settings, sidebar: { ...settings.sidebar, ...patch } });
  const patchGrain = (patch: Partial<StyleRailSettings["grain"]>) =>
    onSettingsChange({ ...settings, grain: { ...grain, ...patch } });
  const patchSoftening = (patch: Partial<StyleRailSettings["grain"]["softening"]>) =>
    patchGrain({ softening: { ...grain.softening, ...patch } });
  const patchHighlight = (patch: Partial<StyleRailSettings["highlight"]>) =>
    onSettingsChange({ ...settings, highlight: { ...settings.highlight, ...patch } });
  const patchGrip = (patch: Partial<StyleRailSettings["grip"]>) =>
    onSettingsChange({ ...settings, grip: { ...settings.grip, ...patch } });
  const patchScrollbar = (patch: Partial<StyleRailSettings["scrollbar"]>) =>
    onSettingsChange({ ...settings, scrollbar: { ...settings.scrollbar, ...patch } });
  const patchDragSelect = (patch: Partial<StyleRailSettings["dragSelect"]>) =>
    onSettingsChange({ ...settings, dragSelect: { ...settings.dragSelect, ...patch } });
  const patchList = (patch: Partial<StyleRailSettings["list"]>) =>
    onSettingsChange({ ...settings, list: { ...settings.list, ...patch } });
  const patchPeek = (patch: Partial<StyleRailSettings["peek"]>) =>
    onSettingsChange({ ...settings, peek: { ...settings.peek, ...patch } });
  const patchReference = (patch: Partial<StyleRailSettings["reference"]>) =>
    onSettingsChange({ ...settings, reference: { ...settings.reference, ...patch } });
  const patchAnnotate = (patch: Partial<StyleRailSettings["annotate"]>) =>
    onSettingsChange({ ...settings, annotate: { ...settings.annotate, ...patch } });
  const patchComponent = (file: string, key: string, value: string | null) => {
    const fileTokens = { ...(settings.components[file] ?? {}) };
    if (value === null) delete fileTokens[key];
    else fileTokens[key] = value;
    const components = { ...settings.components };
    if (Object.keys(fileTokens).length === 0) delete components[file];
    else components[file] = fileTokens;
    onSettingsChange({ ...settings, components });
  };
  /**
   * Patches one block type's lane override. The map is SPARSE by contract —
   * an entry with no fields left is DELETED rather than kept as `{}`, because
   * "absent" is what means "inherit the code default from block-layout.ts".
   * Keeping an empty object would read as an override in the UI and emit a
   * rule with no declarations.
   */
  const patchBlockLayout = (file: string, patch: BlockLayoutOverride) => {
    const current = settings.blockLayout[file] ?? {};
    const next: BlockLayoutOverride = { ...current };
    // A key PRESENT in the patch with an `undefined` value means "clear this
    // field" (the Default option); a key absent from the patch means "leave it
    // alone". Collapsing those two would make setting Justification wipe the
    // Width the user just chose, so the distinction is `in`, not `=== undefined`.
    if ("width" in patch) {
      if (patch.width === undefined) delete next.width;
      else next.width = patch.width;
    }
    if ("justify" in patch) {
      if (patch.justify === undefined) delete next.justify;
      else next.justify = patch.justify;
    }
    if ("columnSplit" in patch) {
      if (patch.columnSplit === undefined) delete next.columnSplit;
      else next.columnSplit = patch.columnSplit;
    }
    const blockLayout = { ...settings.blockLayout };
    if (
      next.width === undefined
      && next.justify === undefined
      && next.columnSplit === undefined
    ) {
      delete blockLayout[file];
    } else blockLayout[file] = next;
    onSettingsChange({ ...settings, blockLayout });
  };

  const resetComponent = (file: string) => {
    const components = { ...settings.components };
    delete components[file];
    // The pane's reset clears everything the pane owns. Lane and list values
    // live in railDefaults, so "to theme" must restore the active theme's
    // repo baseline rather than delete them back to the compiled-in stock
    // values. Component tokens are already compiled from components/*.json,
    // which is why clearing their inline overrides above remains correct.
    const baseline = getStyleRailBaseline();
    const blockLayout = { ...settings.blockLayout };
    const baselineBlockLayout = baseline.blockLayout[file];
    if (baselineBlockLayout) blockLayout[file] = { ...baselineBlockLayout };
    else delete blockLayout[file];
    onSettingsChange({
      ...settings,
      components,
      blockLayout,
      ...(file === "list-item"
        ? { list: { ...baseline.list } }
        : {}),
    });
  };

  const hasComponentOverrides = (file: string) =>
    Object.keys(THEME_TOKEN_REGISTRY[file] ?? {}).some((key) =>
      isLeafOverridden(settings, componentLeaf(file, key))
    );

  return { patchColors, patchTypography, patchLayout, patchSidebar, patchGrain, patchSoftening, patchHighlight, patchGrip, patchScrollbar, patchDragSelect, patchList, patchPeek, patchReference, patchAnnotate, patchComponent, patchBlockLayout, resetComponent, hasComponentOverrides };
}
