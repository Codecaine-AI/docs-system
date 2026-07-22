import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@codecaine-ai/docs-viewer/ui/cn";
import { THEME_TOKEN_REGISTRY } from "../theme/theme-folders";
import type {
  AccentFamily,
  FontChoice,
  GrainBlendMode,
  NumberFontChoice,
  PeekDividerStyle,
  ReferenceIconPosition,
  StyleRailSettings,
  ThemePickerEntry,
} from "./StyleRail";
import { getStyleRailPaneItem, type StyleRailPaneId } from "./style-rail-nav";

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
  noteBg: "Note background",
  noteBorder: "Note border",
  codeBg: "Code background",
  indent: "Indent",
  rowGap: "Row gap",
  arrowGap: "Arrow gap",
  lineHeight: "Line height",
  textSize: "Text size",
  noteTextSize: "Note text size",
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
  value,
  defaultExpr,
  onChange,
}: {
  label: string;
  value: string | null;
  defaultExpr: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 text-xs">
      <span>{label}</span>
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
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-8 items-center justify-between gap-3 text-xs">
      <span>{label}</span>
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
  value,
  min,
  max,
  step,
  valueLabel,
  onChange,
}: {
  label: string;
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
        <span>{label}</span>
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
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex min-h-8 items-center justify-between gap-3 text-xs">
      <span>{label}</span>
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
  const patchComponent = (file: string, key: string, value: string | null) => {
    const fileTokens = { ...(settings.components[file] ?? {}) };
    if (value === null) delete fileTokens[key];
    else fileTokens[key] = value;
    const components = { ...settings.components };
    if (Object.keys(fileTokens).length === 0) delete components[file];
    else components[file] = fileTokens;
    onSettingsChange({ ...settings, components });
  };

  const saveThemePrompt = () => {
    if (!onSaveTheme) return;
    const name = window.prompt("Theme name (saved to the repo's themes/ folder):");
    if (name?.trim()) onSaveTheme(name.trim());
  };

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
              onChange={(value) => onSettingsChange({ ...settings, accent: value })}
              options={ACCENT_OPTIONS}
              value={accent}
            />
            <ColorRow
              defaultExpr="var(--color-bg-default)"
              label="Background"
              onChange={(value) => patchColors({ background: value })}
              value={colors.background}
            />
            <ColorRow
              defaultExpr="var(--color-bg-sidebar)"
              label="Sidebar"
              onChange={(value) => patchColors({ sidebar: value })}
              value={colors.sidebar}
            />
            <ColorRow
              defaultExpr="var(--color-text-default)"
              label="Text"
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
              onChange={(value) => patchTypography({ bodyFont: value })}
              options={FONT_OPTIONS}
              value={typography.bodyFont}
            />
            <SelectRow
              label="Heading font"
              onChange={(value) => patchTypography({ headingFont: value })}
              options={FONT_OPTIONS}
              value={typography.headingFont}
            />
            <SelectRow
              label="Code font"
              onChange={(value) => patchTypography({ codeFont: value })}
              options={FONT_OPTIONS}
              value={typography.codeFont}
            />
            <SelectRow
              label="Number font"
              onChange={(value) => patchTypography({ numberFont: value })}
              options={NUMBER_FONT_OPTIONS}
              value={typography.numberFont}
            />
            <SliderRow
              label="Font size"
              max={20}
              min={12}
              onChange={(value) => patchTypography({ fontSize: value })}
              step={0.5}
              value={typography.fontSize}
              valueLabel={`${typography.fontSize}px`}
            />
            <SliderRow
              label="Line height"
              max={2.1}
              min={1.3}
              onChange={(value) => patchTypography({ lineHeight: value })}
              step={0.05}
              value={typography.lineHeight}
              valueLabel={typography.lineHeight.toFixed(2)}
            />
            <SliderRow
              label="Letter spacing"
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
                onChange={(value) => patchGrain({ enabled: value })}
              />
              <SliderRow
                label="Intensity"
                max={0.5}
                min={0}
                onChange={(value) => patchGrain({ opacity: value })}
                step={0.01}
                value={grain.opacity}
                valueLabel={grain.opacity.toFixed(2)}
              />
              <SliderRow
                label="Density"
                max={1.6}
                min={0.25}
                onChange={(value) => patchGrain({ frequency: value })}
                step={0.05}
                value={grain.frequency}
                valueLabel={grain.frequency.toFixed(2)}
              />
              <SliderRow
                label="Contrast"
                max={3}
                min={0.3}
                onChange={(value) => patchGrain({ contrast: value })}
                step={0.05}
                value={grain.contrast}
                valueLabel={grain.contrast.toFixed(2)}
              />
              <SelectRow
                label="Blend"
                onChange={(value) => patchGrain({ blendMode: value })}
                options={BLEND_OPTIONS}
                value={grain.blendMode}
              />
            </ControlGroup>
            <Subgroup label="Softening">
              <SliderRow
                label="Background"
                max={1}
                min={0}
                onChange={(value) => patchSoftening({ background: value })}
                step={0.05}
                value={grain.softening.background}
                valueLabel={`${Math.round(grain.softening.background * 100)}%`}
              />
              <SliderRow
                label="Font"
                max={1.5}
                min={0}
                onChange={(value) => patchSoftening({ font: value })}
                step={0.05}
                value={grain.softening.font}
                valueLabel={`${Math.round(grain.softening.font * 100)}%`}
              />
              <SliderRow
                label="Icons"
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
                onChange={(value) => patchReference({ color: value })}
                value={settings.reference.color}
              />
              <ColorRow
                defaultExpr="var(--docs-ref-underline-color)"
                label="Hover underline"
                onChange={(value) => patchReference({ underlineColor: value })}
                value={settings.reference.underlineColor}
              />
            </ControlGroup>
            <Subgroup label="Icon">
              <ColorRow
                defaultExpr="var(--docs-ref-color)"
                label="Color"
                onChange={(value) => patchReference({ iconColor: value })}
                value={settings.reference.iconColor}
              />
              <SliderRow
                label="Size"
                max={28}
                min={8}
                onChange={(value) => patchReference({ iconSize: value })}
                step={1}
                value={settings.reference.iconSize}
                valueLabel={`${settings.reference.iconSize}px`}
              />
              <SliderRow
                label="Spacing"
                max={16}
                min={0}
                onChange={(value) => patchReference({ iconGap: value })}
                step={1}
                value={settings.reference.iconGap}
                valueLabel={`${settings.reference.iconGap}px`}
              />
              <SelectRow
                label="Position"
                onChange={(value) => patchReference({ iconPosition: value })}
                options={REFERENCE_ICON_POSITION_OPTIONS}
                value={settings.reference.iconPosition}
              />
            </Subgroup>
          </>
        );

      case "layout.column":
        return (
          <ControlGroup>
            <SliderRow
              label="Max width"
              max={140}
              min={60}
              onChange={(value) => patchLayout({ contentWidth: value })}
              step={2}
              value={layout.contentWidth}
              valueLabel={`${layout.contentWidth}ch`}
            />
            <SliderRow
              label="Padding"
              max={96}
              min={0}
              onChange={(value) => patchLayout({ contentMargin: value })}
              step={4}
              value={layout.contentMargin}
              valueLabel={`${layout.contentMargin}px`}
            />
            <SliderRow
              label="Top padding"
              max={240}
              min={0}
              onChange={(value) => patchLayout({ topPadding: value })}
              step={4}
              value={layout.topPadding}
              valueLabel={`${layout.topPadding}px`}
            />
            <SliderRow
              label="Title padding"
              max={240}
              min={0}
              onChange={(value) => patchLayout({ titlePadding: value })}
              step={2}
              value={layout.titlePadding}
              valueLabel={`${layout.titlePadding}px`}
            />
            <SliderRow
              label="Bottom padding"
              max={600}
              min={0}
              onChange={(value) => patchLayout({ bottomPadding: value })}
              step={4}
              value={layout.bottomPadding}
              valueLabel={`${layout.bottomPadding}px`}
            />
          </ControlGroup>
        );

      case "layout.surfaces":
        return (
          <ControlGroup>
            <SliderRow
              label="Radius"
              max={16}
              min={0}
              onChange={(value) => patchLayout({ radius: value })}
              step={1}
              value={layout.radius}
              valueLabel={`${layout.radius}px`}
            />
            <SliderRow
              label="Border strength"
              max={2}
              min={0}
              onChange={(value) => patchLayout({ borderStrength: value })}
              step={0.05}
              value={layout.borderStrength}
              valueLabel={`${Math.round(layout.borderStrength * 100)}%`}
            />
            <SliderRow
              label="Background tint"
              max={12}
              min={0}
              onChange={(value) => patchLayout({ backgroundTint: value })}
              step={0.5}
              value={layout.backgroundTint}
              valueLabel={`${layout.backgroundTint}%`}
            />
            <SliderRow
              label="Sidebar tint"
              max={60}
              min={0}
              onChange={(value) => patchLayout({ sidebarTint: value })}
              step={2}
              value={layout.sidebarTint}
              valueLabel={`${layout.sidebarTint}%`}
            />
          </ControlGroup>
        );

      case "layout.sidebar":
        return (
          <ControlGroup>
            <ColorRow
              defaultExpr="var(--color-bg-sidebar)"
              label="Background"
              onChange={(value) => patchColors({ sidebar: value })}
              value={colors.sidebar}
            />
            <ColorRow
              defaultExpr="var(--foreground)"
              label="Text color"
              onChange={(value) => patchSidebar({ textColor: value })}
              value={settings.sidebar.textColor}
            />
            <SelectRow
              label="Font"
              onChange={(value) => patchSidebar({ font: value })}
              options={FONT_OPTIONS}
              value={settings.sidebar.font}
            />
            <SliderRow
              label="Text size"
              max={20}
              min={10}
              onChange={(value) => patchSidebar({ fontSize: value })}
              step={1}
              value={settings.sidebar.fontSize}
              valueLabel={`${settings.sidebar.fontSize}px`}
            />
            <SliderRow
              label="Padding"
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
              onChange={(value) => patchSidebar({ guides: value })}
            />
            <ColorRow
              defaultExpr="var(--border)"
              label="Guide color"
              onChange={(value) => patchSidebar({ guideColor: value })}
              value={settings.sidebar.guideColor}
            />
            <SliderRow
              label="Guide width"
              max={4}
              min={1}
              onChange={(value) => patchSidebar({ guideWidth: value })}
              step={0.5}
              value={settings.sidebar.guideWidth}
              valueLabel={`${settings.sidebar.guideWidth}px`}
            />
            <SliderRow
              label="Guide opacity"
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
              onChange={(value) => patchScrollbar({ color: value })}
              value={settings.scrollbar.color}
            />
            <SliderRow
              label="Opacity"
              max={1}
              min={0.1}
              onChange={(value) => patchScrollbar({ opacity: value })}
              step={0.05}
              value={settings.scrollbar.opacity}
              valueLabel={`${Math.round(settings.scrollbar.opacity * 100)}%`}
            />
            <SliderRow
              label="Padding"
              max={12}
              min={0}
              onChange={(value) => patchScrollbar({ padding: value })}
              step={1}
              value={settings.scrollbar.padding}
              valueLabel={`${settings.scrollbar.padding}px`}
            />
          </ControlGroup>
        );

      case "layout.side-peek":
        return (
          <>
            <ControlGroup>
              <SliderRow
                label="Width"
                max={80}
                min={24}
                onChange={(value) => patchPeek({ width: value })}
                step={1}
                value={settings.peek.width}
                valueLabel={`${settings.peek.width}rem`}
              />
              <SliderRow
                label="Animation"
                max={800}
                min={0}
                onChange={(value) => patchPeek({ durationMs: value })}
                step={10}
                value={settings.peek.durationMs}
                valueLabel={`${settings.peek.durationMs}ms`}
              />
              <SliderRow
                label="Padding"
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
                onChange={(value) => patchPeek({ dividerColor: value })}
                value={settings.peek.dividerColor}
              />
              <SliderRow
                label="Thickness"
                max={8}
                min={0}
                onChange={(value) => patchPeek({ dividerWidth: value })}
                step={0.5}
                value={settings.peek.dividerWidth}
                valueLabel={`${settings.peek.dividerWidth}px`}
              />
              <SelectRow
                label="Style"
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
            <Subgroup label="Highlight">
              <ColorRow
                defaultExpr="var(--color-bg-blue)"
                label="Color"
                onChange={(value) => patchHighlight({ color: value })}
                value={settings.highlight.color}
              />
              <SliderRow
                label="Rounding"
                max={24}
                min={0}
                onChange={(value) => patchHighlight({ radius: value })}
                step={1}
                value={settings.highlight.radius}
                valueLabel={`${settings.highlight.radius}px`}
              />
              <SliderRow
                label="Padding"
                max={12}
                min={0}
                onChange={(value) => patchHighlight({ padding: value })}
                step={1}
                value={settings.highlight.padding}
                valueLabel={`${settings.highlight.padding}px`}
              />
              <SliderRow
                label="Drag opacity"
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
                onChange={(value) => patchHighlight({ dropColor: value })}
                value={settings.highlight.dropColor}
              />
              <SliderRow
                label="Thickness"
                max={8}
                min={1}
                onChange={(value) => patchHighlight({ dropWidth: value })}
                step={1}
                value={settings.highlight.dropWidth}
                valueLabel={`${settings.highlight.dropWidth}px`}
              />
              <SliderRow
                label="Opacity"
                max={1}
                min={0.1}
                onChange={(value) => patchHighlight({ dropOpacity: value })}
                step={0.05}
                value={settings.highlight.dropOpacity}
                valueLabel={`${Math.round(settings.highlight.dropOpacity * 100)}%`}
              />
              <SliderRow
                label="Rounding"
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
                onChange={(value) => patchDragSelect({ color: value })}
                value={settings.dragSelect.color}
              />
              <SliderRow
                label="Fill opacity"
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
                max={32}
                min={0}
                onChange={(value) => patchGrip({ gap: value })}
                step={1}
                value={settings.grip.gap}
                valueLabel={`${settings.grip.gap}px`}
              />
              <SliderRow
                label="Vertical offset"
                max={20}
                min={-12}
                onChange={(value) => patchGrip({ offsetY: value })}
                step={1}
                value={settings.grip.offsetY}
                valueLabel={`${settings.grip.offsetY}px`}
              />
              <SliderRow
                label="Size"
                max={28}
                min={14}
                onChange={(value) => patchGrip({ size: value })}
                step={1}
                value={settings.grip.size}
                valueLabel={`${settings.grip.size}px`}
              />
              <SliderRow
                label="Fade"
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
            {Object.entries(THEME_TOKEN_REGISTRY[file] ?? {}).map(([key, token]) => {
              const label = TOKEN_KEY_LABELS[key] ?? key;
              if (token.kind === "color") {
                return (
                  <ColorRow
                    key={key}
                    defaultExpr={`var(${token.vars[0]})`}
                    label={label}
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
            })}
            {file === "list-item" && (
              <>
                <SliderRow
                  label="Disc size"
                  max={12}
                  min={3}
                  onChange={(value) => patchList({ discSize: value })}
                  step={0.5}
                  value={settings.list.discSize}
                  valueLabel={`${settings.list.discSize}px`}
                />
                <SliderRow
                  label="Circle size"
                  max={12}
                  min={3}
                  onChange={(value) => patchList({ circleSize: value })}
                  step={0.5}
                  value={settings.list.circleSize}
                  valueLabel={`${settings.list.circleSize}px`}
                />
                <SliderRow
                  label="Circle thickness"
                  max={3}
                  min={0.5}
                  onChange={(value) => patchList({ circleThickness: value })}
                  step={0.25}
                  value={settings.list.circleThickness}
                  valueLabel={`${settings.list.circleThickness}px`}
                />
                <SliderRow
                  label="Square size"
                  max={12}
                  min={3}
                  onChange={(value) => patchList({ squareSize: value })}
                  step={0.5}
                  value={settings.list.squareSize}
                  valueLabel={`${settings.list.squareSize}px`}
                />
                <SliderRow
                  label="Indent"
                  max={48}
                  min={12}
                  onChange={(value) => patchList({ indent: value })}
                  step={1}
                  value={settings.list.indent}
                  valueLabel={`${settings.list.indent}px`}
                />
              </>
            )}
          </ControlGroup>
        );
      }
    }
  };

  return (
    <section aria-labelledby="style-rail-pane-title" className="style-rail-detail">
      <header className="style-rail-detail-head">
        <h2 id="style-rail-pane-title">{pane.label}</h2>
        <p>Layered over {activeThemeName} theme</p>
      </header>
      <div className="style-rail-detail-body">{renderPaneBody()}</div>
    </section>
  );
}
