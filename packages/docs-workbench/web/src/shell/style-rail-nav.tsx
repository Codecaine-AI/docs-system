import { useLayoutEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Blend,
  Braces,
  Code2,
  CodeXml,
  Columns3,
  FileCode2,
  FolderTree,
  GitFork,
  Heading,
  Image,
  Layers3,
  Link,
  List,
  MessageSquareWarning,
  Minus,
  MousePointer2,
  Palette,
  PanelLeft,
  PanelRightOpen,
  PanelsTopLeft,
  PenTool,
  Pilcrow,
  Quote,
  ScrollText,
  Sparkles,
  Table2,
  Type,
  Video,
} from "lucide-react";
import type { FontChoice, StyleRailSettings } from "./StyleRail";
import { paneOverrideCount } from "./style-rail-overrides";

const FONT_SUMMARY_LABELS: Record<FontChoice, string> = {
  sans: "Sans",
  serif: "Serif",
  mono: "Mono",
};

export function formatTypographySummary(bodyFont: FontChoice, fontSize: number): string {
  return `${FONT_SUMMARY_LABELS[bodyFont]} · ${fontSize}px`;
}

type ResolvedRailColors = readonly [
  accent: string,
  background: string,
  text: string,
  sidebar: string,
];

function unresolvedRailColors(settings: StyleRailSettings): ResolvedRailColors {
  return [
    `var(--color-bg-${settings.accent})`,
    settings.colors.background ?? "var(--color-bg-default)",
    settings.colors.text ?? "var(--color-text-default)",
    settings.colors.sidebar ?? "var(--color-bg-sidebar)",
  ];
}

function resolveRailColors(settings: StyleRailSettings, dark: boolean): ResolvedRailColors {
  if (typeof document === "undefined" || !document.body) {
    return unresolvedRailColors(settings);
  }

  const probe = document.createElement("span");
  probe.setAttribute("data-theme", dark ? "dark" : "light");
  probe.style.position = "fixed";
  probe.style.width = "0";
  probe.style.height = "0";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);

  const resolve = (expression: string) => {
    probe.style.color = expression;
    return getComputedStyle(probe).color || "#ffffff";
  };

  try {
    return [
      resolve(`var(--color-bg-${settings.accent})`),
      settings.colors.background ?? resolve("var(--color-bg-default)"),
      settings.colors.text ?? resolve("var(--color-text-default)"),
      settings.colors.sidebar ?? resolve("var(--color-bg-sidebar)"),
    ];
  } finally {
    probe.remove();
  }
}

function useResolvedRailColors(
  settings: StyleRailSettings,
  dark: boolean,
): ResolvedRailColors {
  const { accent, colors } = settings;
  const unresolved = useMemo(
    () => unresolvedRailColors(settings),
    [accent, colors.background, colors.sidebar, colors.text],
  );
  const [resolved, setResolved] = useState<ResolvedRailColors>(unresolved);

  useLayoutEffect(() => {
    setResolved(resolveRailColors(settings, dark));
  }, [accent, colors.background, colors.sidebar, colors.text, dark]);

  return resolved;
}

const COMPONENT_PICKER_FILES = [
  "inline-code",
  "paragraph",
  "heading",
  "list-item",
  "quote",
  "code",
  "callout",
  "divider",
  "image",
  "video",
  "file-tree",
  "structured-table",
  "interaction-surface",
  "state-shape",
  "linking",
  "waterfall",
  "canvas",
  "surfaces",
] as const;

type ComponentPickerFile = (typeof COMPONENT_PICKER_FILES)[number];
type BlockPaneId = `blocks.${ComponentPickerFile}`;

const COMPONENT_LABELS: Partial<Record<ComponentPickerFile, string>> = {
  "inline-code": "Inline code",
  "list-item": "List item",
  "file-tree": "File tree",
  "structured-table": "Structured table",
  "interaction-surface": "Interaction surface",
  "state-shape": "State shape",
  linking: "Linked panels",
  surfaces: "Shared surfaces",
};

function componentLabel(file: ComponentPickerFile): string {
  if (COMPONENT_LABELS[file]) return COMPONENT_LABELS[file];
  return file.charAt(0).toUpperCase() + file.slice(1);
}

const COMPONENT_ICONS: Record<ComponentPickerFile, LucideIcon> = {
  "inline-code": Code2,
  paragraph: Pilcrow,
  heading: Heading,
  "list-item": List,
  quote: Quote,
  code: CodeXml,
  callout: MessageSquareWarning,
  divider: Minus,
  image: Image,
  video: Video,
  "file-tree": FolderTree,
  "structured-table": Table2,
  "interaction-surface": MousePointer2,
  "state-shape": Braces,
  linking: Link,
  waterfall: GitFork,
  canvas: PenTool,
  surfaces: Layers3,
};

export type StyleRailPaneId =
  | "theme.presets"
  | "theme.colors"
  | "theme.typography"
  | "theme.background"
  | "theme.references"
  | BlockPaneId
  | "layout.column"
  | "layout.surfaces"
  | "layout.sidebar"
  | "layout.scrollbar"
  | "layout.side-peek"
  | "layout.editor";

