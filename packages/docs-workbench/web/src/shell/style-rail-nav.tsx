import type { LucideIcon } from "lucide-react";
import {
  Braces,
  Code2,
  CodeXml,
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
  Workflow,
} from "lucide-react";
import type { StyleRailSettings } from "./StyleRail";
import { paneOverrideCount } from "./style-rail-overrides";

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
  "sequence",
  "canvas",
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
  sequence: Workflow,
  canvas: PenTool,
};

function componentItem(file: ComponentPickerFile): StyleRailNavItem {
  return {
    id: `blocks.${file}`,
    label: componentLabel(file),
    icon: COMPONENT_ICONS[file],
  };
}

export type StyleRailPaneId =
  | "theme.presets"
  | "theme.colors"
  | "theme.typography"
  | "theme.background"
  | "theme.surfaces"
  | "theme.references"
  | BlockPaneId
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
  id: "theme" | "layout" | "rich-text" | "code" | "structure" | "diagrams";
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
      { id: "theme.surfaces", label: "Surfaces", icon: Layers3 },
    ],
  },
  {
    id: "layout",
    label: "Layout",
    items: [
      { id: "layout.sidebar", label: "Sidebar", icon: PanelLeft },
      { id: "layout.editor", label: "Editor", icon: FileCode2 },
      { id: "layout.side-peek", label: "Side peek", icon: PanelRightOpen },
      { id: "layout.scrollbar", label: "Scrollbar", icon: ScrollText },
    ],
  },
  {
    id: "rich-text",
    label: "Rich text",
    items: [
      componentItem("paragraph"),
      componentItem("heading"),
      componentItem("list-item"),
      componentItem("quote"),
      componentItem("callout"),
      componentItem("divider"),
      componentItem("image"),
      componentItem("video"),
      { id: "theme.references", label: "References", icon: Link },
    ],
  },
  {
    id: "code",
    label: "Code",
    items: [
      componentItem("code"),
      componentItem("inline-code"),
      componentItem("linking"),
    ],
  },
  {
    id: "structure",
    label: "Structure",
    items: [
      componentItem("structured-table"),
      componentItem("file-tree"),
      componentItem("state-shape"),
      componentItem("interaction-surface"),
    ],
  },
  {
    id: "diagrams",
    label: "Diagrams",
    items: [
      componentItem("sequence"),
      componentItem("canvas"),
      componentItem("waterfall"),
    ],
  },
] as const;

const STYLE_RAIL_ITEMS = STYLE_RAIL_GROUPS.flatMap((group) => group.items);

// Retired pane ids: layout.column, layout.surfaces, blocks.surfaces.
export function isStyleRailPaneId(value: unknown): value is StyleRailPaneId {
  return typeof value === "string" && STYLE_RAIL_ITEMS.some((item) => item.id === value);
}

export function getStyleRailPaneItem(id: StyleRailPaneId): StyleRailNavItem {
  return STYLE_RAIL_ITEMS.find((item) => item.id === id) ?? STYLE_RAIL_ITEMS[0];
}

export function StyleRailNav({
  selectedId,
  settings,
  onSelect,
}: {
  selectedId: StyleRailPaneId;
  settings: StyleRailSettings;
  dark: boolean;
  onSelect: (id: StyleRailPaneId) => void;
}) {
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
                overrideCount > 0 ? `${item.label}${overrideName}` : undefined;
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
