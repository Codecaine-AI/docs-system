import { createContext, useContext, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@codecaine-ai/docs-viewer/ui/cn";
import { THEME_TOKEN_REGISTRY } from "../theme/theme-folders";
import {
  BLOCK_COLUMN_SPLIT_DEFAULTS,
  BLOCK_COLUMN_SPLIT_MAX,
  BLOCK_COLUMN_SPLIT_MIN,
  BLOCK_LAYOUT_CUSTOM_WIDTH_MAX,
  BLOCK_LAYOUT_CUSTOM_WIDTH_MIN,
  getStyleRailBaseline,
  hasBlockColumnSplit,
  isBlockLayoutType,
  type BlockLayoutOverride,
  type AccentFamily,
  type FontChoice,
  type GrainBlendMode,
  type NumberFontChoice,
  type PeekDividerStyle,
  type ReferenceIconPosition,
  type StyleRailSettings,
  type ThemePickerEntry,
} from "./StyleRail";
import {
  componentLeaf,
  isLeafOverridden,
  paneOverrideCount,
  settingLeaf,
  type StyleRailLeafRef,
} from "./style-rail-overrides";
import { getStyleRailPaneItem, type StyleRailPaneId } from "./style-rail-nav";

/*
 * Rows read the current settings through this local context so every dot is
 * resolved by the same helper that computes pane counts.
 */
const OverrideSettingsContext = createContext<StyleRailSettings | null>(null);

function OverrideDot({ leaf }: { leaf?: StyleRailLeafRef }) {
  const settings = useContext(OverrideSettingsContext);
  if (!leaf || !settings) return null;
  const overridden = isLeafOverridden(settings, leaf);
  return (
    <span
      aria-hidden="true"
      className="style-rail-row-override-dot"
      data-overridden={overridden ? "true" : "false"}
    />
  );
}

function RowLabel({ label, leaf }: { label: string; leaf?: StyleRailLeafRef }) {
  return (
    <span className="style-rail-row-label">
      <OverrideDot leaf={leaf} />
      <span>{label}</span>
    </span>
  );
}

const ACCENT_OPTIONS: Array<{ id: AccentFamily; label: string }> = [
  { id: "blue", label: "Blue" },
  { id: "purple", label: "Purple" },
  { id: "pink", label: "Pink" },
  { id: "red", label: "Red" },
  { id: "orange", label: "Orange" },
  { id: "yellow", label: "Yellow" },
  { id: "green", label: "Green" },
  { id: "brown", label: "Brown" },
  { id: "gray", label: "Gray" },
];

const FONT_OPTIONS: Array<{ id: FontChoice; label: string }> = [
  { id: "sans", label: "System Sans" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
];

const NUMBER_FONT_OPTIONS: Array<{ id: NumberFontChoice; label: string }> = [
  { id: "body", label: "Body font" },
  ...FONT_OPTIONS,
];

const PEEK_DIVIDER_STYLE_OPTIONS: Array<{ id: PeekDividerStyle; label: string }> = [
  { id: "solid", label: "Solid" },
  { id: "dashed", label: "Dashed" },
  { id: "dotted", label: "Dotted" },
  { id: "double", label: "Double" },
];

const REFERENCE_ICON_POSITION_OPTIONS: Array<{
  id: ReferenceIconPosition;
  label: string;
}> = [
  { id: "before", label: "Before text" },
  { id: "after", label: "After text" },
];

const BLEND_OPTIONS: Array<{ id: GrainBlendMode; label: string }> = [
  { id: "auto", label: "Auto" },
  { id: "multiply", label: "Multiply · darken" },
  { id: "screen", label: "Screen · lighten" },
  { id: "overlay", label: "Overlay" },
  { id: "normal", label: "Normal" },
];

const TOKEN_KEY_LABELS: Record<string, string> = {
  fg: "Text",
  bg: "Background",
  border: "Border",
  fill: "Fill",
  marker: "Marker",
  caption: "Caption",
  note: "Note",
  headerBg: "Header background",
  headerFg: "Header text",
  headerRule: "Header rule",
  headerRuleWidth: "Header rule width",
  headerRuleOpacity: "Header rule opacity",
  rowRule: "Row rule",
  rowRuleWidth: "Row rule width",
  rowRuleOpacity: "Row rule opacity",
  name: "Names",
  type: "Types",
  rule: "Rules",
  sigName: "Signature name",
  sigType: "Signature type",
  sigPunct: "Signature punctuation",
  noteName: "Note name",
  noteType: "Note type",
  noteFg: "Note text",
  descFg: "Description text",
  childRule: "Child rule",
  rowPad: "Row padding",
  opGap: "Card gap",
  cellPaddingY: "Row padding",
  cellPaddingX: "Column gap",
  fontSize: "Text size",
  radius: "Corner radius",
  handleRadius: "Handle radius",
  handleOffset: "Handle offset",
  selectionPadding: "Selection padding",
  color: "Color",
  string: "Strings",
  number: "Numbers",
  boolean: "Booleans",
  null: "Null",
  key: "Keys",
  muted: "Muted fill",
  icon: "Icons",
  languageFg: "Language badge",
  annotationAccent: "Annotation accent",
  gutterFg: "Line numbers",
  gutterBg: "Gutter background",
  zebra: "Zebra stripe",
  highlight: "Link highlight",
  pin: "Pin & rail",
  ink: "Ink",
  rail: "Rail",
  cycle1: "Depth 1 color",
  cycle2: "Depth 2 color",
  cycle3: "Depth 3 color",
  cycle4: "Depth 4 color",
  cycle5: "Depth 5 color",
  keywordFg: "Loop keyword",
  noteBg: "Note background",
  noteBorder: "Note border",
  codeBg: "Code background",
  indent: "Indent",
  rowGap: "Row gap",
  branchGap: "Branch gap",
  rootGap: "Root gap",
  arrowGap: "Arrow gap",
  lineHeight: "Line height",
  textSize: "Text size",
  rootTextSize: "Root text size",
  rootWeight: "Root weight",
  branchWeight: "Sublayer 1 weight",
  stepWeight: "Sublayer weight",
  emptyTextSize: "Empty text size",
  noteTextSize: "Note text size",
  noteLineHeight: "Note line height",
  noteInset: "Note inset",
  noteBorderWidth: "Note border width",
  noteRuleWidth: "Note rule width",
  notePadY: "Note padding Y",
  notePadX: "Note padding X",
  noteAccent: "Note accent strength",
  chipTint: "Chip tint strength",
  chipInkMix: "Chip label mix",
  traceBg: "Trace pill background",
  traceTextSize: "Trace pill size",
  traceTint: "Trace pill tint",
  traceInkMix: "Trace pill label mix",
  focusRing: "Focused line ring",
  selectBg: "Selected line background",
  selectTint: "Selected line tint",
  selectPad: "Selected line padding",
  arrowSize: "Arrow size",
  stroke: "Stroke",
  ruleWidth: "Rule width",
  ruleOpacity: "Rule opacity",
  zebraOpacity: "Zebra opacity",
};

function resolveCssColor(expr: string): string {
  if (typeof document === "undefined") return "#ffffff";
  const probe = document.createElement("div");
  probe.style.display = "none";
  probe.style.color = expr;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  const parts = rgb.match(/\d+(\.\d+)?/g);
  if (!parts || parts.length < 3) return "#ffffff";
  return `#${parts
    .slice(0, 3)
    .map((value) => Math.round(Number(value)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function ColorRow({
  label,
  leaf,
  value,
  defaultExpr,
  onChange,
}: {
  label: string;
  leaf?: StyleRailLeafRef;
  value: string | null;
  defaultExpr: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 text-xs">
      <RowLabel label={label} leaf={leaf} />
      <span className="flex items-center gap-1.5">
        {value !== null && (
          <button
            aria-label={`Reset ${label} color to theme default`}
            className="style-icon-button !h-5 !w-5"
            onClick={() => onChange(null)}
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <input
          aria-label={label}
          className="style-color"
          onChange={(event) => onChange(event.currentTarget.value)}
          type="color"
          value={value ?? resolveCssColor(defaultExpr)}
        />
      </span>
    </div>
  );
}

function ToggleRow({
  label,
  leaf,
  checked,
  onChange,
}: {
  label: string;
  leaf?: StyleRailLeafRef;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-8 items-center justify-between gap-3 text-xs">
      <RowLabel label={label} leaf={leaf} />
      <input
        checked={checked}
        className="style-toggle"
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
    </label>
  );
}

function SliderRow({
  label,
  leaf,
  value,
  min,
  max,
  step,
  valueLabel,
  onChange,
}: {
  label: string;
  leaf?: StyleRailLeafRef;
  value: number;
  min: number;
  max: number;
  step: number;
  valueLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs">
      <span className="flex items-center justify-between gap-3">
        <RowLabel label={label} leaf={leaf} />
        <span className="text-[11px] text-foreground">{valueLabel}</span>
      </span>
      <input
        className="style-range"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

function SelectRow<T extends string>({
  label,
  leaf,
  value,
  options,
  onChange,
}: {
  label: string;
  leaf?: StyleRailLeafRef;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex min-h-8 items-center justify-between gap-3 text-xs">
      <RowLabel label={label} leaf={leaf} />
      <select
        className="style-select"
        onChange={(event) => onChange(event.currentTarget.value as T)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ControlGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("style-rail-control-group", className)}>{children}</div>;
}

function Subgroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="style-rail-subgroup">
      <h3 className="style-rail-section-label">{label}</h3>
      <ControlGroup>{children}</ControlGroup>
    </section>
  );
}

export type StyleRailPaneProps = {
  selectedId: StyleRailPaneId;
  activeThemeName: string;
  settings: StyleRailSettings;
  onSettingsChange: (settings: StyleRailSettings) => void;
  dark: boolean;
  onDarkChange: (dark: boolean) => void;
  themes: ThemePickerEntry[];
  activeThemeId: string;
  onSelectTheme: (id: string) => void;
  onSaveTheme?: (name: string) => void;
};

export function StyleRailPane({
  selectedId,
  activeThemeName,
  settings,
  onSettingsChange,
  dark,
  onDarkChange,
  themes,
  activeThemeId,
  onSelectTheme,
  onSaveTheme,
}: StyleRailPaneProps) {
  const { accent, colors, typography, layout, grain } = settings;
  const pane = getStyleRailPaneItem(selectedId);
  const overrideCount = paneOverrideCount(settings, selectedId);
  const overrideSummary = overrideCount === 0
    ? "No overrides"
    : `${overrideCount} ${overrideCount === 1 ? "override" : "overrides"}`;

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

  const saveThemePrompt = () => {
    if (!onSaveTheme) return;
    const name = window.prompt("Theme name (saved to the repo's themes/ folder):");
    if (name?.trim()) onSaveTheme(name.trim());
  };

  const renderComponentTokenRows = (file: string) =>
    Object.entries(THEME_TOKEN_REGISTRY[file] ?? {}).map(([key, token]) => {
      const label = TOKEN_KEY_LABELS[key] ?? key;
      if (token.kind === "color") {
        return (
          <ColorRow
            key={key}
            defaultExpr={`var(${token.vars[0]})`}
            label={label}
            leaf={componentLeaf(file, key)}
            onChange={(value) => patchComponent(file, key, value)}
            value={settings.components[file]?.[key] ?? null}
          />
        );
      }
      const storedValue = settings.components[file]?.[key];
      const value = storedValue === undefined
        ? token.defaultValue
        : Number.parseFloat(storedValue);
      return (
        <SliderRow
          key={key}
          label={label}
          leaf={componentLeaf(file, key)}
          max={token.max}
          min={token.min}
          onChange={(nextValue) =>
            patchComponent(file, key, `${nextValue}${token.unit ?? ""}`)
          }
          step={token.step}
          value={value}
          valueLabel={`${value}${token.unit ?? ""}`}
        />
      );
    });

  /**
   * The per-component Layout section: where this block type sits on the page,
   * layered over docs-viewer's block-layout.ts code default.
   *
   * Rendered from the SHARED component-pane case, so every doc block type
   * gets it from one place. Non-block panes (inline-code, linking, shell,
   * surfaces, editor-controls) are not lanes and get nothing — that is what
   * the isBlockLayoutType gate at the call site enforces.
   *
   * "Default" is the absence of an override, not a value: selecting it
   * deletes the field so the code default shows through again.
   */
  const renderBlockLayoutSection = (file: string) => {
    const override = settings.blockLayout[file] ?? {};
    const isCustomWidth = typeof override.width === "string" && override.width.endsWith("px");
    const customWidthPx = isCustomWidth
      ? Number.parseFloat(override.width as string)
      : BLOCK_LAYOUT_CUSTOM_WIDTH_MIN;
    return (
      <Subgroup label="Layout">
        <SelectRow
          label="Width"
          leaf={settingLeaf(`blockLayout.${file}.width`)}
          onChange={(value) =>
            patchBlockLayout(file, {
              width:
                value === "default"
                  ? undefined
                  : value === "custom"
                    ? (`${customWidthPx}px` as BlockLayoutOverride["width"])
                    : (value as BlockLayoutOverride["width"]),
            })
          }
          options={[
            { id: "default", label: "Default" },
            { id: "text", label: "Text measure" },
            { id: "wide", label: "Wide lane" },
            { id: "full", label: "Full width" },
            { id: "custom", label: "Custom…" },
          ]}
          value={
            override.width === undefined ? "default" : isCustomWidth ? "custom" : override.width
          }
        />
        {isCustomWidth && (
          <SliderRow
            label="Custom width"
            max={BLOCK_LAYOUT_CUSTOM_WIDTH_MAX}
            min={BLOCK_LAYOUT_CUSTOM_WIDTH_MIN}
            onChange={(value) =>
              patchBlockLayout(file, { width: `${value}px` as BlockLayoutOverride["width"] })
            }
            step={20}
            value={customWidthPx}
            valueLabel={`${customWidthPx}px`}
          />
        )}
        {/* Only the two-pane block types have a split to give. Expressed as
            the LEFT (fields/operations) pane's share, because that is the one
            the reader is sizing against its text; the example pane simply
            takes what is left. */}
        {hasBlockColumnSplit(file) && (
          <SliderRow
            label="Column split"
            leaf={settingLeaf(`blockLayout.${file}.columnSplit`)}
            max={BLOCK_COLUMN_SPLIT_MAX}
            min={BLOCK_COLUMN_SPLIT_MIN}
            onChange={(value) => patchBlockLayout(file, { columnSplit: value })}
            step={1}
            value={override.columnSplit ?? BLOCK_COLUMN_SPLIT_DEFAULTS[file] ?? 50}
            valueLabel={`${override.columnSplit ?? BLOCK_COLUMN_SPLIT_DEFAULTS[file] ?? 50}% / ${
              100 - (override.columnSplit ?? BLOCK_COLUMN_SPLIT_DEFAULTS[file] ?? 50)
            }%`}
          />
        )}
        <SelectRow
          label="Justification"
          leaf={settingLeaf(`blockLayout.${file}.justify`)}
          onChange={(value) =>
            patchBlockLayout(file, {
              justify:
                value === "default" ? undefined : (value as BlockLayoutOverride["justify"]),
            })
          }
          options={[
            { id: "default", label: "Default" },
            { id: "left", label: "Left" },
            { id: "center", label: "Center" },
          ]}
          value={override.justify ?? "default"}
        />
      </Subgroup>
    );
  };

  const hasComponentOverrides = (file: string) =>
    Object.keys(THEME_TOKEN_REGISTRY[file] ?? {}).some((key) =>
      isLeafOverridden(settings, componentLeaf(file, key))
    );

  const renderPaneBody = () => {
    switch (selectedId) {
      case "theme.presets":
        return (
          <ControlGroup>
            <div className="grid grid-cols-2 gap-1.5">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  className={cn(
                    "style-rail-preset-button border px-2 py-1.5 text-xs",
                    theme.id === activeThemeId
                      ? "border-primary/50 bg-muted text-foreground"
                      : "text-foreground hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => onSelectTheme(theme.id)}
                  title={theme.source === "repo" ? "themes/ folder in this repo" : "built-in"}
                  type="button"
                >
                  {theme.name}
                </button>
              ))}
            </div>
            {onSaveTheme && (
              <button
                className="style-rail-preset-button w-full border px-2 py-1.5 text-xs text-foreground hover:bg-muted hover:text-foreground"
                onClick={saveThemePrompt}
                type="button"
              >
                Save current look as theme…
              </button>
            )}
          </ControlGroup>
        );

      case "theme.colors":
        return (
          <ControlGroup>
            <ToggleRow checked={dark} label="Dark mode" onChange={onDarkChange} />
            <SelectRow
              label="Accent"
              leaf={settingLeaf("accent")}
              onChange={(value) => onSettingsChange({ ...settings, accent: value })}
              options={ACCENT_OPTIONS}
              value={accent}
            />
            <ColorRow
              defaultExpr="var(--color-bg-default)"
              label="Background"
              leaf={settingLeaf("colors.background")}
              onChange={(value) => patchColors({ background: value })}
              value={colors.background}
            />
            <ColorRow
              defaultExpr="var(--color-bg-sidebar)"
              label="Sidebar"
              leaf={settingLeaf("colors.sidebar")}
              onChange={(value) => patchColors({ sidebar: value })}
              value={colors.sidebar}
            />
            <ColorRow
              defaultExpr="var(--color-text-default)"
              label="Text"
              leaf={settingLeaf("colors.text")}
              onChange={(value) => patchColors({ text: value })}
              value={colors.text}
            />
          </ControlGroup>
        );

      case "theme.typography":
        return (
          <ControlGroup>
            <SelectRow
              label="Body font"
              leaf={settingLeaf("typography.bodyFont")}
              onChange={(value) => patchTypography({ bodyFont: value })}
              options={FONT_OPTIONS}
              value={typography.bodyFont}
            />
            <SelectRow
              label="Heading font"
              leaf={settingLeaf("typography.headingFont")}
              onChange={(value) => patchTypography({ headingFont: value })}
              options={FONT_OPTIONS}
              value={typography.headingFont}
            />
            <SelectRow
              label="Code font"
              leaf={settingLeaf("typography.codeFont")}
              onChange={(value) => patchTypography({ codeFont: value })}
              options={FONT_OPTIONS}
              value={typography.codeFont}
            />
            <SelectRow
              label="Number font"
              leaf={settingLeaf("typography.numberFont")}
              onChange={(value) => patchTypography({ numberFont: value })}
              options={NUMBER_FONT_OPTIONS}
              value={typography.numberFont}
            />
            <SliderRow
              label="Font size"
              leaf={settingLeaf("typography.fontSize")}
              max={20}
              min={12}
              onChange={(value) => patchTypography({ fontSize: value })}
              step={0.5}
              value={typography.fontSize}
              valueLabel={`${typography.fontSize}px`}
            />
            <SliderRow
              label="Line height"
              leaf={settingLeaf("typography.lineHeight")}
              max={2.1}
              min={1.3}
              onChange={(value) => patchTypography({ lineHeight: value })}
              step={0.05}
              value={typography.lineHeight}
              valueLabel={typography.lineHeight.toFixed(2)}
            />
            <SliderRow
              label="Letter spacing"
              leaf={settingLeaf("typography.letterSpacing")}
              max={0.08}
              min={-0.02}
              onChange={(value) => patchTypography({ letterSpacing: value })}
              step={0.005}
              value={typography.letterSpacing}
              valueLabel={`${(typography.letterSpacing * 1000).toFixed(0)}‰`}
            />
          </ControlGroup>
        );

      case "theme.background":
        return (
          <>
            <ControlGroup>
              <ToggleRow
                checked={grain.enabled}
                label="Enable grain"
                leaf={settingLeaf("grain.enabled")}
                onChange={(value) => patchGrain({ enabled: value })}
              />
              <SliderRow
                label="Intensity"
                leaf={settingLeaf("grain.opacity")}
                max={0.5}
                min={0}
                onChange={(value) => patchGrain({ opacity: value })}
                step={0.01}
                value={grain.opacity}
                valueLabel={grain.opacity.toFixed(2)}
              />
              <SliderRow
                label="Density"
                leaf={settingLeaf("grain.frequency")}
                max={1.6}
                min={0.25}
                onChange={(value) => patchGrain({ frequency: value })}
                step={0.05}
                value={grain.frequency}
                valueLabel={grain.frequency.toFixed(2)}
              />
              <SliderRow
                label="Contrast"
                leaf={settingLeaf("grain.contrast")}
                max={3}
                min={0.3}
                onChange={(value) => patchGrain({ contrast: value })}
                step={0.05}
                value={grain.contrast}
                valueLabel={grain.contrast.toFixed(2)}
              />
              <SelectRow
                label="Blend"
                leaf={settingLeaf("grain.blendMode")}
                onChange={(value) => patchGrain({ blendMode: value })}
                options={BLEND_OPTIONS}
                value={grain.blendMode}
              />
            </ControlGroup>
            <Subgroup label="Softening">
              <SliderRow
                label="Background"
                leaf={settingLeaf("grain.softening.background")}
                max={1}
                min={0}
                onChange={(value) => patchSoftening({ background: value })}
                step={0.05}
                value={grain.softening.background}
                valueLabel={`${Math.round(grain.softening.background * 100)}%`}
              />
              <SliderRow
                label="Font"
                leaf={settingLeaf("grain.softening.font")}
                max={1.5}
                min={0}
                onChange={(value) => patchSoftening({ font: value })}
                step={0.05}
                value={grain.softening.font}
                valueLabel={`${Math.round(grain.softening.font * 100)}%`}
              />
              <SliderRow
                label="Icons"
                leaf={settingLeaf("grain.softening.icons")}
                max={1.5}
                min={0}
                onChange={(value) => patchSoftening({ icons: value })}
                step={0.05}
                value={grain.softening.icons}
                valueLabel={`${Math.round(grain.softening.icons * 100)}%`}
              />
            </Subgroup>
          </>
        );

      case "theme.references":
        return (
          <>
            <ControlGroup>
              <ColorRow
                defaultExpr="var(--docs-ref-color)"
                label="Text color"
                leaf={settingLeaf("reference.color")}
                onChange={(value) => patchReference({ color: value })}
                value={settings.reference.color}
              />
              <ColorRow
                defaultExpr="var(--docs-ref-underline-color)"
                label="Hover underline"
                leaf={settingLeaf("reference.underlineColor")}
                onChange={(value) => patchReference({ underlineColor: value })}
                value={settings.reference.underlineColor}
              />
            </ControlGroup>
            <Subgroup label="Icon">
              <ColorRow
                defaultExpr="var(--docs-ref-color)"
                label="Color"
                leaf={settingLeaf("reference.iconColor")}
                onChange={(value) => patchReference({ iconColor: value })}
                value={settings.reference.iconColor}
              />
              <SliderRow
                label="Size"
                leaf={settingLeaf("reference.iconSize")}
                max={28}
                min={8}
                onChange={(value) => patchReference({ iconSize: value })}
                step={1}
                value={settings.reference.iconSize}
                valueLabel={`${settings.reference.iconSize}px`}
              />
              <SliderRow
                label="Spacing"
                leaf={settingLeaf("reference.iconGap")}
                max={16}
                min={0}
                onChange={(value) => patchReference({ iconGap: value })}
                step={1}
                value={settings.reference.iconGap}
                valueLabel={`${settings.reference.iconGap}px`}
              />
              <SelectRow
                label="Position"
                leaf={settingLeaf("reference.iconPosition")}
                onChange={(value) => patchReference({ iconPosition: value })}
                options={REFERENCE_ICON_POSITION_OPTIONS}
                value={settings.reference.iconPosition}
              />
            </Subgroup>
          </>
        );

      case "theme.surfaces":
        return (
          <>
            <ControlGroup>
              {/* The Radius knob and radius token both write --radius; deduplication comes later. */}
              <SliderRow
                label="Radius"
                leaf={settingLeaf("layout.radius")}
                max={16}
                min={0}
                onChange={(value) => patchLayout({ radius: value })}
                step={1}
                value={layout.radius}
                valueLabel={`${layout.radius}px`}
              />
              <SliderRow
                label="Border strength"
                leaf={settingLeaf("layout.borderStrength")}
                max={2}
                min={0}
                onChange={(value) => patchLayout({ borderStrength: value })}
                step={0.05}
                value={layout.borderStrength}
                valueLabel={`${Math.round(layout.borderStrength * 100)}%`}
              />
              <SliderRow
                label="Background tint"
                leaf={settingLeaf("layout.backgroundTint")}
                max={12}
                min={0}
                onChange={(value) => patchLayout({ backgroundTint: value })}
                step={0.5}
                value={layout.backgroundTint}
                valueLabel={`${layout.backgroundTint}%`}
              />
              <SliderRow
                label="Sidebar tint"
                leaf={settingLeaf("layout.sidebarTint")}
                max={60}
                min={0}
                onChange={(value) => patchLayout({ sidebarTint: value })}
                step={2}
                value={layout.sidebarTint}
                valueLabel={`${layout.sidebarTint}%`}
              />
            </ControlGroup>
            <Subgroup label="Tokens">
              {renderComponentTokenRows("surfaces")}
              {hasComponentOverrides("surfaces") && (
                <button
                  className="style-rail-block-reset"
                  onClick={() => resetComponent("surfaces")}
                  type="button"
                >
                  Reset Surfaces tokens to theme
                </button>
              )}
            </Subgroup>
          </>
        );

      case "theme.annotate":
        return (
          <>
            <Subgroup label="Colors">
              <ColorRow
                defaultExpr="var(--annotation-accent)"
                label="Accent"
                leaf={settingLeaf("annotate.accent")}
                onChange={(value) => patchAnnotate({ accent: value })}
                value={settings.annotate.accent}
              />
              <ColorRow
                defaultExpr="var(--docs-annotation-add)"
                label="Add"
                leaf={settingLeaf("annotate.add")}
                onChange={(value) => patchAnnotate({ add: value })}
                value={settings.annotate.add}
              />
              <ColorRow
                defaultExpr="var(--docs-annotation-del)"
                label="Delete"
                leaf={settingLeaf("annotate.del")}
                onChange={(value) => patchAnnotate({ del: value })}
                value={settings.annotate.del}
              />
            </Subgroup>
            <Subgroup label="Surface">
              <SliderRow
                label="Wash opacity"
                leaf={settingLeaf("annotate.washOpacity")}
                max={0.3}
                min={0}
                onChange={(value) => patchAnnotate({ washOpacity: value })}
                step={0.01}
                value={settings.annotate.washOpacity}
                valueLabel={`${Math.round(settings.annotate.washOpacity * 100)}%`}
              />
              <SliderRow
                label="AI panel width"
                leaf={settingLeaf("annotate.actionPaneWidth")}
                max={680}
                min={380}
                onChange={(value) => patchAnnotate({ actionPaneWidth: value })}
                step={1}
                value={settings.annotate.actionPaneWidth}
                valueLabel={`${settings.annotate.actionPaneWidth}px`}
              />
            </Subgroup>
          </>
        );

      case "layout.sidebar":
        return (
          <ControlGroup>
            <ColorRow
              defaultExpr="var(--color-bg-sidebar)"
              label="Background"
              leaf={settingLeaf("colors.sidebar")}
              onChange={(value) => patchColors({ sidebar: value })}
              value={colors.sidebar}
            />
            <ColorRow
              defaultExpr="var(--foreground)"
              label="Text color"
              leaf={settingLeaf("sidebar.textColor")}
              onChange={(value) => patchSidebar({ textColor: value })}
              value={settings.sidebar.textColor}
            />
            <SelectRow
              label="Font"
              leaf={settingLeaf("sidebar.font")}
              onChange={(value) => patchSidebar({ font: value })}
              options={FONT_OPTIONS}
              value={settings.sidebar.font}
            />
            <SliderRow
              label="Text size"
              leaf={settingLeaf("sidebar.fontSize")}
              max={20}
              min={10}
              onChange={(value) => patchSidebar({ fontSize: value })}
              step={1}
              value={settings.sidebar.fontSize}
              valueLabel={`${settings.sidebar.fontSize}px`}
            />
            <SliderRow
              label="Padding"
              leaf={settingLeaf("sidebar.padding")}
              max={16}
              min={0}
              onChange={(value) => patchSidebar({ padding: value })}
              step={1}
              value={settings.sidebar.padding}
              valueLabel={`${settings.sidebar.padding}px`}
            />
            <ToggleRow
              checked={settings.sidebar.guides}
              label="Indent guides"
              leaf={settingLeaf("sidebar.guides")}
              onChange={(value) => patchSidebar({ guides: value })}
            />
            <ColorRow
              defaultExpr="var(--border)"
              label="Guide color"
              leaf={settingLeaf("sidebar.guideColor")}
              onChange={(value) => patchSidebar({ guideColor: value })}
              value={settings.sidebar.guideColor}
            />
            <SliderRow
              label="Guide width"
              leaf={settingLeaf("sidebar.guideWidth")}
              max={4}
              min={1}
              onChange={(value) => patchSidebar({ guideWidth: value })}
              step={0.5}
              value={settings.sidebar.guideWidth}
              valueLabel={`${settings.sidebar.guideWidth}px`}
            />
            <SliderRow
              label="Guide opacity"
              leaf={settingLeaf("sidebar.guideOpacity")}
              max={1}
              min={0.05}
              onChange={(value) => patchSidebar({ guideOpacity: value })}
              step={0.05}
              value={settings.sidebar.guideOpacity}
              valueLabel={`${Math.round(settings.sidebar.guideOpacity * 100)}%`}
            />
          </ControlGroup>
        );

      case "layout.scrollbar":
        return (
          <ControlGroup>
            <SliderRow
              label="Width"
              leaf={settingLeaf("scrollbar.width")}
              max={20}
              min={4}
              onChange={(value) => patchScrollbar({ width: value })}
              step={1}
              value={settings.scrollbar.width}
              valueLabel={`${settings.scrollbar.width}px`}
            />
            <ColorRow
              defaultExpr="var(--docs-icon-muted)"
              label="Color"
              leaf={settingLeaf("scrollbar.color")}
              onChange={(value) => patchScrollbar({ color: value })}
              value={settings.scrollbar.color}
            />
            <SliderRow
              label="Opacity"
              leaf={settingLeaf("scrollbar.opacity")}
              max={1}
              min={0.1}
              onChange={(value) => patchScrollbar({ opacity: value })}
              step={0.05}
              value={settings.scrollbar.opacity}
              valueLabel={`${Math.round(settings.scrollbar.opacity * 100)}%`}
            />
            <SliderRow
              label="Padding"
              leaf={settingLeaf("scrollbar.padding")}
              max={12}
              min={0}
              onChange={(value) => patchScrollbar({ padding: value })}
              step={1}
              value={settings.scrollbar.padding}
              valueLabel={`${settings.scrollbar.padding}px`}
            />
          </ControlGroup>
        );

      case "layout.transitions":
        return (
          <ControlGroup>
            <SelectRow
              label="Transition type"
              leaf={settingLeaf("transition.type")}
              value={settings.transition.type}
              options={[{ id: "fade", label: "Fade" }, { id: "none", label: "None" }]}
              onChange={(type) => onSettingsChange({ ...settings, transition: { ...settings.transition, type } })}
            />
            {(["fadeOutMs", "fadeInMs"] as const).map((field) => (
              <SliderRow
                key={field}
                label={field === "fadeOutMs" ? "Fade out" : "Fade in"}
                leaf={settingLeaf(`transition.${field}`)}
                min={0}
                max={800}
                step={10}
                value={settings.transition[field]}
                valueLabel={`${settings.transition[field]}ms`}
                onChange={(value) => onSettingsChange({ ...settings, transition: { ...settings.transition, [field]: value } })}
              />
            ))}
            <p className="text-xs text-muted-foreground">Page changes and linked previews. Reduced motion skips fades.</p>
          </ControlGroup>
        );

      case "layout.side-peek":
        return (
          <>
            <ControlGroup>
              <SliderRow
                label="Width"
                leaf={settingLeaf("peek.width")}
                max={80}
                min={24}
                onChange={(value) => patchPeek({ width: value })}
                step={1}
                value={settings.peek.width}
                valueLabel={`${settings.peek.width}rem`}
              />
              <SliderRow
                label="Animation"
                leaf={settingLeaf("peek.durationMs")}
                max={800}
                min={0}
                onChange={(value) => patchPeek({ durationMs: value })}
                step={10}
                value={settings.peek.durationMs}
                valueLabel={`${settings.peek.durationMs}ms`}
              />
              <SliderRow
                label="Padding"
                leaf={settingLeaf("peek.padding")}
                max={4}
                min={0}
                onChange={(value) => patchPeek({ padding: value })}
                step={0.25}
                value={settings.peek.padding}
                valueLabel={`${settings.peek.padding}rem`}
              />
            </ControlGroup>
            <Subgroup label="Divider">
              <ColorRow
                defaultExpr="var(--docs-peek-divider-color)"
                label="Color"
                leaf={settingLeaf("peek.dividerColor")}
                onChange={(value) => patchPeek({ dividerColor: value })}
                value={settings.peek.dividerColor}
              />
              <SliderRow
                label="Thickness"
                leaf={settingLeaf("peek.dividerWidth")}
                max={8}
                min={0}
                onChange={(value) => patchPeek({ dividerWidth: value })}
                step={0.5}
                value={settings.peek.dividerWidth}
                valueLabel={`${settings.peek.dividerWidth}px`}
              />
              <SelectRow
                label="Style"
                leaf={settingLeaf("peek.dividerStyle")}
                onChange={(value) => patchPeek({ dividerStyle: value })}
                options={PEEK_DIVIDER_STYLE_OPTIONS}
                value={settings.peek.dividerStyle}
              />
            </Subgroup>
          </>
        );

      case "layout.editor":
        return (
          <>
            <Subgroup label="Column">
              <SliderRow
                label="Max width"
                leaf={settingLeaf("layout.contentWidth")}
                max={140}
                min={60}
                onChange={(value) => patchLayout({ contentWidth: value })}
                step={2}
                value={layout.contentWidth}
                valueLabel={`${layout.contentWidth}ch`}
              />
              {/*
                Wide lane: the max-width data-heavy blocks (state shape,
                interaction surface, structured table, process outline) break
                out to. Sized in px because those blocks are grids, not prose.
              */}
              <SliderRow
                label="Wide lane"
                leaf={settingLeaf("layout.wideWidth")}
                max={2400}
                min={900}
                onChange={(value) => patchLayout({ wideWidth: value })}
                step={20}
                value={layout.wideWidth}
                valueLabel={`${layout.wideWidth}px`}
              />
              {/*
                Left margin: the page is left-anchored and full-width now, so
                this is THE global knob that sets where every block's left rail
                sits — it is no longer symmetric gutter around a centered
                column. Named accordingly, and given plenty of range because
                the whole page hangs off it.
              */}
              <SliderRow
                label="Left margin"
                leaf={settingLeaf("layout.contentMargin")}
                max={240}
                min={0}
                onChange={(value) => patchLayout({ contentMargin: value })}
                step={4}
                value={layout.contentMargin}
                valueLabel={`${layout.contentMargin}px`}
              />
              <SliderRow
                label="Top padding"
                leaf={settingLeaf("layout.topPadding")}
                max={240}
                min={0}
                onChange={(value) => patchLayout({ topPadding: value })}
                step={4}
                value={layout.topPadding}
                valueLabel={`${layout.topPadding}px`}
              />
              <SliderRow
                label="Title padding"
                leaf={settingLeaf("layout.titlePadding")}
                max={240}
                min={0}
                onChange={(value) => patchLayout({ titlePadding: value })}
                step={2}
                value={layout.titlePadding}
                valueLabel={`${layout.titlePadding}px`}
              />
              <SliderRow
                label="Bottom padding"
                leaf={settingLeaf("layout.bottomPadding")}
                max={600}
                min={0}
                onChange={(value) => patchLayout({ bottomPadding: value })}
                step={4}
                value={layout.bottomPadding}
                valueLabel={`${layout.bottomPadding}px`}
              />
            </Subgroup>
            <Subgroup label="Highlight">
              <ColorRow
                defaultExpr="var(--color-bg-blue)"
                label="Color"
                leaf={settingLeaf("highlight.color")}
                onChange={(value) => patchHighlight({ color: value })}
                value={settings.highlight.color}
              />
              <SliderRow
                label="Rounding"
                leaf={settingLeaf("highlight.radius")}
                max={24}
                min={0}
                onChange={(value) => patchHighlight({ radius: value })}
                step={1}
                value={settings.highlight.radius}
                valueLabel={`${settings.highlight.radius}px`}
              />
              <SliderRow
                label="Padding"
                leaf={settingLeaf("highlight.padding")}
                max={12}
                min={0}
                onChange={(value) => patchHighlight({ padding: value })}
                step={1}
                value={settings.highlight.padding}
                valueLabel={`${settings.highlight.padding}px`}
              />
              <SliderRow
                label="Drag opacity"
                leaf={settingLeaf("highlight.dragOpacity")}
                max={1}
                min={0.05}
                onChange={(value) => patchHighlight({ dragOpacity: value })}
                step={0.05}
                value={settings.highlight.dragOpacity}
                valueLabel={`${Math.round(settings.highlight.dragOpacity * 100)}%`}
              />
            </Subgroup>
            <Subgroup label="Drop line">
              <ColorRow
                defaultExpr="var(--color-text-blue)"
                label="Color"
                leaf={settingLeaf("highlight.dropColor")}
                onChange={(value) => patchHighlight({ dropColor: value })}
                value={settings.highlight.dropColor}
              />
              <SliderRow
                label="Thickness"
                leaf={settingLeaf("highlight.dropWidth")}
                max={8}
                min={1}
                onChange={(value) => patchHighlight({ dropWidth: value })}
                step={1}
                value={settings.highlight.dropWidth}
                valueLabel={`${settings.highlight.dropWidth}px`}
              />
              <SliderRow
                label="Opacity"
                leaf={settingLeaf("highlight.dropOpacity")}
                max={1}
                min={0.1}
                onChange={(value) => patchHighlight({ dropOpacity: value })}
                step={0.05}
                value={settings.highlight.dropOpacity}
                valueLabel={`${Math.round(settings.highlight.dropOpacity * 100)}%`}
              />
              <SliderRow
                label="Rounding"
                leaf={settingLeaf("highlight.dropRadius")}
                max={6}
                min={0}
                onChange={(value) => patchHighlight({ dropRadius: value })}
                step={1}
                value={settings.highlight.dropRadius}
                valueLabel={`${settings.highlight.dropRadius}px`}
              />
            </Subgroup>
            <Subgroup label="Drag select">
              <ColorRow
                defaultExpr="var(--color-text-blue)"
                label="Color"
                leaf={settingLeaf("dragSelect.color")}
                onChange={(value) => patchDragSelect({ color: value })}
                value={settings.dragSelect.color}
              />
              <SliderRow
                label="Fill opacity"
                leaf={settingLeaf("dragSelect.opacity")}
                max={0.6}
                min={0.02}
                onChange={(value) => patchDragSelect({ opacity: value })}
                step={0.02}
                value={settings.dragSelect.opacity}
                valueLabel={`${Math.round(settings.dragSelect.opacity * 100)}%`}
              />
            </Subgroup>
            <Subgroup label="Drag grip">
              <SliderRow
                label="Gap"
                leaf={settingLeaf("grip.gap")}
                max={32}
                min={0}
                onChange={(value) => patchGrip({ gap: value })}
                step={1}
                value={settings.grip.gap}
                valueLabel={`${settings.grip.gap}px`}
              />
              <SliderRow
                label="Vertical offset"
                leaf={settingLeaf("grip.offsetY")}
                max={20}
                min={-12}
                onChange={(value) => patchGrip({ offsetY: value })}
                step={1}
                value={settings.grip.offsetY}
                valueLabel={`${settings.grip.offsetY}px`}
              />
              <SliderRow
                label="Size"
                leaf={settingLeaf("grip.size")}
                max={28}
                min={14}
                onChange={(value) => patchGrip({ size: value })}
                step={1}
                value={settings.grip.size}
                valueLabel={`${settings.grip.size}px`}
              />
              <SliderRow
                label="Fade"
                leaf={settingLeaf("grip.fadeMs")}
                max={400}
                min={0}
                onChange={(value) => patchGrip({ fadeMs: value })}
                step={10}
                value={settings.grip.fadeMs}
                valueLabel={`${settings.grip.fadeMs}ms`}
              />
              <ColorRow
                defaultExpr="var(--docs-icon-muted)"
                label="Color"
                leaf={settingLeaf("grip.color")}
                onChange={(value) => patchGrip({ color: value })}
                value={settings.grip.color}
              />
            </Subgroup>
          </>
        );

      default: {
        const file = selectedId.slice("blocks.".length);
        return (
          <ControlGroup>
            {/* Lane controls first: where the block sits on the page frames
                everything the token rows then tune inside it. Only real doc
                block types have a lane — inline-code, linking, shell and
                surfaces are not blocks and get no Layout section. */}
            {isBlockLayoutType(file) && renderBlockLayoutSection(file)}
            {renderComponentTokenRows(file)}
            {file === "list-item" && (
              <>
                <SliderRow
                  label="Disc size"
                  leaf={settingLeaf("list.discSize")}
                  max={12}
                  min={3}
                  onChange={(value) => patchList({ discSize: value })}
                  step={0.5}
                  value={settings.list.discSize}
                  valueLabel={`${settings.list.discSize}px`}
                />
                <SliderRow
                  label="Circle size"
                  leaf={settingLeaf("list.circleSize")}
                  max={12}
                  min={3}
                  onChange={(value) => patchList({ circleSize: value })}
                  step={0.5}
                  value={settings.list.circleSize}
                  valueLabel={`${settings.list.circleSize}px`}
                />
                <SliderRow
                  label="Circle thickness"
                  leaf={settingLeaf("list.circleThickness")}
                  max={3}
                  min={0.5}
                  onChange={(value) => patchList({ circleThickness: value })}
                  step={0.25}
                  value={settings.list.circleThickness}
                  valueLabel={`${settings.list.circleThickness}px`}
                />
                <SliderRow
                  label="Square size"
                  leaf={settingLeaf("list.squareSize")}
                  max={12}
                  min={3}
                  onChange={(value) => patchList({ squareSize: value })}
                  step={0.5}
                  value={settings.list.squareSize}
                  valueLabel={`${settings.list.squareSize}px`}
                />
                <SliderRow
                  label="Indent"
                  leaf={settingLeaf("list.indent")}
                  max={48}
                  min={12}
                  onChange={(value) => patchList({ indent: value })}
                  step={1}
                  value={settings.list.indent}
                  valueLabel={`${settings.list.indent}px`}
                />
              </>
            )}
            {overrideCount > 0 && (
              <button
                className="style-rail-block-reset"
                onClick={() => resetComponent(file)}
                type="button"
              >
                Reset {pane.label} to theme
              </button>
            )}
          </ControlGroup>
        );
      }
    }
  };

  return (
    <OverrideSettingsContext.Provider value={settings}>
      <section aria-labelledby="style-rail-pane-title" className="style-rail-detail">
        <header className="style-rail-detail-head">
          <h2 id="style-rail-pane-title">{pane.label}</h2>
          <p>
            {selectedId === "theme.presets"
              ? `Layered over ${activeThemeName} theme`
              : `${overrideSummary} · layered over ${activeThemeName} theme`}
          </p>
        </header>
        <div className="style-rail-detail-body">{renderPaneBody()}</div>
      </section>
    </OverrideSettingsContext.Provider>
  );
}