export type StyleRailNavItem = {
  id: StyleRailPaneId;
  label: string;
  icon: LucideIcon;
};

export type StyleRailNavGroup = {
  id: "theme" | "blocks" | "layout";
  label: string;
  items: readonly StyleRailNavItem[];
};

export const STYLE_RAIL_GROUPS: readonly StyleRailNavGroup[] = [
  {
    id: "theme",
    label: "Theme",
    items: [
      { id: "theme.presets", label: "Presets", icon: PanelsTopLeft },
      { id: "theme.colors", label: "Colors", icon: Palette },
      { id: "theme.typography", label: "Typography", icon: Type },
      { id: "theme.background", label: "Background", icon: Sparkles },
      { id: "theme.references", label: "References", icon: Link },
    ],
  },
  {
    id: "blocks",
    label: "Blocks",
    items: COMPONENT_PICKER_FILES.map((file) => ({
      id: `blocks.${file}` as BlockPaneId,
      label: componentLabel(file),
      icon: COMPONENT_ICONS[file],
    })),
  },
  {
    id: "layout",
    label: "Layout",
    items: [
      { id: "layout.column", label: "Column", icon: Columns3 },
      { id: "layout.surfaces", label: "Surfaces", icon: Blend },
      { id: "layout.sidebar", label: "Sidebar", icon: PanelLeft },
      { id: "layout.scrollbar", label: "Scrollbar", icon: ScrollText },
      { id: "layout.side-peek", label: "Side peek", icon: PanelRightOpen },
      { id: "layout.editor", label: "Editor", icon: FileCode2 },
    ],
  },
] as const;

const STYLE_RAIL_ITEMS = STYLE_RAIL_GROUPS.flatMap((group) => group.items);

export function isStyleRailPaneId(value: unknown): value is StyleRailPaneId {
  return typeof value === "string" && STYLE_RAIL_ITEMS.some((item) => item.id === value);
}

export function getStyleRailPaneItem(id: StyleRailPaneId): StyleRailNavItem {
  return STYLE_RAIL_ITEMS.find((item) => item.id === id) ?? STYLE_RAIL_ITEMS[0];
}

export function StyleRailNav({
  selectedId,
  settings,
  dark,
  onSelect,
}: {
  selectedId: StyleRailPaneId;
  settings: StyleRailSettings;
  dark: boolean;
  onSelect: (id: StyleRailPaneId) => void;
}) {
  const resolvedColors = useResolvedRailColors(settings, dark);
  const typographySummary = formatTypographySummary(
    settings.typography.bodyFont,
    settings.typography.fontSize,
  );
  const typographyAccessibleSummary =
    `${FONT_SUMMARY_LABELS[settings.typography.bodyFont]} ${settings.typography.fontSize} pixels`;

  return (
    <nav aria-label="Style sections" className="style-rail-nav">
      {STYLE_RAIL_GROUPS.map((group) => (
        <div className="style-rail-nav-group" key={group.id}>
          <div className="style-rail-nav-label">{group.label}</div>
          <div className="style-rail-nav-items">
            {group.items.map((item) => {
              const Icon = item.icon;
              const selected = item.id === selectedId;
              const overrideCount = paneOverrideCount(settings, item.id);
              const overrideLabel = overrideCount === 1 ? "override" : "overrides";
              const overrideName =
                overrideCount > 0 ? `, ${overrideCount} ${overrideLabel}` : "";
              const accessibleName =
                item.id === "theme.colors"
                  ? `${item.label}, accent ${resolvedColors[0]}, background ${resolvedColors[1]}, text ${resolvedColors[2]}, sidebar ${resolvedColors[3]}${overrideName}`
                  : item.id === "theme.typography"
                    ? `${item.label}, ${typographyAccessibleSummary}${overrideName}`
                    : overrideCount > 0
                      ? `${item.label}${overrideName}`
                      : undefined;
              return (
                <button
                  aria-current={selected ? "page" : undefined}
                  aria-label={accessibleName}
                  className="style-rail-nav-item"
                  data-active={selected ? "true" : undefined}
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  type="button"
                >
                  <span aria-hidden="true" className="style-rail-nav-icon">
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                  <span aria-hidden="true" className="style-rail-nav-status">
                    {item.id === "theme.colors" && (
                      <span className="style-rail-nav-color-strip">
                        {resolvedColors.map((color, index) => (
                          <span
                            className="style-rail-nav-color-swatch"
                            key={index}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </span>
                    )}
                    {item.id === "theme.typography" && (
                      <span className="style-rail-nav-value-summary">
                        {typographySummary}
                      </span>
                    )}
                    {overrideCount > 0 &&
                      (item.id.startsWith("blocks.") ? (
                        <span className="style-rail-nav-override-count">{overrideCount}</span>
                      ) : (
                        <span className="style-rail-nav-override-dot" />
                      ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
