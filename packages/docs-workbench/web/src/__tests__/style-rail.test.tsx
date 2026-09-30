import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";

import {
  BLOCK_COLUMN_SPLIT_DEFAULTS,
  BLOCK_COLUMN_SPLIT_MAX,
  BLOCK_COLUMN_SPLIT_MIN,
  BLOCK_LAYOUT_CUSTOM_WIDTH_MAX,
  BLOCK_LAYOUT_CUSTOM_WIDTH_MIN,
  DEFAULT_STYLE_RAIL_SETTINGS,
  StyleRail,
  applyBlockLayoutOverrideCss,
  applyStyleRailVars,
  blockLayoutOverrideCss,
  getStyleRailBaseline,
  loadStyleRailSettings,
  normalizeSettings,
  resetStyleRailBaseline,
  saveStyleRailSettings,
  setStyleRailBaseline,
  styleRailVars,
  type StyleRailSettings,
} from "../shell/StyleRail";
import {
  componentLeaf,
  isLeafOverridden,
  paneOverrideCount,
  settingLeaf,
} from "../shell/style-rail-overrides";
import { STYLE_RAIL_GROUPS } from "../shell/style-rail-nav";
import {
  THEME_TOKEN_REGISTRY,
  compileThemeCss,
  readThemeDefinition,
} from "../theme/theme-folders";

beforeEach(() => resetStyleRailBaseline());

const STORAGE_KEY = "docs-style-rail-settings.v2";
const LEGACY_STORAGE_KEY = "docs-style-rail-settings.v1";
const SELECTED_PANE_STORAGE_KEY = "docs-style-rail-selected";

const EXPECTED_NAV_GROUPS = [
  {
    id: "theme",
    label: "Theme",
    items: [
      { id: "theme.presets", label: "Presets" },
      { id: "theme.colors", label: "Colors" },
      { id: "theme.typography", label: "Typography" },
      { id: "theme.background", label: "Background" },
      { id: "theme.surfaces", label: "Surfaces" },
      { id: "theme.annotate", label: "Annotate" },
    ],
  },
  {
    id: "layout",
    label: "Layout",
    items: [
      { id: "layout.transitions", label: "Transitions" },
      { id: "layout.sidebar", label: "Sidebar" },
      { id: "layout.editor", label: "Editor" },
      { id: "layout.side-peek", label: "Side peek" },
      { id: "layout.scrollbar", label: "Scrollbar" },
    ],
  },
  {
    id: "rich-text",
    label: "Rich text",
    items: [
      { id: "blocks.paragraph", label: "Paragraph" },
      { id: "blocks.heading", label: "Heading" },
      { id: "blocks.list-item", label: "List item" },
      { id: "blocks.quote", label: "Quote" },
      { id: "blocks.callout", label: "Callout" },
      { id: "blocks.divider", label: "Divider" },
      { id: "blocks.image", label: "Image" },
      { id: "blocks.video", label: "Video" },
      { id: "theme.references", label: "References" },
    ],
  },
  {
    id: "code",
    label: "Code",
    items: [
      { id: "blocks.code", label: "Code" },
      { id: "blocks.inline-code", label: "Inline code" },
      { id: "blocks.linking", label: "Linked panels" },
    ],
  },
  {
    id: "structure",
    label: "Structure",
    items: [
      { id: "blocks.structured-table", label: "Structured table" },
      { id: "blocks.file-tree", label: "File tree" },
      { id: "blocks.state-shape", label: "State shape" },
      { id: "blocks.interaction-surface", label: "Interaction surface" },
    ],
  },
  {
    id: "diagrams",
    label: "Diagrams",
    items: [
      { id: "blocks.sequence", label: "Sequence" },
      { id: "blocks.canvas", label: "Canvas" },
      { id: "blocks.process-outline", label: "Process Outline" },
    ],
  },
] as const;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  // The repo baseline is module state, so it would otherwise leak from one
  // test into the next and quietly move every "at default" assertion.
  resetStyleRailBaseline();
  mock.restore();
});

function settingsWithList(
  list: Partial<StyleRailSettings["list"]>,
): StyleRailSettings {
  return {
    ...DEFAULT_STYLE_RAIL_SETTINGS,
    list: { ...DEFAULT_STYLE_RAIL_SETTINGS.list, ...list },
  };
}

function settingsWithSidebar(
  sidebar: Partial<StyleRailSettings["sidebar"]>,
): StyleRailSettings {
  return {
    ...DEFAULT_STYLE_RAIL_SETTINGS,
    sidebar: { ...DEFAULT_STYLE_RAIL_SETTINGS.sidebar, ...sidebar },
  };
}

function settingsWithReference(
  reference: Partial<StyleRailSettings["reference"]>,
): StyleRailSettings {
  return {
    ...DEFAULT_STYLE_RAIL_SETTINGS,
    reference: { ...DEFAULT_STYLE_RAIL_SETTINGS.reference, ...reference },
  };
}

function settingsWithAnnotate(
  annotate: Partial<StyleRailSettings["annotate"]>,
): StyleRailSettings {
  return {
    ...DEFAULT_STYLE_RAIL_SETTINGS,
    annotate: { ...DEFAULT_STYLE_RAIL_SETTINGS.annotate, ...annotate },
  };
}

function RailHarness({
  initial = DEFAULT_STYLE_RAIL_SETTINGS,
  onSaveStyleToRepo,
}: {
  initial?: StyleRailSettings;
  onSaveStyleToRepo?: () => void;
}) {
  const [settings, setSettings] = useState(initial);
  const [dark, setDark] = useState(false);
  return (
    <>
      <StyleRail
        activeThemeId="default"
        collapsed={false}
        dark={dark}
        onCollapsedChange={() => {}}
        onDarkChange={setDark}
        onSaveStyleToRepo={onSaveStyleToRepo}
        onSelectTheme={() => {}}
        onSettingsChange={setSettings}
        settings={settings}
        themes={[{ id: "default", name: "Default", source: "builtin" }]}
      />
      <output data-testid="list-settings">{JSON.stringify(settings.list)}</output>
      <output data-testid="reference-settings">{JSON.stringify(settings.reference)}</output>
      <output data-testid="component-settings">{JSON.stringify(settings.components)}</output>
      <output data-testid="dark-setting">{String(dark)}</output>
      <output data-testid="rail-settings">{JSON.stringify(settings)}</output>
    </>
  );
}

function openPane(name: string | RegExp) {
  const navigation = screen.getByRole("navigation", { name: "Style sections" });
  fireEvent.click(within(navigation).getByRole("button", { name }));
}

describe("style rail override helpers", () => {
  const seeded: StyleRailSettings = {
    ...DEFAULT_STYLE_RAIL_SETTINGS,
    accent: "purple",
    typography: { ...DEFAULT_STYLE_RAIL_SETTINGS.typography, fontSize: 16 },
    list: { ...DEFAULT_STYLE_RAIL_SETTINGS.list, discSize: 8 },
    components: {
      code: { ruleOpacity: "0.9" },
      callout: { border: "#ff0000" },
      surfaces: { radius: "8px" },
    },
  };

  it("attributes seeded scalar and component overrides to exactly one pane", () => {
    const counts = Object.fromEntries(
      STYLE_RAIL_GROUPS.flatMap((group) => group.items).map((item) => [
        item.id,
        paneOverrideCount(seeded, item.id),
      ]),
    );

    expect(counts).toEqual({
      "theme.presets": 0,
      "theme.colors": 1,
      "theme.typography": 1,
      "theme.background": 0,
      "theme.surfaces": 0,
      "theme.annotate": 0,
      "theme.references": 0,
      "blocks.inline-code": 0,
      "blocks.paragraph": 0,
      "blocks.heading": 0,
      "blocks.list-item": 1,
      "blocks.quote": 0,
      "blocks.code": 1,
      "blocks.callout": 1,
      "blocks.divider": 0,
      "blocks.image": 0,
      "blocks.video": 0,
      "blocks.file-tree": 0,
      "blocks.structured-table": 0,
      "blocks.interaction-surface": 0,
      "blocks.state-shape": 0,
      "blocks.linking": 0,
      "blocks.process-outline": 0,
      "blocks.sequence": 0,
      "blocks.canvas": 0,
      "layout.transitions": 0,
      "layout.sidebar": 0,
      "layout.scrollbar": 0,
      "layout.side-peek": 0,
      "layout.editor": 0,
    });
    expect(isLeafOverridden(seeded, settingLeaf("accent"))).toBe(true);
    expect(isLeafOverridden(seeded, componentLeaf("code", "ruleOpacity"))).toBe(true);
  });

  it("excludes a retained non-color component entry at its registry default", () => {
    const settings: StyleRailSettings = {
      ...DEFAULT_STYLE_RAIL_SETTINGS,
      components: { surfaces: { radius: "8px" } },
    };

    expect(isLeafOverridden(settings, componentLeaf("surfaces", "radius"))).toBe(false);
    expect(paneOverrideCount(settings, "theme.surfaces")).toBe(0);
  });

  it("attributes the retired Column leaves to Editor", () => {
    const settings: StyleRailSettings = {
      ...DEFAULT_STYLE_RAIL_SETTINGS,
      layout: {
        ...DEFAULT_STYLE_RAIL_SETTINGS.layout,
        contentWidth: 112,
        contentMargin: 40,
        topPadding: 28,
        titlePadding: 24,
        bottomPadding: 32,
      },
    };

    expect(paneOverrideCount(settings, "layout.editor")).toBe(5);
  });

  it("attributes the wide-lane leaf to Editor", () => {
    const settings: StyleRailSettings = {
      ...DEFAULT_STYLE_RAIL_SETTINGS,
      layout: { ...DEFAULT_STYLE_RAIL_SETTINGS.layout, wideWidth: 1800 },
    };

    expect(isLeafOverridden(settings, settingLeaf("layout.wideWidth"))).toBe(true);
    expect(paneOverrideCount(settings, "layout.editor")).toBe(1);
  });

  it("attributes surface knobs and component tokens to the merged Surfaces pane", () => {
    const settings: StyleRailSettings = {
      ...DEFAULT_STYLE_RAIL_SETTINGS,
      layout: {
        ...DEFAULT_STYLE_RAIL_SETTINGS.layout,
        radius: 12,
        borderStrength: 1.5,
        backgroundTint: 0.2,
        sidebarTint: -0.2,
      },
      components: {
        surfaces: {
          border: "#112233",
          muted: "#445566",
          icon: "#778899",
          radius: "12px",
        },
      },
    };

    expect(paneOverrideCount(settings, "theme.surfaces")).toBe(8);
  });
});

describe("style rail navigation", () => {
  it("renders the six regrouped sections with all 30 pane items in order", () => {
    expect(
      STYLE_RAIL_GROUPS.map((group) => ({
        id: group.id,
        label: group.label,
        items: group.items.map((item) => ({ id: item.id, label: item.label })),
      })),
    ).toEqual(
      EXPECTED_NAV_GROUPS.map((group) => ({
        id: group.id,
        label: group.label,
        items: group.items.map((item) => ({ id: item.id, label: item.label })),
      })),
    );

    render(<RailHarness />);
    const navigation = within(screen.getByRole("navigation", { name: "Style sections" }));

    expect(
      Array.from(
        screen.getByRole("navigation", { name: "Style sections" })
          .querySelectorAll(".style-rail-nav-label"),
        (label) => label.textContent,
      ),
    ).toEqual(EXPECTED_NAV_GROUPS.map((group) => group.label));
    for (const group of EXPECTED_NAV_GROUPS) {
      for (const item of group.items) {
        expect(navigation.getByRole("button", { name: item.label })).toBeTruthy();
      }
    }
    expect(navigation.getAllByRole("button")).toHaveLength(6 + 5 + 9 + 3 + 4 + 3);
  });

  it("swaps the visible detail pane when a rail item is selected", () => {
    render(<RailHarness />);

    expect(screen.getByRole("heading", { name: "Presets" })).toBeTruthy();
    openPane("Colors");
    expect(screen.getByRole("heading", { name: "Colors" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Presets" })).toBeNull();
  });

  it("persists and restores the selected pane", () => {
    render(<RailHarness />);
    openPane("Sidebar");
    expect(window.localStorage.getItem(SELECTED_PANE_STORAGE_KEY)).toBe("layout.sidebar");

    cleanup();
    render(<RailHarness />);
    expect(screen.getByRole("heading", { name: "Sidebar" })).toBeTruthy();
  });

  it("falls back to Presets when the stored pane id is invalid", () => {
    window.localStorage.setItem(SELECTED_PANE_STORAGE_KEY, "layout.missing");
    render(<RailHarness />);

    expect(screen.getByRole("heading", { name: "Presets" })).toBeTruthy();
  });

  for (const retiredId of ["layout.column", "layout.surfaces", "blocks.surfaces"]) {
    it(`falls back to Presets when the stored pane id is retired (${retiredId})`, () => {
      window.localStorage.setItem(SELECTED_PANE_STORAGE_KEY, retiredId);
      render(<RailHarness />);

      expect(screen.getByRole("heading", { name: "Presets" })).toBeTruthy();
    });
  }

  it("shows the pane name and active theme layering line in the detail head", () => {
    render(<RailHarness />);
    openPane("Callout");

    expect(screen.getByRole("heading", { name: "Callout" })).toBeTruthy();
    expect(screen.getByText("No overrides · layered over Default theme")).toBeTruthy();
  });

  it("round-trips the complete settings object through export and import", async () => {
    const custom = normalizeSettings({
      accent: "green",
      background: "#112233",
      list: { indent: 31 },
      components: { code: { ruleWidth: "2px", zebraOpacity: "0.6" } },
    });
    let exportedBlob: Blob | null = null;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = ((blob: Blob) => {
      exportedBlob = blob;
      return "blob:style-rail-round-trip-test";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
    HTMLAnchorElement.prototype.click = () => {};

    try {
      render(<RailHarness initial={custom} />);
      fireEvent.click(screen.getByRole("button", { name: "Export theme" }));
      expect(exportedBlob).toBeTruthy();
      const exportedText = await exportedBlob!.text();

      fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
      expect(JSON.parse(screen.getByTestId("rail-settings").textContent ?? "null")).toEqual(
        DEFAULT_STYLE_RAIL_SETTINGS,
      );

      const imported = new File([exportedText], "theme.json", { type: "application/json" });
      fireEvent.change(screen.getByLabelText("Import theme"), {
        target: { files: [imported] },
      });
      await waitFor(() => {
        expect(JSON.parse(screen.getByTestId("rail-settings").textContent ?? "null")).toEqual(
          custom,
        );
      });
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      HTMLAnchorElement.prototype.click = originalAnchorClick;
    }
  });
});

describe("style rail override state", () => {
  it("shows block counts and theme or layout dots in the rail", () => {
    const initial: StyleRailSettings = {
      ...DEFAULT_STYLE_RAIL_SETTINGS,
      typography: { ...DEFAULT_STYLE_RAIL_SETTINGS.typography, fontSize: 16 },
      layout: { ...DEFAULT_STYLE_RAIL_SETTINGS.layout, contentWidth: 112 },
      components: {
        callout: { border: "#ff0000", fill: "#00ff00" },
      },
    };
    render(<RailHarness initial={initial} />);
    const navigation = within(screen.getByRole("navigation", { name: "Style sections" }));

    const callout = navigation.getByRole("button", { name: "Callout, 2 overrides" });
    expect(within(callout).getByText("2")).toHaveProperty(
      "className",
      "style-rail-nav-override-count",
    );
    expect(
      navigation
        .getByRole("button", { name: "Typography, 1 override" })
        .querySelector(".style-rail-nav-override-dot"),
    ).toBeTruthy();
    expect(
      navigation
        .getByRole("button", { name: "Editor, 1 override" })
        .querySelector(".style-rail-nav-override-dot"),
    ).toBeTruthy();
  });

  it("updates the header, rail state, and row dot when a knob changes", () => {
    render(<RailHarness />);
    openPane("Typography");

    expect(screen.getByText("No overrides · layered over Default theme")).toBeTruthy();
    const fontSize = screen.getByLabelText(/Font size/) as HTMLInputElement;
    const row = fontSize.closest("label");
    expect(row?.querySelector(".style-rail-row-override-dot")?.getAttribute("data-overridden"))
      .toBe("false");

    fireEvent.change(fontSize, { target: { value: "16" } });

    expect(screen.getByText("1 override · layered over Default theme")).toBeTruthy();
    expect(row?.querySelector(".style-rail-row-override-dot")?.getAttribute("data-overridden"))
      .toBe("true");
    expect(
      screen.getByRole("button", { name: "Typography, 1 override" }),
    ).toBeTruthy();

    openPane("Colors");
    expect(
      (screen.getByLabelText("Dark mode") as HTMLInputElement)
        .closest("label")
        ?.querySelector(".style-rail-row-override-dot"),
    ).toBeNull();
  });

  it("resets only the selected block file and hides the reset row at zero", () => {
    const initial: StyleRailSettings = {
      ...DEFAULT_STYLE_RAIL_SETTINGS,
      layout: { ...DEFAULT_STYLE_RAIL_SETTINGS.layout, contentWidth: 112, wideWidth: 1800 },
      sidebar: { ...DEFAULT_STYLE_RAIL_SETTINGS.sidebar, font: "mono" },
      components: {
        callout: { border: "#ff0000", fill: "#00ff00" },
        code: { ruleOpacity: "0.9" },
      },
    };
    render(<RailHarness initial={initial} />);
    openPane("Callout, 2 overrides");

    fireEvent.click(screen.getByRole("button", { name: "Reset Callout to theme" }));

    expect(JSON.parse(screen.getByTestId("component-settings").textContent ?? "null")).toEqual({
      code: { ruleOpacity: "0.9" },
    });
    const settings = JSON.parse(screen.getByTestId("rail-settings").textContent ?? "null");
    expect(settings.layout.contentWidth).toBe(112);
    expect(settings.layout.wideWidth).toBe(1800);
    expect(settings.sidebar.font).toBe("mono");
    expect(screen.queryByRole("button", { name: "Reset Callout to theme" })).toBeNull();
    expect(screen.getByText("No overrides · layered over Default theme")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Callout" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Code, 1 override" })).toBeTruthy();
  });

  it("resets list-item component tokens and list settings together", () => {
    const initial: StyleRailSettings = {
      ...DEFAULT_STYLE_RAIL_SETTINGS,
      list: { ...DEFAULT_STYLE_RAIL_SETTINGS.list, discSize: 8 },
      components: {
        "list-item": { marker: "#ff0000" },
        code: { ruleOpacity: "0.9" },
      },
    };
    render(<RailHarness initial={initial} />);
    openPane("List item, 2 overrides");

    fireEvent.click(screen.getByRole("button", { name: "Reset List item to theme" }));

    expect(JSON.parse(screen.getByTestId("list-settings").textContent ?? "null")).toEqual(
      DEFAULT_STYLE_RAIL_SETTINGS.list,
    );
    expect(JSON.parse(screen.getByTestId("component-settings").textContent ?? "null")).toEqual({
      code: { ruleOpacity: "0.9" },
    });
    expect(screen.queryByRole("button", { name: "Reset List item to theme" })).toBeNull();
  });
});

describe("style rail merged panes", () => {
  it("renders Column first in Editor with all six column controls", () => {
    render(<RailHarness />);
    openPane("Editor");

    const detailBody = document.querySelector(".style-rail-detail-body");
    expect(
      Array.from(detailBody?.querySelectorAll("h3") ?? [], (heading) => heading.textContent),
    ).toEqual(["Column", "Highlight", "Drop line", "Drag select", "Drag grip"]);

    const column = screen.getByRole("heading", { name: "Column" }).closest("section");
    expect(column).toBeTruthy();
    for (const label of [
      /^Max width/,
      // The wide lane data-heavy blocks break out to, and the global left
      // rail the left-anchored page hangs off (renamed from "Padding" — it is
      // no longer a symmetric gutter around a centered column).
      /^Wide lane/,
      /^Left margin/,
      /^Top padding/,
      /^Title padding/,
      /^Bottom padding/,
    ]) {
      expect(within(column!).getByLabelText(label)).toBeTruthy();
    }
  });

  it("renders surface knobs and tokens, then resets only surface token overrides", () => {
    const initial: StyleRailSettings = {
      ...DEFAULT_STYLE_RAIL_SETTINGS,
      layout: { ...DEFAULT_STYLE_RAIL_SETTINGS.layout, radius: 12 },
      components: {
        surfaces: { border: "#ff0000" },
        code: { ruleOpacity: "0.9" },
      },
    };
    render(<RailHarness initial={initial} />);
    openPane(/^Surfaces/);

    for (const label of [
      /^Radius/,
      /^Border strength/,
      /^Background tint/,
      /^Sidebar tint/,
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    const tokens = screen.getByRole("heading", { name: "Tokens" }).closest("section");
    expect(tokens).toBeTruthy();
    for (const label of ["Border", "Muted fill", "Icons", "Corner radius"]) {
      expect(within(tokens!).getByText(label)).toBeTruthy();
    }

    fireEvent.click(screen.getByRole("button", { name: "Reset Surfaces tokens to theme" }));

    expect(JSON.parse(screen.getByTestId("component-settings").textContent ?? "null")).toEqual({
      code: { ruleOpacity: "0.9" },
    });
    expect(
      JSON.parse(screen.getByTestId("rail-settings").textContent ?? "null").layout.radius,
    ).toBe(12);
    expect(
      screen.queryByRole("button", { name: "Reset Surfaces tokens to theme" }),
    ).toBeNull();
    expect(screen.getByText("1 override · layered over Default theme")).toBeTruthy();
  });
});

describe("state-shape text meets WCAG AAA in both themes", () => {
  /**
   * The field list muted itself into unreadability twice (type at 3.4:1,
   * the optional marker at 2.7:1). Hierarchy in that block is carried by SIZE
   * and WEIGHT, so there is never a reason for its text to go light — this
   * pins the floor at AAA (7:1).
   *
   * The two backgrounds are the pane backgrounds as actually rendered by the
   * running app (measured over CDP against the live serve, both themes); the
   * palette resolves --background through several indirections that are not
   * worth re-implementing here.
   */
  const LIGHT_BG: [number, number, number] = [251, 250, 248];
  const DARK_BG: [number, number, number] = [47, 52, 55];
  const LIGHT_FG: [number, number, number] = [55, 53, 47]; // --foreground, used by --docs-shape-name
  const DARK_FG: [number, number, number] = [234, 235, 235]; // white @ 0.9 over DARK_BG

  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]: [number, number, number]) =>
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const contrast = (a: [number, number, number], b: [number, number, number]) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const hexToRgb = (hex: string): [number, number, number] => {
    const h = hex.replace("#", "").trim();
    return [
      Number.parseInt(h.slice(0, 2), 16),
      Number.parseInt(h.slice(2, 4), 16),
      Number.parseInt(h.slice(4, 6), 16),
    ];
  };

  const css = readFileSync(new URL("../theme/semantic.css", import.meta.url), "utf8");
  const blockAfter = (marker: string) => {
    const start = css.indexOf(marker);
    if (start < 0) throw new Error(`missing theme block: ${marker}`);
    return css.slice(start, css.indexOf("\n}", start));
  };
  const tokenIn = (block: string, name: string) => {
    const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block);
    if (!match) throw new Error(`${name} is not a plain hex in this theme block`);
    return hexToRgb(match[1]);
  };

  const TEXT_TOKENS = [
    "--docs-shape-type",
    "--docs-shape-muted",
    "--docs-shape-optional-fg",
    "--docs-shape-desc-fg",
  ];

  it("clears 7:1 for every state-shape text token in the light theme", () => {
    const block = blockAfter(':root, [data-theme="light"] {');
    for (const token of TEXT_TOKENS) {
      expect(contrast(tokenIn(block, token), LIGHT_BG)).toBeGreaterThanOrEqual(7);
    }
    // The field name rides --foreground.
    expect(contrast(LIGHT_FG, LIGHT_BG)).toBeGreaterThanOrEqual(7);
  });

  it("clears 7:1 for every state-shape text token in the dark theme", () => {
    const block = blockAfter('[data-theme="dark"], .dark {');
    for (const token of TEXT_TOKENS) {
      expect(contrast(tokenIn(block, token), DARK_BG)).toBeGreaterThanOrEqual(7);
    }
    expect(contrast(DARK_FG, DARK_BG)).toBeGreaterThanOrEqual(7);
  });
});

describe("per-block-type layout overrides", () => {
  const withLayout = (blockLayout: StyleRailSettings["blockLayout"]): StyleRailSettings => ({
    ...DEFAULT_STYLE_RAIL_SETTINGS,
    blockLayout,
  });

  it("ships no overrides at stock", () => {
    expect(DEFAULT_STYLE_RAIL_SETTINGS.blockLayout).toEqual({});
    expect(blockLayoutOverrideCss(DEFAULT_STYLE_RAIL_SETTINGS)).toBe("");
  });

  it("keeps a valid override and drops unknown block types", () => {
    const normalized = normalizeSettings(
      {
        blockLayout: {
          "state-shape": { width: "full", justify: "center" },
          // Not a doc block type — must not survive into a CSS selector.
          "not-a-block": { width: "wide" },
        },
      },
      DEFAULT_STYLE_RAIL_SETTINGS,
    );
    expect(normalized.blockLayout).toEqual({
      "state-shape": { width: "full", justify: "center" },
    });
  });

  it("drops invalid enum values and entries left with nothing", () => {
    const normalized = normalizeSettings(
      {
        blockLayout: {
          "state-shape": { width: "enormous", justify: "sideways" },
          canvas: { width: "wide", justify: "sideways" },
        },
      },
      DEFAULT_STYLE_RAIL_SETTINGS,
    );
    // state-shape had nothing valid left, so it is not an override at all.
    expect(normalized.blockLayout).toEqual({ canvas: { width: "wide" } });
  });

  it("clamps a custom px width into range", () => {
    const normalized = normalizeSettings(
      {
        blockLayout: {
          "state-shape": { width: "99999px" },
          "structured-table": { width: "10px" },
          code: { width: "880px" },
        },
      },
      DEFAULT_STYLE_RAIL_SETTINGS,
    );
    expect(normalized.blockLayout["state-shape"]?.width).toBe(`${BLOCK_LAYOUT_CUSTOM_WIDTH_MAX}px`);
    expect(normalized.blockLayout["structured-table"]?.width).toBe(
      `${BLOCK_LAYOUT_CUSTOM_WIDTH_MIN}px`,
    );
    expect(normalized.blockLayout.code?.width).toBe("880px");
  });

  it("emits one rule per overridden block type, keyed on the lane attribute pair", () => {
    const css = blockLayoutOverrideCss(
      withLayout({
        "state-shape": { width: "full" },
        canvas: { justify: "center" },
      }),
    );
    expect(css).toContain('[data-doc-lane][data-doc-block-type="state-shape"] { max-width: none; }');
    expect(css).toContain(
      '[data-doc-lane][data-doc-block-type="canvas"] { margin-inline: auto; }',
    );
  });

  it("maps each named width onto the lane token it stands for", () => {
    expect(blockLayoutOverrideCss(withLayout({ code: { width: "text" } }))).toContain(
      "max-width: var(--style-content-width,60ch);",
    );
    expect(blockLayoutOverrideCss(withLayout({ code: { width: "wide" } }))).toContain(
      "max-width: var(--style-wide-width,1040px);",
    );
    expect(blockLayoutOverrideCss(withLayout({ code: { width: "full" } }))).toContain(
      "max-width: none;",
    );
    expect(blockLayoutOverrideCss(withLayout({ code: { width: "920px" } }))).toContain(
      "max-width: 920px;",
    );
  });

  it("expresses justification as margins, left explicitly", () => {
    expect(blockLayoutOverrideCss(withLayout({ image: { justify: "left" } }))).toContain(
      "margin-left: 0; margin-right: auto;",
    );
    expect(blockLayoutOverrideCss(withLayout({ image: { justify: "center" } }))).toContain(
      "margin-inline: auto;",
    );
  });

  it("never needs !important — the attribute pair out-specifies the lane utility", () => {
    const css = blockLayoutOverrideCss(
      withLayout({
        "state-shape": { width: "custom" as never },
        canvas: { width: "full", justify: "center" },
        image: { justify: "left" },
      }),
    );
    expect(css).not.toContain("!important");
  });

  it("applies the rules into one reusable <style> element", () => {
    applyBlockLayoutOverrideCss(withLayout({ "state-shape": { width: "full" } }));
    const first = document.querySelectorAll("style[id]");
    const element = [...first].find((el) => el.textContent?.includes("state-shape"));
    expect(element).toBeTruthy();

    // Re-applying replaces the contents rather than stacking a second element.
    applyBlockLayoutOverrideCss(withLayout({ canvas: { justify: "center" } }));
    expect(element?.textContent).not.toContain("state-shape");
    expect(element?.textContent).toContain("canvas");

    // No overrides empties it instead of removing it.
    applyBlockLayoutOverrideCss(DEFAULT_STYLE_RAIL_SETTINGS);
    expect(element?.textContent).toBe("");
  });

  it("registers the lane leaves as overridden and counts them on the block's pane", () => {
    const settings = withLayout({ "state-shape": { width: "full" } });
    expect(isLeafOverridden(settings, settingLeaf("blockLayout.state-shape.width"))).toBe(true);
    // The untouched half of the same entry is NOT an override.
    expect(isLeafOverridden(settings, settingLeaf("blockLayout.state-shape.justify"))).toBe(false);
    // And a block type with no entry at all reads clean rather than throwing.
    expect(isLeafOverridden(settings, settingLeaf("blockLayout.canvas.width"))).toBe(false);
    expect(paneOverrideCount(settings, "blocks.state-shape")).toBe(1);
  });

  it("clamps the column split and keeps it only on two-pane block types", () => {
    const normalized = normalizeSettings(
      {
        blockLayout: {
          "state-shape": { columnSplit: 999 },
          "interaction-surface": { columnSplit: 1 },
          code: { columnSplit: 40 },
        },
      },
      DEFAULT_STYLE_RAIL_SETTINGS,
    );
    expect(normalized.blockLayout["state-shape"]?.columnSplit).toBe(BLOCK_COLUMN_SPLIT_MAX);
    expect(normalized.blockLayout["interaction-surface"]?.columnSplit).toBe(
      BLOCK_COLUMN_SPLIT_MIN,
    );
    // `code` is a real block type so the entry survives normalization, but it
    // renders one pane — the emitter is what refuses to give it a split.
    expect(blockLayoutOverrideCss(withLayout({ code: { columnSplit: 40 } }))).toBe("");
  });

  it("emits the split as the pane-split custom property", () => {
    const css = blockLayoutOverrideCss(withLayout({ "state-shape": { columnSplit: 40 } }));
    expect(css).toContain(
      '[data-doc-lane][data-doc-block-type="state-shape"] { --docs-pane-split: 40%; }',
    );
  });

  it("starts the split slider where the components actually render", () => {
    // An unset knob emits nothing, so each component's literal fallback is
    // what renders — these must agree or the slider lies about the page.
    const shape = readFileSync(
      new URL(
        "../../../../docs-viewer/src/components/state-shape/StateShapeDocsBlock.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const surface = readFileSync(
      new URL(
        "../../../../docs-viewer/src/components/interaction-surface/InteractionSurfaceDocsBlock.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    expect(shape).toContain(
      `minmax(0,var(--docs-pane-split,${BLOCK_COLUMN_SPLIT_DEFAULTS["state-shape"]}%))`,
    );
    expect(surface).toContain(
      `minmax(0,var(--docs-pane-split,${BLOCK_COLUMN_SPLIT_DEFAULTS["interaction-surface"]}%))`,
    );
  });

  it("drives the split from the slider and keeps it beside the other lane fields", () => {
    render(<RailHarness />);
    openPane("State shape");

    const slider = screen.getByLabelText(/Column split/) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "30" } });
    expect(
      JSON.parse(screen.getByTestId("rail-settings").textContent ?? "null").blockLayout,
    ).toEqual({ "state-shape": { columnSplit: 30 } });

    // Setting a different lane field must not drop the split (and vice versa).
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "full" } });
    expect(
      JSON.parse(screen.getByTestId("rail-settings").textContent ?? "null").blockLayout,
    ).toEqual({ "state-shape": { columnSplit: 30, width: "full" } });
  });

  it("shows Column split only on the two-pane panes", () => {
    render(<RailHarness />);

    openPane("State shape");
    expect(screen.getByLabelText(/Column split/)).toBeTruthy();

    openPane("Interaction surface");
    expect(screen.getByLabelText(/Column split/)).toBeTruthy();

    // Single-pane block: width and justification, but nothing to split.
    openPane("Code");
    expect(screen.queryByLabelText(/Column split/)).toBeNull();
  });

  it("renders the Layout section on a block pane and not on a non-block pane", () => {
    render(<RailHarness />);

    openPane("State shape");
    expect(screen.getByLabelText("Width")).toBeTruthy();
    expect(screen.getByLabelText("Justification")).toBeTruthy();

    openPane("Inline code");
    expect(screen.queryByLabelText("Justification")).toBeNull();
  });

  it("drives the settings from the Layout controls, and 'Default' clears the override", () => {
    render(<RailHarness />);
    openPane("State shape");

    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "full" } });
    expect(
      JSON.parse(screen.getByTestId("rail-settings").textContent ?? "null").blockLayout,
    ).toEqual({ "state-shape": { width: "full" } });

    fireEvent.change(screen.getByLabelText("Justification"), { target: { value: "center" } });
    expect(
      JSON.parse(screen.getByTestId("rail-settings").textContent ?? "null").blockLayout,
    ).toEqual({ "state-shape": { width: "full", justify: "center" } });

    // Clearing both fields deletes the entry entirely — absent IS the default.
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "default" } });
    fireEvent.change(screen.getByLabelText("Justification"), { target: { value: "default" } });
    expect(
      JSON.parse(screen.getByTestId("rail-settings").textContent ?? "null").blockLayout,
    ).toEqual({});
  });

  it("persists lane and annotate settings into railDefaults for locked serves and exports", () => {
    // railDefaults is every setting EXCEPT `components`, so both rescued lane
    // settings and the annotate group ride the same repo write-back transport.
    const settings: StyleRailSettings = {
      ...withLayout({ canvas: { justify: "center" } }),
      annotate: {
        ...DEFAULT_STYLE_RAIL_SETTINGS.annotate,
        washOpacity: 0.12,
        actionPaneWidth: 400,
      },
    };
    const { components, ...railDefaults } = settings;
    expect(railDefaults.blockLayout).toEqual({ canvas: { justify: "center" } });
    expect(railDefaults.annotate).toEqual({
      ...DEFAULT_STYLE_RAIL_SETTINGS.annotate,
      washOpacity: 0.12,
      actionPaneWidth: 400,
    });

    // And it round-trips back through the baseline installer.
    const baseline = setStyleRailBaseline(railDefaults);
    expect(baseline.blockLayout).toEqual({ canvas: { justify: "center" } });
    expect(baseline.annotate).toEqual(railDefaults.annotate);
    // A knob equal to the repo baseline is not local drift.
    expect(
      isLeafOverridden(withLayout({ canvas: { justify: "center" } }), settingLeaf("blockLayout.canvas.justify")),
    ).toBe(false);
    resetStyleRailBaseline();
  });
});

describe("style rail stock values match the consumers' inline fallbacks", () => {
  /**
   * A knob parked at STOCK emits no var (that is what "let the stylesheet
   * answer" means), so what actually renders by default is the literal
   * fallback each consumer carries. If a stock value and its fallback drift
   * apart, the rail advertises one default and the page renders another —
   * silently. These pin the pairs together.
   */
  const layoutSource = readFileSync(
    new URL("../pages/DocPage.tsx", import.meta.url),
    "utf8",
  );
  const laneSource = readFileSync(
    new URL("../../../../docs-viewer/src/render/block-layout.ts", import.meta.url),
    "utf8",
  );
  const blockClassesSource = readFileSync(
    new URL("../../../../docs-viewer/src/render/block-classes.ts", import.meta.url),
    "utf8",
  );
  const indexCss = readFileSync(new URL("../index.css", import.meta.url), "utf8");

  it("DocPage's left-margin fallback equals stock layout.contentMargin", () => {
    expect(DEFAULT_STYLE_RAIL_SETTINGS.layout.contentMargin).toBe(88);
    expect(layoutSource).toContain("px-[var(--style-content-margin,88px)]");
  });

  it("the wide lane's fallback equals stock layout.wideWidth", () => {
    expect(DEFAULT_STYLE_RAIL_SETTINGS.layout.wideWidth).toBe(1040);
    expect(laneSource).toContain("max-w-[var(--style-wide-width,1040px)]");
  });

  it("the text lane's fallback equals stock layout.contentWidth", () => {
    expect(DEFAULT_STYLE_RAIL_SETTINGS.layout.contentWidth).toBe(60);
    expect(laneSource).toContain("max-w-[var(--style-content-width,60ch)]");
    expect(indexCss).toContain("--style-editor-text-lane: var(--style-content-width, 60ch);");
  });

  it("body text fallbacks equal stock typography (sans, 18px, 1.45, 0em)", () => {
    const { typography } = DEFAULT_STYLE_RAIL_SETTINGS;
    expect(typography.bodyFont).toBe("sans");
    expect(typography.headingFont).toBe("sans");
    expect(typography.fontSize).toBe(18);
    expect(typography.lineHeight).toBe(1.45);
    expect(typography.letterSpacing).toBe(0);
    expect(indexCss).not.toContain("--style-font-size, 0.875rem");
    // Four readers: the container, the text-block re-assertion, and the quote
    // and callout-body rules that multiply the reading size by their own
    // text-scale token (1 by default, so they restate the same size).
    expect(indexCss.match(/var\(--style-font-size, 18px\)/g)?.length).toBe(4);
    expect(indexCss).toContain(
      "font-size: calc(var(--style-font-size, 18px) * var(--docs-quote-text-scale, 1));",
    );
    expect(indexCss).toContain(
      "font-size: calc(var(--style-font-size, 18px) * var(--docs-callout-body-text-scale, 1));",
    );
    expect(indexCss.match(/var\(--style-line-height, 1\.45\)/g)?.length).toBe(2);
    expect(blockClassesSource).not.toContain("leading-[1.7]");
    expect(blockClassesSource).toContain(
      "text-[length:var(--style-font-size,18px)] leading-[var(--style-line-height,1.45)]",
    );
  });
});

describe("style rail wide lane", () => {
  it("defaults, clamps, and migrates the wide-lane width", () => {
    expect(DEFAULT_STYLE_RAIL_SETTINGS.layout.wideWidth).toBe(1040);
    expect(normalizeSettings({ accent: "purple" }).layout.wideWidth).toBe(1040);
    expect(normalizeSettings({ layout: { wideWidth: 1200 } }).layout.wideWidth).toBe(1200);
    expect(normalizeSettings({ layout: { wideWidth: 100 } }).layout.wideWidth).toBe(900);
    expect(normalizeSettings({ layout: { wideWidth: 9000 } }).layout.wideWidth).toBe(2400);
    expect(normalizeSettings({ layout: { wideWidth: "wide" } }).layout.wideWidth).toBe(1040);
  });

  it("defaults and clamps the global left margin", () => {
    // The page is left-anchored now, so contentMargin IS the left rail —
    // generous by default and tunable well past the old 96px gutter cap.
    expect(DEFAULT_STYLE_RAIL_SETTINGS.layout.contentMargin).toBe(88);
    expect(normalizeSettings({ accent: "purple" }).layout.contentMargin).toBe(88);
    expect(normalizeSettings({ layout: { contentMargin: 200 } }).layout.contentMargin).toBe(200);
    expect(normalizeSettings({ layout: { contentMargin: -20 } }).layout.contentMargin).toBe(0);
    expect(normalizeSettings({ layout: { contentMargin: 9000 } }).layout.contentMargin).toBe(240);
  });

  it("emits the px-bearing wide-lane var and omits it at the default", () => {
    expect(styleRailVars(DEFAULT_STYLE_RAIL_SETTINGS)["--style-wide-width"]).toBeNull();
    expect(
      styleRailVars({
        ...DEFAULT_STYLE_RAIL_SETTINGS,
        layout: { ...DEFAULT_STYLE_RAIL_SETTINGS.layout, wideWidth: 1800 },
      })["--style-wide-width"],
    ).toBe("1800px");
  });
});

describe("style rail list settings", () => {
  it("defaults old settings blobs and validates every list geometry knob", () => {
    expect(DEFAULT_STYLE_RAIL_SETTINGS.list).toEqual({
      discSize: 6,
      circleSize: 6,
      circleThickness: 1.5,
      squareSize: 5,
      indent: 24,
    });
    expect(normalizeSettings({ accent: "purple" }).list).toEqual(
      DEFAULT_STYLE_RAIL_SETTINGS.list,
    );

    expect(
      normalizeSettings({
        list: {
          level1: "diamond",
          markerSize: 2,
          indent: 30,
        },
      }).list,
    ).toEqual({
      ...DEFAULT_STYLE_RAIL_SETTINGS.list,
      indent: 30,
    });

    expect(
      normalizeSettings({
        list: {
          discSize: 99,
          circleSize: 0,
          circleThickness: 99,
          squareSize: 0,
          indent: 0,
        },
      }).list,
    ).toEqual({
      discSize: 12,
      circleSize: 3,
      circleThickness: 3,
      squareSize: 3,
      indent: 12,
    });

    expect(
      normalizeSettings({
        list: {
          discSize: -1,
          circleSize: 100,
          circleThickness: -1,
          squareSize: 100,
          indent: 100,
        },
      }).list,
    ).toEqual({
      discSize: 3,
      circleSize: 12,
      circleThickness: 0.5,
      squareSize: 12,
      indent: 48,
    });
  });

  it("emits unit-bearing geometry overrides and omits them at defaults", () => {
    const defaultVars = styleRailVars(DEFAULT_STYLE_RAIL_SETTINGS);
    expect({
      discSize: defaultVars["--docs-list-disc-size"],
      circleSize: defaultVars["--docs-list-circle-size"],
      circleThickness: defaultVars["--docs-list-circle-thickness"],
      squareSize: defaultVars["--docs-list-square-size"],
      indent: defaultVars["--docs-list-indent"],
    }).toEqual({
      discSize: null,
      circleSize: null,
      circleThickness: null,
      squareSize: null,
      indent: null,
    });

    const vars = styleRailVars(
      settingsWithList({
        discSize: 7.5,
        circleSize: 8,
        circleThickness: 2.25,
        squareSize: 4.5,
        indent: 32,
      }),
    );
    expect(vars["--docs-list-disc-size"]).toBe("7.5px");
    expect(vars["--docs-list-circle-size"]).toBe("8px");
    expect(vars["--docs-list-circle-thickness"]).toBe("2.25px");
    expect(vars["--docs-list-square-size"]).toBe("4.5px");
    expect(vars["--docs-list-indent"]).toBe("32px");
    expect(vars["--docs-list-bullet-l1"]).toBeUndefined();
    expect(vars["--docs-list-marker-size"]).toBeUndefined();
  });

  it("persists the list group and upgrades blobs with retired list keys", () => {
    const custom = settingsWithList({
      discSize: 9,
      circleSize: 7,
      circleThickness: 2,
      squareSize: 6.5,
      indent: 36,
    });
    saveStyleRailSettings(custom);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null").list).toEqual(
      custom.list,
    );
    expect(loadStyleRailSettings().list).toEqual(custom.list);

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accent: "green",
        list: { level1: "diamond", markerSize: 2.25, indent: 30 },
      }),
    );
    expect(loadStyleRailSettings()).toMatchObject({
      accent: "green",
      list: { ...DEFAULT_STYLE_RAIL_SETTINGS.list, indent: 30 },
    });
  });

  it("migrates a v1 cache, dropping reading metrics left at the old stock values", () => {
    window.localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({
        accent: "green",
        typography: { bodyFont: "serif", fontSize: 14, lineHeight: 1.7, letterSpacing: 0 },
        layout: { contentWidth: 100, contentMargin: 120 },
      }),
    );
    const migrated = loadStyleRailSettings();
    expect(migrated.accent).toBe("green");
    expect(migrated.typography.bodyFont).toBe("serif");
    expect(migrated.typography.fontSize).toBe(DEFAULT_STYLE_RAIL_SETTINGS.typography.fontSize);
    expect(migrated.typography.lineHeight).toBe(DEFAULT_STYLE_RAIL_SETTINGS.typography.lineHeight);
    expect(migrated.layout.contentWidth).toBe(DEFAULT_STYLE_RAIL_SETTINGS.layout.contentWidth);
    expect(migrated.layout.contentMargin).toBe(120);

    // A metric the user actually moved survives the migration.
    window.localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({ typography: { fontSize: 16, lineHeight: 1.6 }, layout: { contentWidth: 80 } }),
    );
    const tuned = loadStyleRailSettings();
    expect(tuned.typography.fontSize).toBe(16);
    expect(tuned.typography.lineHeight).toBe(1.6);
    expect(tuned.layout.contentWidth).toBe(80);

    // A v2 cache wins over v1 and is read verbatim (no stripping).
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ typography: { fontSize: 14 } }));
    expect(loadStyleRailSettings().typography.fontSize).toBe(14);
  });

  it("renders five list geometry sliders, no shape selects, and patches only the list group", () => {
    render(<RailHarness />);
    openPane("List item");

    const discSize = screen.getByLabelText(/Disc size/) as HTMLInputElement;
    const circleSize = screen.getByLabelText(/Circle size/) as HTMLInputElement;
    const circleThickness = screen.getByLabelText(/Circle thickness/) as HTMLInputElement;
    const squareSize = screen.getByLabelText(/Square size/) as HTMLInputElement;
    const indent = screen.getByLabelText(/Indent/) as HTMLInputElement;

    expect(screen.queryByLabelText("Level 1 marker")).toBeNull();
    expect(screen.queryByLabelText("Level 2 marker")).toBeNull();
    expect(screen.queryByLabelText("Level 3 marker")).toBeNull();

    fireEvent.change(discSize, { target: { value: "7.5" } });
    fireEvent.change(circleSize, { target: { value: "8" } });
    fireEvent.change(circleThickness, { target: { value: "2.25" } });
    fireEvent.change(squareSize, { target: { value: "4.5" } });
    fireEvent.change(indent, { target: { value: "31" } });

    expect(JSON.parse(screen.getByTestId("list-settings").textContent ?? "null")).toEqual({
      discSize: 7.5,
      circleSize: 8,
      circleThickness: 2.25,
      squareSize: 4.5,
      indent: 31,
    });
    expect(discSize).toHaveProperty("min", "3");
    expect(discSize).toHaveProperty("max", "12");
    expect(discSize).toHaveProperty("step", "0.5");
    expect(circleSize).toHaveProperty("min", "3");
    expect(circleSize).toHaveProperty("max", "12");
    expect(circleSize).toHaveProperty("step", "0.5");
    expect(circleThickness).toHaveProperty("min", "0.5");
    expect(circleThickness).toHaveProperty("max", "3");
    expect(circleThickness).toHaveProperty("step", "0.25");
    expect(squareSize).toHaveProperty("min", "3");
    expect(squareSize).toHaveProperty("max", "12");
    expect(squareSize).toHaveProperty("step", "0.5");
    expect(indent).toHaveProperty("min", "12");
    expect(indent).toHaveProperty("max", "48");
    expect(indent).toHaveProperty("step", "1");
  });

  it("includes list settings in export/import and reset-to-defaults", async () => {
    const custom = settingsWithList({
      discSize: 10,
      circleSize: 9,
      circleThickness: 2.5,
      squareSize: 8,
      indent: 40,
    });
    let exportedBlob: Blob | null = null;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = ((blob: Blob) => {
      exportedBlob = blob;
      return "blob:style-rail-test";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
    HTMLAnchorElement.prototype.click = () => {};

    try {
      render(<RailHarness initial={custom} />);
      fireEvent.click(screen.getByRole("button", { name: "Export theme" }));
      expect(exportedBlob).toBeTruthy();
      const exported = JSON.parse(await exportedBlob!.text());
      expect(exported.settings.list).toEqual(custom.list);

      const imported = new File(
        [
          JSON.stringify({
            dark: true,
            settings: {
              list: {
                discSize: 13,
                circleSize: 2,
                circleThickness: 9,
                squareSize: 8.5,
                indent: 16,
              },
            },
          }),
        ],
        "theme.json",
        { type: "application/json" },
      );
      fireEvent.change(screen.getByLabelText("Import theme"), { target: { files: [imported] } });
      await waitFor(() => {
        expect(JSON.parse(screen.getByTestId("list-settings").textContent ?? "null")).toEqual({
          discSize: 12,
          circleSize: 3,
          circleThickness: 3,
          squareSize: 8.5,
          indent: 16,
        });
        expect(screen.getByTestId("dark-setting").textContent).toBe("true");
      });

      fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
      expect(JSON.parse(screen.getByTestId("list-settings").textContent ?? "null")).toEqual(
        DEFAULT_STYLE_RAIL_SETTINGS.list,
      );
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      HTMLAnchorElement.prototype.click = originalAnchorClick;
    }
  });
});

describe("style rail reference settings", () => {
  it("defaults old blobs and validates icon appearance and layout", () => {
    expect(DEFAULT_STYLE_RAIL_SETTINGS.reference).toEqual({
      color: null,
      underlineColor: null,
      iconSize: 12,
      iconColor: null,
      iconGap: 2,
      iconPosition: "before",
    });
    expect(normalizeSettings({ accent: "purple" }).reference).toEqual(
      DEFAULT_STYLE_RAIL_SETTINGS.reference,
    );
    expect(
      normalizeSettings({
        reference: {
          color: "#ABCDEF",
          hoverColor: "#ffffff",
          underlineColor: "#123456",
          iconSize: 99,
          iconColor: "#FEDCBA",
          iconGap: -4,
          iconPosition: "after",
        },
      }).reference,
    ).toEqual({
      color: "#abcdef",
      underlineColor: "#123456",
      iconSize: 28,
      iconColor: "#fedcba",
      iconGap: 0,
      iconPosition: "after",
    });
  });

  it("emits reference icon variables and omits them at defaults", () => {
    const defaultVars = styleRailVars(DEFAULT_STYLE_RAIL_SETTINGS);
    expect(defaultVars["--docs-ref-icon-size"]).toBeNull();
    expect(defaultVars["--docs-ref-icon-color"]).toBeNull();
    expect(defaultVars["--docs-ref-icon-gap"]).toBeNull();
    expect(defaultVars["--docs-ref-icon-direction"]).toBeNull();
    expect(defaultVars["--docs-ref-hover-color"]).toBeUndefined();

    const vars = styleRailVars(
      settingsWithReference({
        iconSize: 18,
        iconColor: "#123456",
        iconGap: 7,
        iconPosition: "after",
      }),
    );
    expect(vars["--docs-ref-icon-size"]).toBe("18px");
    expect(vars["--docs-ref-icon-color"]).toBe("#123456");
    expect(vars["--docs-ref-icon-gap"]).toBe("7px");
    expect(vars["--docs-ref-icon-direction"]).toBe("row-reverse");
  });

  it("renders and patches the reference icon controls", () => {
    render(<RailHarness />);
    openPane("References");

    expect(screen.getByText("Text color")).toBeTruthy();
    expect(screen.getByText("Hover underline")).toBeTruthy();
    expect(screen.queryAllByText("Hover color")).toHaveLength(0);
    expect(screen.getByText("Icon")).toBeTruthy();
    expect(document.querySelectorAll("input[type='color']")).toHaveLength(3);

    fireEvent.change(screen.getByLabelText(/Size/), { target: { value: "18" } });
    fireEvent.change(screen.getByLabelText(/Spacing/), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Position"), { target: { value: "after" } });

    expect(JSON.parse(screen.getByTestId("reference-settings").textContent ?? "null")).toEqual({
      ...DEFAULT_STYLE_RAIL_SETTINGS.reference,
      iconSize: 18,
      iconGap: 7,
      iconPosition: "after",
    });
  });
});

describe("style rail annotate settings", () => {
  it("defaults legacy blobs and normalizes annotate overrides", () => {
    expect(DEFAULT_STYLE_RAIL_SETTINGS.annotate).toEqual({
      accent: null,
      add: null,
      del: null,
      washOpacity: 0.08,
      actionPaneWidth: 520,
    });
    expect(normalizeSettings({ accent: "purple" }).annotate).toEqual(
      DEFAULT_STYLE_RAIL_SETTINGS.annotate,
    );

    expect(
      normalizeSettings({
        annotate: {
          accent: "#ABCDEF",
          add: "#22C55E",
          del: "#EF4444",
          washOpacity: 0.14,
          actionPaneWidth: 440,
        },
      }).annotate,
    ).toEqual({
      accent: "#abcdef",
      add: "#22c55e",
      del: "#ef4444",
      washOpacity: 0.14,
      actionPaneWidth: 440,
    });

    expect(
      normalizeSettings({
        annotate: {
          accent: "indigo",
          add: "#bad",
          del: 1,
          washOpacity: 1,
          actionPaneWidth: 999,
        },
      }).annotate,
    ).toEqual({
      accent: null,
      add: null,
      del: null,
      washOpacity: 0.3,
      actionPaneWidth: 680,
    });
    expect(
      normalizeSettings({ annotate: { washOpacity: -1, actionPaneWidth: 1 } }).annotate,
    ).toMatchObject({ washOpacity: 0, actionPaneWidth: 380 });
  });

  it("emits annotate variables only away from semantic defaults", () => {
    const defaultVars = styleRailVars(DEFAULT_STYLE_RAIL_SETTINGS);
    expect(defaultVars["--annotation-accent"]).toBeNull();
    expect(defaultVars["--docs-annotation-add"]).toBeNull();
    expect(defaultVars["--docs-annotation-del"]).toBeNull();
    expect(defaultVars["--docs-annotation-wash"]).toBeNull();
    expect(defaultVars["--docs-action-pane-width"]).toBeNull();

    const vars = styleRailVars(
      settingsWithAnnotate({
        accent: "#6366F1",
        add: "#22C55E",
        del: "#EF4444",
        washOpacity: 0.15,
        actionPaneWidth: 440,
      }),
    );
    expect(vars["--annotation-accent"]).toBe("#6366F1");
    expect(vars["--docs-annotation-add"]).toBe("#22C55E");
    expect(vars["--docs-annotation-del"]).toBe("#EF4444");
    expect(vars["--docs-annotation-wash"]).toBe(
      "color-mix(in srgb, var(--annotation-accent) 15%, transparent)",
    );
    expect(vars["--docs-action-pane-width"]).toBe("440px");
  });

  it("persists a normalized annotate group", () => {
    const normalized = normalizeSettings({
      annotate: {
        accent: "#6366f1",
        add: "#22c55e",
        del: "#ef4444",
        washOpacity: 0.12,
        actionPaneWidth: 400,
      },
    });
    saveStyleRailSettings(normalized);
    expect(loadStyleRailSettings().annotate).toEqual(normalized.annotate);
  });
});

describe("style rail sidebar settings", () => {
  it("defaults legacy settings blobs and validates every sidebar control", () => {
    expect(DEFAULT_STYLE_RAIL_SETTINGS.sidebar).toEqual({
      textColor: null,
      font: "sans",
      fontSize: 14,
      padding: 4,
      guides: true,
      guideColor: null,
      guideWidth: 1,
      guideOpacity: 0.6,
    });
    expect(normalizeSettings({ accent: "purple" }).sidebar).toEqual(
      DEFAULT_STYLE_RAIL_SETTINGS.sidebar,
    );
    expect(
      normalizeSettings({
        sidebar: {
          textColor: "#123456",
          font: "mono",
          fontSize: 16,
          padding: 8,
        },
      }).sidebar,
    ).toEqual({
      textColor: "#123456",
      font: "mono",
      fontSize: 16,
      padding: 8,
      guides: true,
      guideColor: null,
      guideWidth: 1,
      guideOpacity: 0.6,
    });

    expect(
      normalizeSettings({
        sidebar: {
          textColor: "#ABCDEF",
          font: "serif",
          fontSize: 99,
          padding: -1,
          guides: false,
          guideColor: "#ABCDEF",
          guideWidth: 99,
          guideOpacity: -1,
        },
      }).sidebar,
    ).toEqual({
      textColor: "#abcdef",
      font: "serif",
      fontSize: 20,
      padding: 0,
      guides: false,
      guideColor: "#abcdef",
      guideWidth: 4,
      guideOpacity: 0.05,
    });

    expect(
      normalizeSettings({
        sidebar: {
          textColor: 123,
          font: "display",
          fontSize: 0,
          padding: 99,
          guides: "false",
          guideColor: "not-a-color",
          guideWidth: 0,
          guideOpacity: 99,
        },
      }).sidebar,
    ).toEqual({
      textColor: null,
      font: "sans",
      fontSize: 10,
      padding: 16,
      guides: true,
      guideColor: null,
      guideWidth: 1,
      guideOpacity: 1,
    });
  });

  it("emits sidebar overrides and omits them at defaults", () => {
    const defaultVars = styleRailVars(DEFAULT_STYLE_RAIL_SETTINGS);
    expect({
      textColor: defaultVars["--docs-sidebar-item-fg"],
      font: defaultVars["--docs-sidebar-font"],
      fontSize: defaultVars["--docs-sidebar-font-size"],
      padding: defaultVars["--docs-sidebar-item-py"],
      guideDisplay: defaultVars["--docs-sidebar-guide-display"],
      guideColor: defaultVars["--docs-sidebar-guide-color"],
      guideWidth: defaultVars["--docs-sidebar-guide-width"],
      guideOpacity: defaultVars["--docs-sidebar-guide-opacity"],
    }).toEqual({
      textColor: null,
      font: null,
      fontSize: null,
      padding: null,
      guideDisplay: null,
      guideColor: null,
      guideWidth: null,
      guideOpacity: null,
    });

    const vars = styleRailVars(
      settingsWithSidebar({
        textColor: "#123456",
        font: "mono",
        fontSize: 17,
        padding: 9,
        guides: false,
        guideColor: "#654321",
        guideWidth: 2.5,
        guideOpacity: 0.35,
      }),
    );
    expect(vars["--docs-sidebar-item-fg"]).toBe("#123456");
    expect(vars["--docs-sidebar-font"]).toBe(
      "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace",
    );
    expect(vars["--docs-sidebar-font-size"]).toBe("17px");
    expect(vars["--docs-sidebar-item-py"]).toBe("9px");
    expect(vars["--docs-sidebar-guide-display"]).toBe("none");
    expect(vars["--docs-sidebar-guide-color"]).toBe("#654321");
    expect(vars["--docs-sidebar-guide-width"]).toBe("2.5px");
    expect(vars["--docs-sidebar-guide-opacity"]).toBe("0.35");
  });

  it("renders the Sidebar pane and its nine controls", () => {
    render(<RailHarness />);
    openPane("Sidebar");

    expect(screen.getByLabelText(/Background/)).toBeTruthy();
    expect(screen.getByText("Text color")).toBeTruthy();

    const font = screen.getByLabelText("Font") as HTMLSelectElement;
    expect(Array.from(font.options, (option) => option.value)).toEqual([
      "sans",
      "serif",
      "mono",
    ]);
    expect(font.value).toBe("sans");

    const textSize = screen.getByLabelText(/Text size/) as HTMLInputElement;
    expect(textSize).toHaveProperty("min", "10");
    expect(textSize).toHaveProperty("max", "20");
    expect(textSize).toHaveProperty("step", "1");
    expect(textSize).toHaveProperty("value", "14");

    const padding = screen.getByLabelText(/^Padding/) as HTMLInputElement;
    expect(padding).toHaveProperty("min", "0");
    expect(padding).toHaveProperty("max", "16");
    expect(padding).toHaveProperty("step", "1");
    expect(padding).toHaveProperty("value", "4");

    const indentGuides = screen.getByLabelText("Indent guides") as HTMLInputElement;
    expect(indentGuides).toHaveProperty("type", "checkbox");
    expect(indentGuides).toHaveProperty("checked", true);
    expect(screen.getByText("Guide color")).toBeTruthy();

    const guideWidth = screen.getByLabelText(/Guide width/) as HTMLInputElement;
    expect(guideWidth).toHaveProperty("min", "1");
    expect(guideWidth).toHaveProperty("max", "4");
    expect(guideWidth).toHaveProperty("step", "0.5");
    expect(guideWidth).toHaveProperty("value", "1");

    const guideOpacity = screen.getByLabelText(/Guide opacity/) as HTMLInputElement;
    expect(guideOpacity).toHaveProperty("min", "0.05");
    expect(guideOpacity).toHaveProperty("max", "1");
    expect(guideOpacity).toHaveProperty("step", "0.05");
    expect(guideOpacity).toHaveProperty("value", "0.6");
  });
});

describe("style rail component token kinds", () => {
  it("removes radius properties when their knobs sit at defaults", () => {
    const root = document.documentElement;
    for (const property of [
      "--radius",
      "--docs-highlight-radius",
      "--docs-dropcursor-radius",
      "--docs-table-handle-radius",
    ]) {
      root.style.setProperty(property, "99px");
    }

    applyStyleRailVars({
      ...DEFAULT_STYLE_RAIL_SETTINGS,
      components: {
        surfaces: { radius: "8px" },
        "structured-table": { handleRadius: "3px" },
      },
    });

    expect(root.style.getPropertyValue("--radius")).toBe("");
    expect(root.style.getPropertyValue("--docs-highlight-radius")).toBe("");
    expect(root.style.getPropertyValue("--docs-dropcursor-radius")).toBe("");
    expect(root.style.getPropertyValue("--docs-table-handle-radius")).toBe("");
  });

  it("keeps non-default section overrides when component tokens are absent or default", () => {
    const settings: StyleRailSettings = {
      ...DEFAULT_STYLE_RAIL_SETTINGS,
      layout: {
        ...DEFAULT_STYLE_RAIL_SETTINGS.layout,
        radius: 12,
        borderStrength: 1.5,
      },
      components: {},
    };
    const vars = styleRailVars(settings);

    expect(vars["--radius"]).toBe("12px");
    expect(vars["--border"]).toContain("color-mix(");
    expect(
      styleRailVars({
        ...settings,
        components: { surfaces: { radius: "8px" } },
      })["--radius"],
    ).toBe("12px");

    applyStyleRailVars(settings);
    expect(document.documentElement.style.getPropertyValue("--radius")).toBe("12px");
    expect(document.documentElement.style.getPropertyValue("--border")).toContain("color-mix(");
    applyStyleRailVars(DEFAULT_STYLE_RAIL_SETTINGS);
  });

  it("loads and compiles the global surface radius token", () => {
    expect(THEME_TOKEN_REGISTRY.surfaces.radius).toEqual({
      vars: ["--radius"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 8,
    });

    const theme = readThemeDefinition(
      "rounded",
      {
        name: "Rounded",
        components: {
          surfaces: { radius: { light: "4px", dark: "12px" } },
        },
      },
      "repo",
    );

    expect(theme?.components.surfaces).toEqual({
      radius: { light: "4px", dark: "12px" },
    });
    expect(compileThemeCss(theme!)).toContain("--radius: 4px;");
    expect(compileThemeCss(theme!)).toContain("--radius: 12px;");
  });

  it("normalizes and applies color, length, and number overrides", () => {
    const settings = normalizeSettings({
      components: {
        "structured-table": {
          border: "#ABCDEF",
          headerRuleWidth: "2px",
          headerRuleOpacity: "0.6",
          rowRuleWidth: "3.5px",
          rowRuleOpacity: "not-a-number",
          cellPaddingY: 12,
          fontSize: "14rem",
          unknown: "1px",
        },
      },
    });

    expect(settings.components).toEqual({
      "structured-table": {
        border: "#abcdef",
        headerRuleWidth: "2px",
        headerRuleOpacity: "0.6",
        cellPaddingY: "12px",
      },
    });
    expect(styleRailVars(settings)).toMatchObject({
      "--docs-table-border": "#abcdef",
      "--docs-table-header-rule-width": "2px",
      "--docs-table-header-rule-opacity": "0.6",
      "--docs-table-cell-pad-y": "12px",
    });
  });

  it("preserves unit-bearing component values through localStorage", () => {
    const settings = normalizeSettings({
      components: {
        "structured-table": {
          headerRuleWidth: "2px",
          headerRuleOpacity: "0.6",
        },
      },
    });

    saveStyleRailSettings(settings);
    expect(loadStyleRailSettings().components["structured-table"]).toEqual({
      headerRuleWidth: "2px",
      headerRuleOpacity: "0.6",
    });
  });

  it("renders metadata-driven structured-table sliders and stores their units", () => {
    render(<RailHarness />);
    openPane("Structured table");

    const width = screen.getByLabelText(/Header rule width/) as HTMLInputElement;
    const opacity = screen.getByLabelText(/Header rule opacity/) as HTMLInputElement;
    expect(width).toHaveProperty("min", "0");
    expect(width).toHaveProperty("max", "4");
    expect(width).toHaveProperty("step", "0.5");
    expect(width).toHaveProperty("value", "1.5");
    expect(opacity).toHaveProperty("min", "0");
    expect(opacity).toHaveProperty("max", "1");
    expect(opacity).toHaveProperty("step", "0.05");

    fireEvent.change(width, { target: { value: "2" } });
    fireEvent.change(opacity, { target: { value: "0.6" } });
    expect(JSON.parse(screen.getByTestId("component-settings").textContent ?? "null")).toEqual({
      "structured-table": {
        headerRuleWidth: "2px",
        headerRuleOpacity: "0.6",
      },
    });
  });

  it("renders the editor-furniture sliders (handle radius/offset, selection padding)", () => {
    render(<RailHarness />);
    openPane("Structured table");

    const radius = screen.getByLabelText(/Handle radius/) as HTMLInputElement;
    const offset = screen.getByLabelText(/Handle offset/) as HTMLInputElement;
    const padding = screen.getByLabelText(/Selection padding/) as HTMLInputElement;
    expect(radius).toHaveProperty("min", "0");
    expect(radius).toHaveProperty("max", "10");
    expect(radius).toHaveProperty("step", "0.5");
    expect(radius).toHaveProperty("value", "3");
    expect(offset).toHaveProperty("min", "4");
    expect(offset).toHaveProperty("max", "20");
    expect(offset).toHaveProperty("step", "1");
    expect(offset).toHaveProperty("value", "12");
    expect(padding).toHaveProperty("min", "0");
    expect(padding).toHaveProperty("max", "8");
    expect(padding).toHaveProperty("step", "0.5");
    expect(padding).toHaveProperty("value", "3");

    fireEvent.change(radius, { target: { value: "0" } });
    expect(JSON.parse(screen.getByTestId("component-settings").textContent ?? "null")).toEqual({
      "structured-table": { handleRadius: "0px" },
    });

    // The three keys map onto the furniture vars the editor consumes.
    expect(
      styleRailVars(
        normalizeSettings({
          components: {
            "structured-table": {
              handleRadius: "0px",
              handleOffset: "16px",
              selectionPadding: "4px",
            },
          },
        }),
      ),
    ).toMatchObject({
      "--docs-table-handle-radius": "0px",
      "--docs-table-handle-offset": "16px",
      "--docs-table-selection-pad": "4px",
    });
  });
});

describe("style rail structured-table tokens", () => {
  // [min, max, step, defaultValue] per token; `label` is what the rail shows.
  const TABLE_LENGTHS = {
    borderWidth: { cssVar: "--docs-table-border-width", label: "Border width", range: [0, 4, 0.5, 1] },
    radius: { cssVar: "--docs-table-radius", label: "Corner radius", range: [0, 16, 1, 6] },
    headerTextSize: {
      cssVar: "--docs-table-header-text-size",
      label: "Header text size",
      range: [10, 24, 0.5, 13],
    },
    headerRuleWidth: {
      cssVar: "--docs-table-header-rule-width",
      label: "Header rule width",
      range: [0, 4, 0.5, 1.5],
    },
    rowRuleWidth: { cssVar: "--docs-table-row-rule-width", label: "Row rule width", range: [0, 3, 0.5, 1] },
    columnRuleWidth: {
      cssVar: "--docs-table-column-rule-width",
      label: "Column rule width",
      range: [0, 3, 0.5, 1],
    },
    cellPaddingY: { cssVar: "--docs-table-cell-pad-y", label: "Row padding", range: [4, 24, 1, 10] },
    cellPaddingX: { cssVar: "--docs-table-cell-pad-x", label: "Cell padding", range: [8, 32, 1, 12] },
    rowMinHeight: { cssVar: "--docs-table-row-min-height", label: "Row min height", range: [0, 96, 1, 0] },
    fontSize: { cssVar: "--docs-table-font-size", label: "Text size", range: [10, 24, 0.5, 14] },
    titleTextSize: {
      cssVar: "--docs-table-title-text-size",
      label: "Title text size",
      range: [10, 24, 0.5, 14],
    },
    titleGap: { cssVar: "--docs-table-title-gap", label: "Title gap", range: [0, 24, 1, 6] },
    handleRadius: { cssVar: "--docs-table-handle-radius", label: "Handle radius", range: [0, 10, 0.5, 3] },
    handleOffset: { cssVar: "--docs-table-handle-offset", label: "Handle offset", range: [4, 20, 1, 12] },
    selectionPadding: {
      cssVar: "--docs-table-selection-pad",
      label: "Selection padding",
      range: [0, 8, 0.5, 3],
    },
  } as const;
  const TABLE_NUMBERS = {
    headerWeight: { cssVar: "--docs-table-header-weight", label: "Header weight", range: [300, 900, 50, 500] },
    headerRuleOpacity: {
      cssVar: "--docs-table-header-rule-opacity",
      label: "Header rule opacity",
      range: [0, 1, 0.05, 0.5],
    },
    rowRuleOpacity: {
      cssVar: "--docs-table-row-rule-opacity",
      label: "Row rule opacity",
      range: [0, 1, 0.05, 1],
    },
    columnRuleOpacity: {
      cssVar: "--docs-table-column-rule-opacity",
      label: "Column rule opacity",
      range: [0, 1, 0.05, 1],
    },
    lineHeight: { cssVar: "--docs-table-line-height", label: "Line height", range: [1, 2.2, 0.05, 1.55] },
    bodyWeight: { cssVar: "--docs-table-body-weight", label: "Body weight", range: [300, 900, 50, 400] },
    titleWeight: { cssVar: "--docs-table-title-weight", label: "Title weight", range: [300, 900, 50, 500] },
  } as const;
  const TABLE_COLORS = {
    border: { cssVar: "--docs-table-border", label: "Border" },
    bg: { cssVar: "--docs-table-bg", label: "Background" },
    headerBg: { cssVar: "--docs-table-header-bg", label: "Header background" },
    headerFg: { cssVar: "--docs-table-header-fg", label: "Header text" },
    headerRule: { cssVar: "--docs-table-header-rule", label: "Header rule" },
    rowRule: { cssVar: "--docs-table-row-rule", label: "Row rule" },
    columnRule: { cssVar: "--docs-table-column-rule", label: "Column rule" },
    rowHoverBg: { cssVar: "--docs-table-row-hover-bg", label: "Row hover background" },
    fg: { cssVar: "--docs-table-fg", label: "Text" },
    titleFg: { cssVar: "--docs-table-title-fg", label: "Title text" },
  } as const;
  // Tokens whose semantic.css default is DERIVED from another token, so the
  // declaration is an expression rather than the registry's stock number.
  const DERIVED_DEFAULTS: Record<string, string> = {
    "--docs-table-radius": "max(0px, calc(var(--radius) - 2px))",
    "--docs-table-handle-radius": "max(0px, calc(var(--radius) - 5px))",
    "--docs-table-header-text-size": "calc(var(--docs-table-font-size) - 1px)",
    "--docs-table-column-rule-width": "var(--docs-table-row-rule-width)",
    "--docs-table-column-rule-opacity": "var(--docs-table-row-rule-opacity)",
  };
  const SLIDERS = [
    ...Object.entries(TABLE_LENGTHS).map(([key, token]) => ({ key, unit: "px", ...token })),
    ...Object.entries(TABLE_NUMBERS).map(([key, token]) => ({ key, unit: "", ...token })),
  ];

  const viewerSource = (path: string) =>
    readFileSync(
      new URL(`../../../../docs-viewer/src/components/structured-table/${path}`, import.meta.url),
      "utf8",
    );
  const semanticCss = readFileSync(new URL("../theme/semantic.css", import.meta.url), "utf8");
  const indexCss = readFileSync(new URL("../index.css", import.meta.url), "utf8");
  const tableClasses = viewerSource("table-classes.ts");
  const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

  it("registers every table var under the structured-table entry", () => {
    const entry = THEME_TOKEN_REGISTRY["structured-table"];
    for (const [key, { cssVar }] of Object.entries(TABLE_COLORS)) {
      expect(entry[key]).toEqual({ vars: [cssVar], kind: "color" });
    }
    for (const [key, { cssVar, range }] of Object.entries(TABLE_LENGTHS)) {
      const [min, max, step, defaultValue] = range;
      expect(entry[key]).toEqual({
        vars: [cssVar],
        kind: "length",
        min,
        max,
        step,
        unit: "px",
        defaultValue,
      });
    }
    for (const [key, { cssVar, range }] of Object.entries(TABLE_NUMBERS)) {
      const [min, max, step, defaultValue] = range;
      expect(entry[key]).toEqual({ vars: [cssVar], kind: "number", min, max, step, defaultValue });
    }
    // Nothing registered beyond the pinned set, so a new knob has to land here.
    expect(Object.keys(entry).sort()).toEqual(
      [
        ...Object.keys(TABLE_COLORS),
        ...Object.keys(TABLE_LENGTHS),
        ...Object.keys(TABLE_NUMBERS),
      ].sort(),
    );
  });

  it("declares every table var in both semantic.css blocks at the registry default", () => {
    for (const { cssVar } of Object.values(TABLE_COLORS)) {
      expect(occurrences(semanticCss, `  ${cssVar}: `)).toBe(2);
    }
    for (const { cssVar, unit, range } of SLIDERS) {
      const value = DERIVED_DEFAULTS[cssVar] ?? `${range[3]}${unit}`;
      expect(occurrences(semanticCss, `  ${cssVar}: ${value};`)).toBe(2);
    }
    // The three derived defaults resolve to the registry number at stock:
    // radius 8px - 2px, handle 8px - 5px, header 14px - 1px.
    expect(occurrences(semanticCss, "  --radius: 0.5rem;")).toBe(2);
    expect<number>(TABLE_LENGTHS.radius.range[3]).toBe(8 - 2);
    expect<number>(TABLE_LENGTHS.handleRadius.range[3]).toBe(8 - 5);
    expect<number>(TABLE_LENGTHS.headerTextSize.range[3]).toBe(
      TABLE_LENGTHS.fontSize.range[3] - 1,
    );
    // Column rules start level with the row rules they follow.
    expect(TABLE_LENGTHS.columnRuleWidth.range).toEqual(TABLE_LENGTHS.rowRuleWidth.range);
    expect(TABLE_NUMBERS.columnRuleOpacity.range).toEqual(TABLE_NUMBERS.rowRuleOpacity.range);
    expect(occurrences(semanticCss, "  --docs-table-column-rule: var(--docs-table-row-rule);")).toBe(2);
  });

  it("wires every table var into the component with its default as the fallback", () => {
    // A registered knob the component never reads is a dead slider (the
    // state-shape rowPad bug). The class strings live in table-classes.ts and
    // are shared by the read block and the editor grid; the three
    // editor-furniture vars are read where the furniture is drawn.
    const furniture = [
      viewerSource("editor/Handles.tsx"),
      viewerSource("editor/SelectionOverlay.tsx"),
      viewerSource("editor-node-view.tsx"),
    ].join("\n");
    const FURNITURE_FALLBACKS: Record<string, string> = {
      "--docs-table-handle-radius": "var(--docs-table-handle-radius,3px)",
      "--docs-table-handle-offset": "var(--docs-table-handle-offset, 12px)",
      "--docs-table-selection-pad": "var(--docs-table-selection-pad, 3px)",
    };
    const CLASS_FALLBACKS: Record<string, string> = {
      "--docs-table-radius": "var(--docs-table-radius,var(--radius-md,6px))",
      "--docs-table-header-text-size":
        "var(--docs-table-header-text-size,calc(var(--docs-table-font-size,14px)-1px))",
      "--docs-table-column-rule-width":
        "var(--docs-table-column-rule-width,var(--docs-table-row-rule-width,1px))",
      "--docs-table-column-rule-opacity":
        "var(--docs-table-column-rule-opacity,var(--docs-table-row-rule-opacity,1))",
    };
    for (const { cssVar, unit, range } of SLIDERS) {
      if (FURNITURE_FALLBACKS[cssVar]) {
        expect(furniture).toContain(FURNITURE_FALLBACKS[cssVar]);
        continue;
      }
      expect(tableClasses).toContain(
        CLASS_FALLBACKS[cssVar] ?? `var(${cssVar},${range[3]}${unit})`,
      );
    }
    for (const reference of [
      "var(--docs-table-border,var(--border))",
      "var(--docs-table-bg,var(--background))",
      "var(--docs-table-header-bg,transparent)",
      "var(--docs-table-header-fg,currentColor)",
      "var(--docs-table-header-rule,var(--docs-table-header-fg,currentColor))",
      "var(--docs-table-row-rule,var(--border))",
      "var(--docs-table-column-rule,var(--docs-table-row-rule,var(--border)))",
      "var(--docs-table-row-hover-bg,color-mix(in_srgb,var(--muted)_20%,transparent))",
      "var(--docs-table-fg,currentColor)",
      "var(--docs-table-title-fg,var(--foreground))",
    ]) {
      expect(tableClasses).toContain(reference);
    }
    // Every color token is covered by the list above.
    for (const { cssVar } of Object.values(TABLE_COLORS)) {
      expect(tableClasses).toContain(`var(${cssVar},`);
    }
    // The literals the vars replaced are gone, so nothing shadows a knob.
    for (const hardcoded of [
      "rounded-md",
      "bg-background",
      "bg-muted/20",
      "text-sm",
      "font-medium",
      "text-foreground",
      "mb-1.5",
      "leading-[1.55]",
    ]) {
      expect(tableClasses).not.toContain(hardcoded);
    }
    expect(viewerSource("editor/EditableCell.tsx")).not.toContain("min-h-[1.55em]");
  });

  it("keeps the unlayered prose rules off table cells so the type tokens win", () => {
    // index.css re-asserts prose size/leading/color on p/td/th from OUTSIDE a
    // cascade layer, which beats Tailwind's `@layer utilities` whatever the
    // specificity. Without this exemption the table's font size, header size,
    // line height and (in edit mode, where a cell hosts a <p>) text colors
    // are dead knobs: cells render at the prose size instead.
    const exempt = ':not(:where([data-docs-block-type="structured-table"] *))';
    expect(indexCss).toContain(
      `.docs-markdown :where(p, li, td, th, dd, dt, blockquote)${exempt} {\n  font-size: var(--style-font-size, 18px);`,
    );
    expect(indexCss).toContain(
      `.docs-markdown :where(p)${exempt} {\n  color: var(--docs-paragraph-fg);`,
    );
    expect(indexCss).toContain(
      `.docs-markdown :where(li, td)${exempt} {\n  color: var(--docs-viewer-text-body);`,
    );
    // No un-exempted copy of those selectors survives alongside.
    expect(indexCss).not.toMatch(/\.docs-markdown :where\((p|li, td|p, li, td, th, dd, dt, blockquote)\) \{/);
    // Both surfaces mark their root with the attribute the exemption keys on.
    expect(viewerSource("StructuredTableDocsBlock.tsx")).toContain(
      'data-docs-block-type="structured-table"',
    );
    expect(viewerSource("editor-node-view.tsx")).toContain(
      'data-docs-block-type="structured-table"',
    );
  });

  it("renders a labelled control for every table token", () => {
    render(<RailHarness />);
    openPane("Structured table");

    for (const { label } of Object.values(TABLE_COLORS)) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input).toHaveProperty("type", "color");
    }
    for (const { label, unit, range } of SLIDERS) {
      const [min, max, step, defaultValue] = range;
      // Anchored: "Text size" must not also match "Header text size".
      const slider = screen.getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement;
      expect(slider).toHaveProperty("type", "range");
      expect(slider).toHaveProperty("min", String(min));
      expect(slider).toHaveProperty("max", String(max));
      expect(slider).toHaveProperty("step", String(step));
      expect(slider).toHaveProperty("value", String(defaultValue));
      expect(slider.closest("label")?.textContent).toBe(`${label}${defaultValue}${unit}`);
    }
  });

  it("stores slider values with their units and applies them onto the table vars", () => {
    render(<RailHarness />);
    openPane("Structured table");

    fireEvent.change(screen.getByLabelText(/^Text size/), { target: { value: "18" } });
    fireEvent.change(screen.getByLabelText(/^Line height/), { target: { value: "1.45" } });
    fireEvent.change(screen.getByLabelText(/^Header weight/), { target: { value: "650" } });
    fireEvent.change(screen.getByLabelText(/^Corner radius/), { target: { value: "0" } });
    expect(JSON.parse(screen.getByTestId("component-settings").textContent ?? "null")).toEqual({
      "structured-table": {
        fontSize: "18px",
        lineHeight: "1.45",
        headerWeight: "650",
        radius: "0px",
      },
    });

    const settings = normalizeSettings({
      components: {
        "structured-table": {
          bg: "#FAFAFA",
          fg: "#111111",
          titleFg: "#222222",
          columnRule: "#333333",
          rowHoverBg: "#eeeeee",
          borderWidth: "2px",
          radius: "12px",
          headerTextSize: "12px",
          headerWeight: "700",
          columnRuleWidth: "0px",
          columnRuleOpacity: "0.4",
          rowMinHeight: "48px",
          fontSize: "18px",
          lineHeight: "1.45",
          bodyWeight: "450",
          titleTextSize: "16px",
          titleWeight: "600",
          titleGap: "10px",
        },
      },
    });
    expect(styleRailVars(settings)).toMatchObject({
      "--docs-table-bg": "#fafafa",
      "--docs-table-fg": "#111111",
      "--docs-table-title-fg": "#222222",
      "--docs-table-column-rule": "#333333",
      "--docs-table-row-hover-bg": "#eeeeee",
      "--docs-table-border-width": "2px",
      "--docs-table-radius": "12px",
      "--docs-table-header-text-size": "12px",
      "--docs-table-header-weight": "700",
      "--docs-table-column-rule-width": "0px",
      "--docs-table-column-rule-opacity": "0.4",
      "--docs-table-row-min-height": "48px",
      "--docs-table-font-size": "18px",
      "--docs-table-line-height": "1.45",
      "--docs-table-body-weight": "450",
      "--docs-table-title-text-size": "16px",
      "--docs-table-title-weight": "600",
      "--docs-table-title-gap": "10px",
    });
  });

  it("drops out-of-range values and clears vars parked on their defaults", () => {
    expect(
      normalizeSettings({
        components: {
          "structured-table": {
            fontSize: "40px",
            lineHeight: "3",
            headerWeight: "1000",
            radius: "-1px",
            rowMinHeight: "12rem",
          },
        },
      }).components,
    ).toEqual({});

    // A slider sitting on its registry default writes nothing, which is what
    // lets the derived semantic.css defaults (header size follows text size,
    // column rules follow row rules, radius follows --radius) show through.
    const atDefault = Object.fromEntries(
      SLIDERS.map(({ key, unit, range }) => [key, `${range[3]}${unit}`]),
    );
    const vars = styleRailVars(
      normalizeSettings({ components: { "structured-table": atDefault } }),
    );
    for (const { cssVar } of SLIDERS) {
      expect(vars[cssVar]).toBeNull();
    }
  });
});

describe("style rail code block tokens", () => {
  it("registers the five sidebar-facing code color tokens", () => {
    const code = THEME_TOKEN_REGISTRY.code;
    expect(code.languageFg).toEqual({ vars: ["--docs-code-lang-fg"], kind: "color" });
    expect(code.annotationAccent).toEqual({
      vars: ["--docs-code-annotation-accent"],
      kind: "color",
    });
    expect(code.gutterFg).toEqual({ vars: ["--docs-code-gutter-fg"], kind: "color" });
    expect(code.gutterBg).toEqual({ vars: ["--docs-code-gutter-bg"], kind: "color" });
    expect(code.zebra).toEqual({ vars: ["--docs-code-zebra"], kind: "color" });
  });

  it("registers the rule and zebra-intensity tokens with structured-table kinds", () => {
    const code = THEME_TOKEN_REGISTRY.code;
    expect(code.rule).toEqual({ vars: ["--docs-code-rule"], kind: "color" });
    expect(code.ruleWidth).toEqual({
      vars: ["--docs-code-rule-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    });
    expect(code.ruleOpacity).toEqual({
      vars: ["--docs-code-rule-opacity"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 0.5,
    });
    expect(code.zebraOpacity).toEqual({
      vars: ["--docs-code-zebra-opacity"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 1,
    });
  });

  it("normalizes and applies rule width/opacity and zebra opacity overrides", () => {
    const settings = normalizeSettings({
      components: {
        code: {
          rule: "#123123",
          ruleWidth: "2px",
          ruleOpacity: "0.35",
          zebraOpacity: "0.7",
          badRuleWidth: "9px",
        },
      },
    });

    expect(settings.components).toEqual({
      code: {
        rule: "#123123",
        ruleWidth: "2px",
        ruleOpacity: "0.35",
        zebraOpacity: "0.7",
      },
    });
    expect(styleRailVars(settings)).toMatchObject({
      "--docs-code-rule": "#123123",
      "--docs-code-rule-width": "2px",
      "--docs-code-rule-opacity": "0.35",
      "--docs-code-zebra-opacity": "0.7",
    });

    // Out-of-range values are dropped, mirroring structured-table behavior.
    expect(
      normalizeSettings({
        components: { code: { ruleWidth: "9px", ruleOpacity: "2" } },
      }).components,
    ).toEqual({});
  });

  it("preserves rule/zebra unit-bearing values through localStorage", () => {
    const settings = normalizeSettings({
      components: {
        code: {
          ruleWidth: "1.5px",
          zebraOpacity: "0.6",
        },
      },
    });

    saveStyleRailSettings(settings);
    expect(loadStyleRailSettings().components.code).toEqual({
      ruleWidth: "1.5px",
      zebraOpacity: "0.6",
    });
  });

  it("normalizes and applies code color overrides onto their CSS vars", () => {
    const settings = normalizeSettings({
      components: {
        code: {
          languageFg: "#112233",
          annotationAccent: "#0EA5E9",
          gutterFg: "#445566",
          gutterBg: "#778899",
          zebra: "#AABBCC",
          unknown: "#000000",
        },
      },
    });

    expect(settings.components).toEqual({
      code: {
        languageFg: "#112233",
        annotationAccent: "#0ea5e9",
        gutterFg: "#445566",
        gutterBg: "#778899",
        zebra: "#aabbcc",
      },
    });
    expect(styleRailVars(settings)).toMatchObject({
      "--docs-code-lang-fg": "#112233",
      "--docs-code-annotation-accent": "#0ea5e9",
      "--docs-code-gutter-fg": "#445566",
      "--docs-code-gutter-bg": "#778899",
      "--docs-code-zebra": "#aabbcc",
    });
  });

  it("preserves code color overrides through localStorage", () => {
    const settings = normalizeSettings({
      components: {
        code: {
          languageFg: "#112233",
          zebra: "#aabbcc",
        },
      },
    });

    saveStyleRailSettings(settings);
    expect(loadStyleRailSettings().components.code).toEqual({
      languageFg: "#112233",
      zebra: "#aabbcc",
    });
  });

  it("renders the code component color knobs with their sidebar labels", () => {
    render(<RailHarness />);
    openPane("Code");

    for (const label of [
      // languageFg only colors the edit picker's hover state, so its label
      // says so; the label's resting color is "Header text" (headerFg).
      "Language picker hover",
      "Header text",
      "Annotation accent",
      "Line numbers",
      "Gutter background",
      "Zebra stripe",
      "Rules",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText("Language badge")).toBeNull();
  });

  it("registers the frame, typography, padding, header, gutter and notes metric tokens", () => {
    const code = THEME_TOKEN_REGISTRY.code;
    const length = (cssVar: string, min: number, max: number, step: number, defaultValue: number) => ({
      vars: [cssVar],
      kind: "length" as const,
      min,
      max,
      step,
      unit: "px" as const,
      defaultValue,
    });
    expect(code.borderWidth).toEqual(length("--docs-code-border-width", 0, 4, 0.5, 1));
    expect(code.radius).toEqual(length("--docs-code-radius", 0, 16, 1, 6));
    expect(code.textSize).toEqual(length("--docs-code-text-size", 10, 18, 0.5, 12));
    expect(code.lineHeight).toEqual(length("--docs-code-line-height", 14, 32, 1, 20));
    expect(code.padX).toEqual(length("--docs-code-pad-x", 0, 32, 1, 12));
    expect(code.padTop).toEqual(length("--docs-code-pad-top", 0, 24, 1, 0));
    expect(code.padBottom).toEqual(length("--docs-code-pad-bottom", 0, 24, 1, 8));
    expect(code.headerHeight).toEqual(length("--docs-code-header-height", 20, 48, 1, 28));
    expect(code.headerFg).toEqual({ vars: ["--docs-code-header-fg"], kind: "color" });
    expect(code.headerTextSize).toEqual(length("--docs-code-header-text-size", 8, 16, 0.5, 10));
    expect(code.headerWeight).toEqual({
      vars: ["--docs-code-header-weight"],
      kind: "number",
      min: 300,
      max: 800,
      step: 100,
      defaultValue: 500,
    });
    expect(code.gutterTextSize).toEqual(length("--docs-code-gutter-text-size", 8, 16, 0.5, 12));
    expect(code.gutterWidth).toEqual(length("--docs-code-gutter-width", 24, 96, 1, 48));
    expect(code.gutterPadX).toEqual(length("--docs-code-gutter-pad-x", 0, 24, 1, 8));
    expect(code.noteTextSize).toEqual(length("--docs-code-note-text-size", 10, 18, 0.5, 12));
    expect(code.notesWidth).toEqual(length("--docs-code-notes-width", 200, 480, 10, 320));
  });

  it("renders every code metric knob with its label, stock value and range", () => {
    render(<RailHarness />);
    openPane("Code");

    const expected: Array<[RegExp, string, string, string]> = [
      // [label, min, max, stock value]
      [/^Border width/, "0", "4", "1"],
      [/^Corner radius/, "0", "16", "6"],
      [/^Text size/, "10", "18", "12"],
      [/^Line height/, "14", "32", "20"],
      [/^Padding X/, "0", "32", "12"],
      [/^Top padding/, "0", "24", "0"],
      [/^Bottom padding/, "0", "24", "8"],
      [/^Header height/, "20", "48", "28"],
      [/^Header text size/, "8", "16", "10"],
      [/^Header weight/, "300", "800", "500"],
      [/^Line number size/, "8", "16", "12"],
      [/^Gutter width/, "24", "96", "48"],
      [/^Gutter padding/, "0", "24", "8"],
      [/^Note text size/, "10", "18", "12"],
      [/^Notes column width/, "200", "480", "320"],
    ];
    for (const [label, min, max, value] of expected) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input).toHaveProperty("min", min);
      expect(input).toHaveProperty("max", max);
      expect(input).toHaveProperty("value", value);
    }

    fireEvent.change(screen.getByLabelText(/^Text size/), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText(/^Line height/), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText(/^Header weight/), { target: { value: "700" } });
    expect(JSON.parse(screen.getByTestId("component-settings").textContent ?? "null")).toEqual({
      code: { textSize: "14px", lineHeight: "24px", headerWeight: "700" },
    });
  });

  it("applies code metric overrides onto their CSS vars and drops stock / out-of-range values", () => {
    const settings = normalizeSettings({
      components: {
        code: {
          textSize: "14px",
          lineHeight: "24px",
          gutterWidth: "56px",
          headerFg: "#112233",
          headerWeight: "700",
          radius: "0px",
          notesWidth: "400px",
          padTop: "99px",
        },
      },
    });
    expect(settings.components.code).toEqual({
      textSize: "14px",
      lineHeight: "24px",
      gutterWidth: "56px",
      headerFg: "#112233",
      headerWeight: "700",
      radius: "0px",
      notesWidth: "400px",
    });
    expect(styleRailVars(settings)).toMatchObject({
      "--docs-code-text-size": "14px",
      "--docs-code-line-height": "24px",
      "--docs-code-gutter-width": "56px",
      "--docs-code-header-fg": "#112233",
      "--docs-code-header-weight": "700",
      "--docs-code-radius": "0px",
      "--docs-code-notes-width": "400px",
    });
    // A knob parked at stock writes nothing, so semantic.css answers.
    expect(
      styleRailVars(normalizeSettings({ components: { code: { textSize: "12px", radius: "6px" } } })),
    ).toMatchObject({ "--docs-code-text-size": null, "--docs-code-radius": null });
  });

  it("renders metadata-driven code rule/zebra sliders and stores their units", () => {
    render(<RailHarness />);
    openPane("Code");

    const width = screen.getByLabelText(/Rule width/) as HTMLInputElement;
    const opacity = screen.getByLabelText(/Rule opacity/) as HTMLInputElement;
    const zebraOpacity = screen.getByLabelText(/Zebra opacity/) as HTMLInputElement;
    expect(width).toHaveProperty("min", "0");
    expect(width).toHaveProperty("max", "4");
    expect(width).toHaveProperty("step", "0.5");
    expect(width).toHaveProperty("value", "1");
    expect(opacity).toHaveProperty("min", "0");
    expect(opacity).toHaveProperty("max", "1");
    expect(opacity).toHaveProperty("step", "0.05");
    expect(opacity).toHaveProperty("value", "0.5");
    expect(zebraOpacity).toHaveProperty("min", "0");
    expect(zebraOpacity).toHaveProperty("max", "1");
    expect(zebraOpacity).toHaveProperty("step", "0.05");
    expect(zebraOpacity).toHaveProperty("value", "1");

    fireEvent.change(width, { target: { value: "2" } });
    fireEvent.change(zebraOpacity, { target: { value: "0.6" } });
    expect(JSON.parse(screen.getByTestId("component-settings").textContent ?? "null")).toEqual({
      code: {
        ruleWidth: "2px",
        zebraOpacity: "0.6",
      },
    });
  });
});

describe("style rail file-tree tokens", () => {
  const FILE_TREE_LENGTHS = {
    borderWidth: { cssVar: "--docs-file-tree-border-width", min: 0, max: 4, step: 0.5, defaultValue: 1 },
    radius: { cssVar: "--docs-file-tree-radius", min: 0, max: 16, step: 1, defaultValue: 6 },
    padY: { cssVar: "--docs-file-tree-pad-y", min: 0, max: 24, step: 1, defaultValue: 8 },
    padX: { cssVar: "--docs-file-tree-pad-x", min: 0, max: 32, step: 1, defaultValue: 12 },
    textSize: { cssVar: "--docs-file-tree-text-size", min: 10, max: 18, step: 0.5, defaultValue: 12 },
    lineHeight: { cssVar: "--docs-file-tree-line-height", min: 14, max: 40, step: 1, defaultValue: 24 },
    noteTextSize: {
      cssVar: "--docs-file-tree-note-text-size",
      min: 10,
      max: 18,
      step: 0.5,
      defaultValue: 12,
    },
  } as const;
  const FILE_TREE_NUMBERS = {
    folderWeight: { cssVar: "--docs-file-tree-folder-weight", min: 300, max: 900, step: 50, defaultValue: 500 },
    fileWeight: { cssVar: "--docs-file-tree-file-weight", min: 300, max: 900, step: 50, defaultValue: 400 },
    changeTint: { cssVar: "--docs-file-tree-change-tint", min: 0, max: 100, step: 1, defaultValue: 10 },
  } as const;
  const FILE_TREE_COLORS = {
    bg: ["--docs-file-tree-bg"],
    border: ["--docs-file-tree-border"],
    folderFg: ["--docs-file-tree-folder-fg"],
    fileFg: ["--docs-file-tree-file-fg"],
    note: ["--docs-file-tree-note-fg"],
    guide: ["--docs-file-tree-guide-fg"],
    mutedFg: ["--docs-file-tree-muted-fg"],
    added: [
      "--docs-file-tree-added-fg",
      "--docs-file-tree-added-marker",
      "--docs-file-tree-added-tint",
    ],
    removed: [
      "--docs-file-tree-removed-fg",
      "--docs-file-tree-removed-marker",
      "--docs-file-tree-removed-tint",
    ],
    modified: [
      "--docs-file-tree-modified-fg",
      "--docs-file-tree-modified-marker",
      "--docs-file-tree-modified-tint",
    ],
    renamed: [
      "--docs-file-tree-renamed-fg",
      "--docs-file-tree-renamed-marker",
      "--docs-file-tree-renamed-tint",
    ],
  } as const;
  const semanticCss = readFileSync(new URL("../theme/semantic.css", import.meta.url), "utf8");
  const componentSource = readFileSync(
    new URL(
      "../../../../docs-viewer/src/components/file-tree/FileTreeDocsBlock.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

  it("registers every file-tree var under the file-tree entry", () => {
    const entry = THEME_TOKEN_REGISTRY["file-tree"];
    for (const [key, vars] of Object.entries(FILE_TREE_COLORS)) {
      expect(entry[key]).toEqual({ vars: [...vars], kind: "color" });
    }
    for (const [key, { cssVar, ...range }] of Object.entries(FILE_TREE_LENGTHS)) {
      expect(entry[key]).toEqual({ vars: [cssVar], kind: "length", unit: "px", ...range });
    }
    for (const [key, { cssVar, ...range }] of Object.entries(FILE_TREE_NUMBERS)) {
      expect(entry[key]).toEqual({ vars: [cssVar], kind: "number", ...range });
    }
    // Nothing registered beyond the pinned set, so a new knob has to land here.
    expect(Object.keys(entry).sort()).toEqual(
      [
        ...Object.keys(FILE_TREE_COLORS),
        ...Object.keys(FILE_TREE_LENGTHS),
        ...Object.keys(FILE_TREE_NUMBERS),
      ].sort(),
    );
  });

  it("declares every file-tree var in both semantic.css blocks at the registry default", () => {
    for (const vars of Object.values(FILE_TREE_COLORS)) {
      for (const cssVar of vars) {
        expect(occurrences(semanticCss, `  ${cssVar}: `)).toBe(2);
      }
    }
    for (const [key, { cssVar, defaultValue }] of Object.entries(FILE_TREE_LENGTHS)) {
      // The corner radius follows the global --radius (8px stock, so 6px).
      const declaration = key === "radius"
        ? `  ${cssVar}: max(0px, calc(var(--radius) - 2px));`
        : `  ${cssVar}: ${defaultValue}px;`;
      expect(occurrences(semanticCss, declaration)).toBe(2);
    }
    for (const { cssVar, defaultValue } of Object.values(FILE_TREE_NUMBERS)) {
      expect(occurrences(semanticCss, `  ${cssVar}: ${defaultValue};`)).toBe(2);
    }
    expect(occurrences(semanticCss, "  --radius: 0.5rem;")).toBe(2);
  });

  it("wires every file-tree var into the component with its default as the fallback", () => {
    // A registered knob the component never reads is a dead slider (the
    // state-shape rowPad bug): every var must appear as `var(<name>,<fallback>)`.
    for (const vars of Object.values(FILE_TREE_COLORS)) {
      for (const cssVar of vars) {
        expect(componentSource).toContain(`var(${cssVar},`);
      }
    }
    for (const [key, { cssVar, defaultValue }] of Object.entries(FILE_TREE_LENGTHS)) {
      const fallback = key === "radius"
        ? "max(0px,calc(var(--radius,8px)-2px))"
        : `${defaultValue}px`;
      expect(componentSource).toContain(`var(${cssVar},${fallback})`);
    }
    for (const { cssVar, defaultValue } of Object.values(FILE_TREE_NUMBERS)) {
      expect(componentSource).toContain(`var(${cssVar},${defaultValue})`);
    }
    // The literals the vars replaced are gone, so nothing shadows a knob.
    for (const hardcoded of [
      "rounded-md",
      "bg-background",
      "py-2",
      "px-3",
      "text-xs",
      "leading-6",
      "font-medium",
      "text-foreground",
      "text-muted-foreground",
      "bg-emerald-500/10",
      "bg-rose-500/10",
      "bg-amber-500/10",
      "bg-sky-500/10",
    ]) {
      expect(componentSource).not.toContain(hardcoded);
    }
  });

  it("normalizes and applies file-tree overrides onto their CSS vars", () => {
    const settings = normalizeSettings({
      components: {
        "file-tree": {
          bg: "#AABBCC",
          added: "#112233",
          guide: "#445566",
          changeTint: "25",
          padY: "12px",
          folderWeight: 700,
          lineHeight: "24px",
          textSize: "99px",
          rowPad: "4px",
        },
      },
    });

    expect(settings.components).toEqual({
      "file-tree": {
        bg: "#aabbcc",
        added: "#112233",
        guide: "#445566",
        changeTint: "25",
        padY: "12px",
        folderWeight: "700",
        lineHeight: "24px",
      },
    });
    const vars = styleRailVars(settings);
    expect(vars).toMatchObject({
      "--docs-file-tree-bg": "#aabbcc",
      // One diff-state knob drives the name, the gutter marker and the row tint.
      "--docs-file-tree-added-fg": "#112233",
      "--docs-file-tree-added-marker": "#112233",
      "--docs-file-tree-added-tint": "#112233",
      "--docs-file-tree-guide-fg": "#445566",
      "--docs-file-tree-change-tint": "25",
      "--docs-file-tree-pad-y": "12px",
      "--docs-file-tree-folder-weight": "700",
    });
    // A knob parked at its default emits nothing; the stylesheet answers.
    expect(vars["--docs-file-tree-line-height"]).toBeNull();
    expect(vars["--docs-file-tree-radius"]).toBeNull();
    expect(vars["--docs-file-tree-removed-fg"]).toBeNull();
  });

  it("renders the File tree knobs with their sidebar labels", () => {
    render(<RailHarness />);
    openPane("File tree");

    for (const label of [
      "Background",
      "Border",
      "Border width",
      "Corner radius",
      "Padding Y",
      "Padding X",
      "Text size",
      "Line height",
      "Folder names",
      "Folder weight",
      "File names",
      "File weight",
      "Note",
      "Note text size",
      "Tree lines",
      "Muted text",
      "Added",
      "Removed",
      "Modified",
      "Renamed",
      "Change tint strength",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    const sliders = {
      ...FILE_TREE_LENGTHS,
      ...FILE_TREE_NUMBERS,
    } as Record<string, { min: number; max: number; step: number; defaultValue: number }>;
    for (const [key, label] of [
      ["borderWidth", /^Border width/],
      ["radius", /^Corner radius/],
      ["padY", /^Padding Y/],
      ["padX", /^Padding X/],
      ["textSize", /^Text size/],
      ["lineHeight", /^Line height/],
      ["noteTextSize", /^Note text size/],
      ["folderWeight", /^Folder weight/],
      ["fileWeight", /^File weight/],
      ["changeTint", /^Change tint strength/],
    ] as const) {
      const slider = screen.getByLabelText(label) as HTMLInputElement;
      expect(slider).toHaveProperty("min", String(sliders[key].min));
      expect(slider).toHaveProperty("max", String(sliders[key].max));
      expect(slider).toHaveProperty("step", String(sliders[key].step));
      expect(slider).toHaveProperty("value", String(sliders[key].defaultValue));
    }

    fireEvent.change(screen.getByLabelText(/^Padding Y/), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText(/^Folder weight/), { target: { value: "650" } });
    expect(JSON.parse(screen.getByTestId("component-settings").textContent ?? "null")).toEqual({
      "file-tree": { padY: "14px", folderWeight: "650" },
    });
  });
});

describe("style rail shared linking tokens", () => {
  it("registers the linked-panels tokens once, under the shared linking entry", () => {
    const linking = THEME_TOKEN_REGISTRY.linking;
    expect(linking.zebra).toEqual({ vars: ["--docs-zebra"], kind: "color" });
    expect(linking.highlight).toEqual({ vars: ["--docs-link-bg"], kind: "color" });
    expect(linking.pin).toEqual({ vars: ["--docs-link-pin"], kind: "color" });
  });

  it("normalizes and applies linking color overrides onto their CSS vars", () => {
    const settings = normalizeSettings({
      components: {
        linking: {
          zebra: "#AABBCC",
          highlight: "#EEE6D2",
          pin: "#B48F2E",
          unknown: "#000000",
        },
      },
    });

    expect(settings.components).toEqual({
      linking: {
        zebra: "#aabbcc",
        highlight: "#eee6d2",
        pin: "#b48f2e",
      },
    });
    expect(styleRailVars(settings)).toMatchObject({
      "--docs-zebra": "#aabbcc",
      "--docs-link-bg": "#eee6d2",
      "--docs-link-pin": "#b48f2e",
    });
  });

  it("renders the Linked panels knobs with their sidebar labels", () => {
    render(<RailHarness />);
    openPane("Linked panels");

    for (const label of ["Zebra stripe", "Link highlight", "Pin & rail"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("registers the wash strength, rail / ring widths and CodeLines panel metrics", () => {
    const linking = THEME_TOKEN_REGISTRY.linking;
    const length = (cssVar: string, min: number, max: number, step: number, defaultValue: number) => ({
      vars: [cssVar],
      kind: "length" as const,
      min,
      max,
      step,
      unit: "px" as const,
      defaultValue,
    });
    expect(linking.washStrength).toEqual({
      vars: ["--docs-link-wash"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 14,
    });
    expect(linking.railWidth).toEqual(length("--docs-link-rail-width", 0, 8, 0.5, 3));
    expect(linking.ringWidth).toEqual(length("--docs-link-ring-width", 0, 4, 0.5, 1.5));
    expect(linking.textSize).toEqual(length("--docs-link-text-size", 10, 18, 0.5, 12));
    expect(linking.lineHeight).toEqual(length("--docs-link-line-height", 14, 32, 1, 20));
    expect(linking.gutterTextSize).toEqual(length("--docs-link-gutter-text-size", 8, 16, 0.5, 11));
    expect(linking.gutterWidth).toEqual(length("--docs-link-gutter-width", 24, 96, 1, 44));
  });

  it("renders every linking metric knob with its label, stock value and range, and stores units", () => {
    render(<RailHarness />);
    openPane("Linked panels");

    const expected: Array<[RegExp, string, string, string]> = [
      [/^Highlight strength/, "0", "100", "14"],
      [/^Rail width/, "0", "8", "3"],
      [/^Pin ring width/, "0", "4", "1.5"],
      [/^Text size/, "10", "18", "12"],
      [/^Line height/, "14", "32", "20"],
      [/^Line number size/, "8", "16", "11"],
      [/^Gutter width/, "24", "96", "44"],
    ];
    for (const [label, min, max, value] of expected) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input).toHaveProperty("min", min);
      expect(input).toHaveProperty("max", max);
      expect(input).toHaveProperty("value", value);
    }

    fireEvent.change(screen.getByLabelText(/^Highlight strength/), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText(/^Rail width/), { target: { value: "5" } });
    expect(JSON.parse(screen.getByTestId("component-settings").textContent ?? "null")).toEqual({
      linking: { washStrength: "30", railWidth: "5px" },
    });
    expect(
      styleRailVars(
        normalizeSettings({
          components: { linking: { washStrength: "30", railWidth: "5px", ringWidth: "9px" } },
        }),
      ),
    ).toMatchObject({
      "--docs-link-wash": "30",
      "--docs-link-rail-width": "5px",
      // Out of range (max 4) -> dropped, so the stylesheet default stands.
      "--docs-link-ring-width": null,
    });
  });
});

describe("style rail inline-code tokens", () => {
  it("registers color, border, radius and the em-multiplier size / padding tokens", () => {
    const inline = THEME_TOKEN_REGISTRY["inline-code"];
    expect(inline.fg).toEqual({ vars: ["--docs-inline-code-fg"], kind: "color" });
    expect(inline.bg).toEqual({ vars: ["--docs-inline-code-bg"], kind: "color" });
    expect(inline.border).toEqual({ vars: ["--docs-inline-code-border"], kind: "color" });
    expect(inline.borderWidth).toEqual({
      vars: ["--docs-inline-code-border-width"],
      kind: "length",
      min: 0,
      max: 3,
      step: 0.5,
      unit: "px",
      defaultValue: 0,
    });
    expect(inline.radius).toEqual({
      vars: ["--docs-inline-code-radius"],
      kind: "length",
      min: 0,
      max: 12,
      step: 1,
      unit: "px",
      defaultValue: 4,
    });
    // Unitless em multipliers: `number` tokens, no unit.
    expect(inline.textSize).toEqual({
      vars: ["--docs-inline-code-text-size"],
      kind: "number",
      min: 0.6,
      max: 1.2,
      step: 0.05,
      defaultValue: 0.85,
    });
    expect(inline.padX).toEqual({
      vars: ["--docs-inline-code-pad-x"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 0.35,
    });
    expect(inline.padY).toEqual({
      vars: ["--docs-inline-code-pad-y"],
      kind: "number",
      min: 0,
      max: 0.5,
      step: 0.05,
      defaultValue: 0.1,
    });
    expect(inline.weight).toEqual({
      vars: ["--docs-inline-code-weight"],
      kind: "number",
      min: 300,
      max: 800,
      step: 100,
      defaultValue: 400,
    });
  });

  it("renders the Inline code knobs with labels and stock values, and stores unitless multipliers", () => {
    render(<RailHarness />);
    openPane("Inline code");

    for (const label of ["Text", "Background", "Border"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    const expected: Array<[RegExp, string, string, string]> = [
      [/^Border width/, "0", "3", "0"],
      [/^Corner radius/, "0", "12", "4"],
      [/^Text size/, "0.6", "1.2", "0.85"],
      [/^Padding X/, "0", "1", "0.35"],
      [/^Padding Y/, "0", "0.5", "0.1"],
      [/^Weight/, "300", "800", "400"],
    ];
    for (const [label, min, max, value] of expected) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input).toHaveProperty("min", min);
      expect(input).toHaveProperty("max", max);
      expect(input).toHaveProperty("value", value);
    }

    fireEvent.change(screen.getByLabelText(/^Text size/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/^Border width/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/^Weight/), { target: { value: "600" } });
    expect(JSON.parse(screen.getByTestId("component-settings").textContent ?? "null")).toEqual({
      "inline-code": { textSize: "1", borderWidth: "1px", weight: "600" },
    });
    expect(
      styleRailVars(
        normalizeSettings({
          components: {
            "inline-code": { textSize: "1", padX: "0.5", borderWidth: "1px", weight: "600" },
          },
        }),
      ),
    ).toMatchObject({
      "--docs-inline-code-text-size": "1",
      "--docs-inline-code-pad-x": "0.5",
      "--docs-inline-code-border-width": "1px",
      "--docs-inline-code-weight": "600",
    });
  });
});

/**
 * The dead-knob guard for the code family (code, inline-code, linking).
 *
 * A registry entry only proves the rail RENDERS a control. These pin the
 * other two links of the chain for every token in the three sections: a
 * consumer actually reads the var, and the three stated defaults — registry
 * `defaultValue`, the semantic.css declaration (both theme blocks) and the
 * consumer's var() fallback — are the same number. If any pair drifts, the
 * slider either does nothing or starts somewhere the block does not render.
 */
describe("style rail code-family tokens are wired to their consumers", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const semanticCss = read("../theme/semantic.css");
  const viewer = "../../../../docs-viewer/src/";
  const consumerSource = [
    read(`${viewer}components/code/classes.ts`),
    read(`${viewer}components/code/editor-node-view.tsx`),
    read(`${viewer}components/linked-panels/classes.ts`),
    read(`${viewer}render/block-classes.ts`),
    read(`${viewer}styles/code.css`),
    read("../index.css"),
  ].join("\n");
  const FILES = ["code", "inline-code", "linking"] as const;
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /**
   * Stylesheet defaults that are NOT the registry number, each for a stated
   * reason. `null` = deliberately undeclared (the consumer fallback answers).
   */
  const SEMANTIC_EXCEPTIONS: Record<string, [light: string, dark: string] | null> = {
    // Radii follow the global --radius (8px stock -> 6px / 4px).
    "--docs-code-radius": [
      "max(0px, calc(var(--radius) - 2px))",
      "max(0px, calc(var(--radius) - 2px))",
    ],
    "--docs-inline-code-radius": [
      "max(0px, calc(var(--radius) - 4px))",
      "max(0px, calc(var(--radius) - 4px))",
    ],
    // Dark runs the wash hotter; the registry default is the light value.
    "--docs-link-wash": ["14", "18"],
    // A custom property cannot hold `inherit`; the chip inherits by default.
    "--docs-inline-code-weight": null,
  };
  /** Consumer fallbacks that are not `<default><unit>`, with the literal used. */
  const FALLBACK_EXCEPTIONS: Record<string, string | null> = {
    "--docs-inline-code-weight": "inherit",
    // Read only by semantic.css itself (it builds --docs-link-bg from it).
    "--docs-link-wash": null,
  };

  it("every token's CSS var is read by a consumer", () => {
    for (const file of FILES) {
      for (const [key, token] of Object.entries(THEME_TOKEN_REGISTRY[file])) {
        for (const cssVar of token.vars) {
          const source = cssVar === "--docs-link-wash" ? semanticCss : consumerSource;
          expect(`${file}.${key}: ${source.includes(`var(${cssVar}`)}`).toBe(`${file}.${key}: true`);
        }
      }
    }
  });

  it("every metric token's semantic.css default equals the registry default, in both theme blocks", () => {
    for (const file of FILES) {
      for (const [key, token] of Object.entries(THEME_TOKEN_REGISTRY[file])) {
        if (token.kind === "color") continue;
        const [cssVar] = token.vars;
        const declared = [...semanticCss.matchAll(new RegExp(`^\\s*${escape(cssVar)}:\\s*(.+);$`, "gm"))]
          .map((match) => match[1]);
        const stock = `${token.defaultValue}${token.unit ?? ""}`;
        const expected = cssVar in SEMANTIC_EXCEPTIONS
          ? (SEMANTIC_EXCEPTIONS[cssVar] ?? [])
          : [stock, stock];
        expect(`${file}.${key}: ${declared.join(" | ")}`).toBe(`${file}.${key}: ${expected.join(" | ")}`);
      }
    }
  });

  it("every metric token's consumer fallback equals the registry default", () => {
    for (const file of FILES) {
      for (const [key, token] of Object.entries(THEME_TOKEN_REGISTRY[file])) {
        if (token.kind === "color") continue;
        const [cssVar] = token.vars;
        const expected = cssVar in FALLBACK_EXCEPTIONS
          ? FALLBACK_EXCEPTIONS[cssVar]
          : `${token.defaultValue}${token.unit ?? ""}`;
        if (expected === null) continue;
        // Every var(--x, <fallback>) occurrence in the viewer must carry the
        // stock literal — a single stray fallback is a second default.
        const fallbacks = [
          ...consumerSource.matchAll(new RegExp(`var\\(${escape(cssVar)},\\s*([^()]+?)\\)`, "g")),
        ].map((match) => match[1]);
        expect(`${file}.${key}: ${fallbacks.length > 0}`).toBe(`${file}.${key}: true`);
        expect(`${file}.${key}: ${[...new Set(fallbacks)].join(" | ")}`).toBe(`${file}.${key}: ${expected}`);
      }
    }
  });

  it("the wash strength feeds the lit highlight in both theme blocks", () => {
    expect(
      semanticCss.match(
        /--docs-link-bg: color-mix\(in srgb, var\(--docs-link-pin\) calc\(var\(--docs-link-wash\) \* 1%\), transparent\);/g,
      )?.length,
    ).toBe(2);
  });

  it("the code block's zebra defaults to the shared linking zebra in both theme blocks", () => {
    expect(semanticCss.match(/--docs-code-zebra: var\(--docs-zebra\);/g)?.length).toBe(2);
  });

  it("the workbench's unlayered inline-code rule reads the same tokens as the utilities", () => {
    const indexCss = read("../index.css");
    const rule = indexCss.slice(indexCss.indexOf(".docs-markdown :where(code:not(pre code)) {"));
    const body = rule.slice(0, rule.indexOf("}"));
    expect(body).toContain("background: var(--docs-inline-code-bg);");
    expect(body).toContain("color: var(--docs-inline-code-fg);");
    expect(body).toContain("border-radius: var(--docs-inline-code-radius);");
    expect(body).toContain(
      "padding: calc(var(--docs-inline-code-pad-y) * 1em) calc(var(--docs-inline-code-pad-x) * 1em);",
    );
    // No literal survives that would pin a knob in place.
    expect(body).not.toContain("0.35em");
    expect(body).not.toContain("var(--radius)");
  });
});

describe("style rail interaction-surface tokens", () => {
  const entry = THEME_TOKEN_REGISTRY["interaction-surface"];

  // key -> [css var, min, max, step, default]. Lengths are px; weights are
  // unitless numbers.
  const LENGTHS: Record<string, [string, number, number, number, number]> = {
    radius: ["--docs-interaction-radius", 0, 24, 1, 4],
    borderWidth: ["--docs-interaction-border-width", 0, 4, 0.5, 1],
    ruleWidth: ["--docs-interaction-rule-width", 0, 4, 0.5, 1],
    padX: ["--docs-interaction-pad-x", 4, 32, 1, 16],
    opGap: ["--docs-interaction-op-gap", 0, 48, 1, 24],
    titleTextSize: ["--docs-interaction-title-text-size", 10, 22, 0.5, 14],
    titleGap: ["--docs-interaction-title-gap", 0, 32, 1, 12],
    headerPadY: ["--docs-interaction-header-pad-y", 4, 32, 1, 16],
    headerTextSize: ["--docs-interaction-header-text-size", 10, 22, 0.5, 14],
    badgeTextSize: ["--docs-interaction-badge-text-size", 8, 14, 0.5, 10],
    descTextSize: ["--docs-interaction-desc-text-size", 10, 18, 0.5, 12],
    descLineHeight: ["--docs-interaction-desc-line-height", 12, 32, 1, 20],
    columnHeadTextSize: ["--docs-interaction-column-head-text-size", 8, 14, 0.5, 10],
    columnHeadPadY: ["--docs-interaction-column-head-pad-y", 0, 20, 1, 8],
    columnHeadRuleWidth: ["--docs-interaction-column-head-rule-width", 0, 4, 0.5, 2],
    rowPad: ["--docs-interaction-row-pad", 0, 24, 1, 12],
    indent: ["--docs-interaction-indent", 8, 48, 1, 22],
    noteNameTextSize: ["--docs-interaction-note-name-text-size", 10, 18, 0.5, 13],
    noteTypeTextSize: ["--docs-interaction-note-type-text-size", 10, 18, 0.5, 12],
  };
  const WEIGHTS: Record<string, [string, number]> = {
    titleWeight: ["--docs-interaction-title-weight", 700],
    headerWeight: ["--docs-interaction-header-weight", 700],
    noteNameWeight: ["--docs-interaction-note-name-weight", 600],
  };
  const COLORS: Record<string, string> = {
    actionHeaderBg: "--docs-operation-action-header-bg",
    actionHeaderInk: "--docs-operation-action-header-ink",
    queryHeaderBg: "--docs-operation-query-header-bg",
    queryHeaderInk: "--docs-operation-query-header-ink",
    eventHeaderBg: "--docs-operation-event-header-bg",
    eventHeaderInk: "--docs-operation-event-header-ink",
    border: "--docs-interaction-border",
    bg: "--docs-interaction-bg",
    rule: "--docs-interaction-rule",
    titleFg: "--docs-interaction-title-fg",
    headerFg: "--docs-interaction-header-fg",
    columnHeadBg: "--docs-interaction-column-head-bg",
    columnHeadFg: "--docs-interaction-column-head-fg",
    sigName: "--docs-interaction-sig-name",
    sigType: "--docs-interaction-sig-type",
    sigPunct: "--docs-interaction-sig-punct",
    noteName: "--docs-interaction-note-name",
    noteType: "--docs-interaction-note-type",
    noteTypeBg: "--docs-interaction-note-type-bg",
    noteFg: "--docs-interaction-note-fg",
    childRule: "--docs-interaction-child-rule",
  };

  const componentSource = readFileSync(
    new URL(
      "../../../../docs-viewer/src/components/interaction-surface/InteractionSurfaceDocsBlock.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const semanticCss = readFileSync(new URL("../theme/semantic.css", import.meta.url), "utf8");
  const themeBlock = (marker: string) => {
    const start = semanticCss.indexOf(marker);
    if (start < 0) throw new Error(`missing theme block: ${marker}`);
    return semanticCss.slice(start, semanticCss.indexOf("\n}", start));
  };
  const lightBlock = themeBlock(':root, [data-theme="light"] {');
  const darkBlock = themeBlock('[data-theme="dark"], .dark {');

  it("registers every interaction-surface knob with its CSS var, range, and default", () => {
    for (const [key, cssVar] of Object.entries(COLORS)) {
      expect(entry[key]).toEqual({ vars: [cssVar], kind: "color" });
    }
    for (const [key, [cssVar, min, max, step, defaultValue]] of Object.entries(LENGTHS)) {
      expect(entry[key]).toEqual({
        vars: [cssVar],
        kind: "length",
        min,
        max,
        step,
        unit: "px",
        defaultValue,
      });
    }
    for (const [key, [cssVar, defaultValue]] of Object.entries(WEIGHTS)) {
      expect(entry[key]).toEqual({
        vars: [cssVar],
        kind: "number",
        min: 300,
        max: 900,
        step: 50,
        defaultValue,
      });
    }
    // The tables above are the whole vocabulary: a knob added to the registry
    // without a row here would skip the wiring checks below.
    expect(Object.keys(entry).sort()).toEqual(
      [...Object.keys(COLORS), ...Object.keys(LENGTHS), ...Object.keys(WEIGHTS)].sort(),
    );
    // The generic header background had no target once headers went per kind.
    expect(entry.headerBg).toBeUndefined();
    // Signature text is a shared CodeLines panel: sized by the "linking" folder.
    expect(entry.sigTextSize).toBeUndefined();
    expect(componentSource).not.toContain("--docs-interaction-sig-text-size");
  });

  it("wires every knob into the component with a fallback equal to its default", () => {
    // An unset knob emits nothing, so the component's literal fallback is what
    // renders. A registered var the component never reads is a dead slider.
    for (const [key, token] of Object.entries(entry)) {
      const cssVar = token.vars[0]!;
      if (token.kind === "color") {
        expect([key, componentSource.includes(`var(${cssVar},`)]).toEqual([key, true]);
        continue;
      }
      const fallback = `var(${cssVar},${token.defaultValue}${token.unit ?? ""})`;
      expect([key, componentSource.includes(fallback)]).toEqual([key, true]);
    }
    // The corner radius is the one light/dark split: 4px light, 12px dark.
    expect(componentSource).toContain("var(--docs-interaction-radius,12px)");
  });

  it("never shadows a rail var inside the component", () => {
    // The rail writes its overrides on <html>. A block-level re-declaration of
    // the same custom property, or an !important pin, would silently win.
    expect(componentSource).not.toMatch(/--docs-(interaction|operation)-[a-z-]+\s*:/);
    expect(componentSource).not.toContain("data-variator-tokens");
    // Values the inline <style> owns must not also sit on the element as dead
    // utilities (the inline sheet is unlayered and beats them).
    expect(componentSource).not.toContain("gap-6");
    expect(componentSource).not.toContain("px-3 py-3");
  });

  it("declares every default in both semantic.css theme blocks", () => {
    for (const [key, token] of Object.entries(entry)) {
      const cssVar = token.vars[0]!;
      if (token.kind === "color") {
        expect([key, lightBlock.includes(`  ${cssVar}: `)]).toEqual([key, true]);
        expect([key, darkBlock.includes(`  ${cssVar}: `)]).toEqual([key, true]);
        continue;
      }
      const declaration = `  ${cssVar}: ${token.defaultValue}${token.unit ?? ""};`;
      expect([key, lightBlock.includes(declaration)]).toEqual([key, true]);
      if (key === "radius") {
        expect(darkBlock).toContain("  --docs-interaction-radius: 12px;");
      } else {
        expect([key, darkBlock.includes(declaration)]).toEqual([key, true]);
      }
    }
    // Shared content follows State Shape until this block is overridden.
    for (const block of [lightBlock, darkBlock]) {
      expect(block).toContain("--docs-interaction-bg: var(--docs-shape-bg);");
      expect(block).toContain("--docs-interaction-rule: var(--docs-shape-rule);");
      expect(block).toContain("--docs-interaction-sig-name: var(--syntax-key);");
      expect(block).toContain("--docs-interaction-sig-type: var(--docs-shape-type);");
      expect(block).toContain("--docs-interaction-note-type: var(--docs-shape-type);");
      expect(block).toContain("--docs-interaction-note-fg: var(--docs-shape-desc-fg);");
      expect(block).toContain("--docs-interaction-child-rule: var(--docs-shape-child-rule);");
    }
  });

  it("normalizes and applies interaction-surface overrides onto their CSS vars", () => {
    const settings = normalizeSettings({
      components: {
        "interaction-surface": {
          rule: "#112233",
          columnHeadBg: "#AABBCC",
          sigName: "#0E7490",
          noteFg: "#445566",
          childRule: "#778899",
          rowPad: "10px",
          opGap: 20,
          radius: "8px",
          headerWeight: 650,
          noteNameTextSize: "13.5px",
          // Out of range, retired, and unknown keys are dropped.
          borderWidth: "9px",
          headerBg: "#000000",
          unknown: "#000000",
        },
      },
    });

    expect(settings.components).toEqual({
      "interaction-surface": {
        rule: "#112233",
        columnHeadBg: "#aabbcc",
        sigName: "#0e7490",
        noteFg: "#445566",
        childRule: "#778899",
        rowPad: "10px",
        opGap: "20px",
        radius: "8px",
        headerWeight: "650",
        noteNameTextSize: "13.5px",
      },
    });
    expect(styleRailVars(settings)).toMatchObject({
      "--docs-interaction-rule": "#112233",
      "--docs-interaction-column-head-bg": "#aabbcc",
      "--docs-interaction-sig-name": "#0e7490",
      "--docs-interaction-note-fg": "#445566",
      "--docs-interaction-child-rule": "#778899",
      "--docs-interaction-row-pad": "10px",
      "--docs-interaction-op-gap": "20px",
      "--docs-interaction-radius": "8px",
      "--docs-interaction-header-weight": "650",
      "--docs-interaction-note-name-text-size": "13.5px",
    });
  });

  it("emits nothing for a knob parked at its default", () => {
    const vars = styleRailVars(
      normalizeSettings({
        components: {
          "interaction-surface": { rowPad: "12px", opGap: "24px", noteNameWeight: 600 },
        },
      }),
    );
    expect(vars["--docs-interaction-row-pad"]).toBeNull();
    expect(vars["--docs-interaction-op-gap"]).toBeNull();
    expect(vars["--docs-interaction-note-name-weight"]).toBeNull();
  });

  it("renders the Interaction surface knobs with their sidebar labels", () => {
    render(<RailHarness />);
    openPane("Interaction surface");

    for (const label of [
      "Action header background",
      "Action header ink",
      "Query header background",
      "Query header ink",
      "Event header background",
      "Event header ink",
      "Border",
      "Background",
      "Rules",
      "Title text",
      "Header text",
      "Column head background",
      "Column head text",
      "Signature name",
      "Signature type",
      "Signature punctuation",
      "Note name",
      "Note type",
      "Note type chip",
      "Note text",
      "Child rule",
      "Corner radius",
      "Border width",
      "Rule width",
      "Card gap",
      "Title text size",
      "Title weight",
      "Title gap",
      "Header padding Y",
      "Header text size",
      "Header weight",
      "Badge text size",
      "Description text size",
      "Description line height",
      "Column head text size",
      "Column head padding Y",
      "Column head rule width",
      "Row padding",
      "Indent",
      "Note name size",
      "Note name weight",
      "Note type size",
    ]) {
      expect([label, screen.queryAllByText(label).length > 0]).toEqual([label, true]);
    }
    // No knob falls back to its raw registry key for a label.
    for (const key of Object.keys(entry)) {
      expect([key, screen.queryByText(key)]).toEqual([key, null]);
    }

    const slider = (name: RegExp) => screen.getByLabelText(name) as HTMLInputElement;
    const rowPad = slider(/^Row padding/);
    expect(rowPad).toHaveProperty("min", "0");
    expect(rowPad).toHaveProperty("max", "24");
    expect(rowPad).toHaveProperty("value", "12");
    const opGap = slider(/^Card gap/);
    expect(opGap).toHaveProperty("min", "0");
    expect(opGap).toHaveProperty("max", "48");
    expect(opGap).toHaveProperty("value", "24");
    expect(slider(/^Corner radius/)).toHaveProperty("value", "4");
    expect(slider(/^Header weight/)).toHaveProperty("value", "700");
    expect(slider(/^Note name size/)).toHaveProperty("value", "13");
  });
});

describe("style rail state-shape tokens", () => {
  it("registers every restyled state-shape var under the state-shape entry", () => {
    const entry = THEME_TOKEN_REGISTRY["state-shape"];
    expect(entry.border).toEqual({ vars: ["--docs-shape-border"], kind: "color" });
    expect(entry.bg).toEqual({ vars: ["--docs-shape-bg"], kind: "color" });
    expect(entry.name).toEqual({ vars: ["--docs-shape-name"], kind: "color" });
    expect(entry.type).toEqual({ vars: ["--docs-shape-type"], kind: "color" });
    expect(entry.typeBg).toEqual({ vars: ["--docs-shape-type-bg"], kind: "color" });
    expect(entry.muted).toEqual({ vars: ["--docs-shape-muted"], kind: "color" });
    expect(entry.optionalFg).toEqual({ vars: ["--docs-shape-optional-fg"], kind: "color" });
    expect(entry.optionalBg).toEqual({ vars: ["--docs-shape-optional-bg"], kind: "color" });
    expect(entry.rule).toEqual({ vars: ["--docs-shape-rule"], kind: "color" });
    expect(entry.headerBg).toEqual({ vars: ["--docs-shape-header-bg"], kind: "color" });
    expect(entry.descFg).toEqual({ vars: ["--docs-shape-desc-fg"], kind: "color" });
    expect(entry.childRule).toEqual({ vars: ["--docs-shape-child-rule"], kind: "color" });
    expect(entry.rowPad).toEqual({
      vars: ["--docs-shape-row-pad"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 6,
    });
    expect(entry.rowMinHeight).toEqual({
      vars: ["--docs-shape-row-min-height"],
      kind: "length",
      min: 0,
      max: 64,
      step: 1,
      unit: "px",
      defaultValue: 0,
    });
    expect(entry.nameWeight).toEqual({
      vars: ["--docs-shape-name-weight"],
      kind: "number",
      min: 300,
      max: 800,
      step: 100,
      defaultValue: 400,
    });
    expect(entry.headerFg).toEqual({ vars: ["--docs-shape-header-fg"], kind: "color" });
    expect(entry.headerRule).toEqual({ vars: ["--docs-shape-header-rule"], kind: "color" });
    expect(entry.childBg).toEqual({ vars: ["--docs-shape-child-bg"], kind: "color" });
    expect(entry.columnHeadBg).toEqual({ vars: ["--docs-shape-column-head-bg"], kind: "color" });
    // key, var, min, max, step, default (px)
    const lengths: Array<[string, string, number, number, number, number]> = [
      ["textSize", "--docs-shape-text-size", 10, 18, 0.5, 13],
      ["typeTextSize", "--docs-shape-type-text-size", 9, 16, 0.5, 12],
      ["headerTextSize", "--docs-shape-header-text-size", 10, 22, 0.5, 14],
      ["columnHeadTextSize", "--docs-shape-column-head-text-size", 8, 14, 0.5, 10],
      ["padX", "--docs-shape-pad-x", 0, 32, 1, 16],
      ["headerPadY", "--docs-shape-header-pad-y", 0, 32, 1, 16],
      ["columnHeadPadY", "--docs-shape-column-head-pad-y", 0, 16, 1, 8],
      ["borderWidth", "--docs-shape-border-width", 0, 4, 0.5, 1],
      ["radius", "--docs-shape-radius", 0, 16, 1, 4],
      ["ruleWidth", "--docs-shape-rule-width", 0, 4, 0.5, 1],
      ["headerRuleWidth", "--docs-shape-header-rule-width", 0, 4, 0.5, 1],
      ["columnHeadRuleWidth", "--docs-shape-column-head-rule-width", 0, 4, 0.5, 2],
      ["paneRuleWidth", "--docs-shape-pane-rule-width", 0, 4, 0.5, 1],
      ["indent", "--docs-shape-indent", 8, 40, 1, 22],
      ["treeTick", "--docs-shape-tree-tick", 0, 24, 1, 8],
      ["treeInset", "--docs-shape-tree-inset", 0, 24, 1, 6],
      ["childRuleWidth", "--docs-shape-child-rule-width", 0, 4, 0.5, 1],
    ];
    for (const [key, cssVar, min, max, step, defaultValue] of lengths) {
      expect(entry[key]).toEqual({
        vars: [cssVar],
        kind: "length",
        min,
        max,
        step,
        unit: "px",
        defaultValue,
      });
    }
    expect(entry.headerWeight).toEqual({
      vars: ["--docs-shape-header-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 100,
      defaultValue: 700,
    });
    expect(entry.headerTextureOpacity).toEqual({
      vars: ["--docs-shape-header-texture-opacity"],
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 0.1,
    });
  });

  // The dead-knob guard: a token the component never reads moves a slider
  // and nothing else (Row padding once shipped that way, behind a hardcoded
  // py-3). Every registered var must appear in the component with the
  // registry default as its literal fallback, every --docs-shape-* var the
  // component reads must be registered, and nothing may pin a value with
  // !important where a knob cannot reach it.
  it("wires every state-shape token to the component, fallback equal to the default", () => {
    const entry = THEME_TOKEN_REGISTRY["state-shape"];
    const source = readFileSync(
      new URL(
        "../../../../docs-viewer/src/components/state-shape/StateShapeDocsBlock.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    for (const token of Object.values(entry)) {
      for (const cssVar of token.vars) {
        if (token.kind === "color") expect(source).toContain(`var(${cssVar},`);
        else expect(source).toContain(`var(${cssVar},${token.defaultValue}${token.unit ?? ""})`);
      }
    }
    const registered = new Set(Object.values(entry).flatMap((token) => token.vars));
    const consumed = [...source.matchAll(/var\((--docs-shape-[a-z-]+)/g)].map((match) => match[1]);
    expect(consumed.length).toBeGreaterThan(0);
    for (const cssVar of consumed) expect(registered.has(cssVar)).toBe(true);
    expect(source).not.toContain("!important");
    expect(source).not.toContain("data-variator-tokens");
  });

  it("declares every state-shape var in both semantic.css blocks, light equal to the registry default", () => {
    const css = readFileSync(new URL("../theme/semantic.css", import.meta.url), "utf8");
    const darkStart = css.indexOf('[data-theme="dark"], .dark {');
    expect(darkStart).toBeGreaterThan(0);
    const light = css.slice(0, darkStart);
    const dark = css.slice(darkStart);
    for (const token of Object.values(THEME_TOKEN_REGISTRY["state-shape"])) {
      for (const cssVar of token.vars) {
        expect(light).toContain(`  ${cssVar}: `);
        expect(dark).toContain(`  ${cssVar}: `);
        if (token.kind === "color") continue;
        expect(light).toContain(`  ${cssVar}: ${token.defaultValue}${token.unit ?? ""};`);
      }
    }
    // Dark keeps its heavier frame; the registry default is the light value.
    expect(dark).toContain("  --docs-shape-border-width: 2px;");
    expect(dark).toContain("  --docs-shape-header-texture-opacity: 0.4;");
  });

  it("normalizes the state-shape size, weight, width and opacity knobs", () => {
    const settings = normalizeSettings({
      components: {
        "state-shape": {
          textSize: 15,
          headerWeight: "600",
          headerTextureOpacity: 0.25,
          borderWidth: "1.5px",
          headerRule: "#ABCDEF",
          radius: 99,
        },
      },
    });

    // radius 99 is out of range (0-16) and is dropped.
    expect(settings.components).toEqual({
      "state-shape": {
        textSize: "15px",
        headerWeight: "600",
        headerTextureOpacity: "0.25",
        borderWidth: "1.5px",
        headerRule: "#abcdef",
      },
    });
    expect(styleRailVars(settings)).toMatchObject({
      "--docs-shape-text-size": "15px",
      "--docs-shape-header-weight": "600",
      "--docs-shape-header-texture-opacity": "0.25",
      "--docs-shape-border-width": "1.5px",
      "--docs-shape-header-rule": "#abcdef",
      "--docs-shape-radius": null,
    });
  });

  it("normalizes and applies state-shape overrides onto their CSS vars", () => {
    const settings = normalizeSettings({
      components: {
        "state-shape": {
          headerBg: "#AABBCC",
          descFg: "#112233",
          childRule: "#445566",
          rowPad: "12px",
          unknown: "#000000",
        },
      },
    });

    expect(settings.components).toEqual({
      "state-shape": {
        headerBg: "#aabbcc",
        descFg: "#112233",
        childRule: "#445566",
        rowPad: "12px",
      },
    });
    expect(styleRailVars(settings)).toMatchObject({
      "--docs-shape-header-bg": "#aabbcc",
      "--docs-shape-desc-fg": "#112233",
      "--docs-shape-child-rule": "#445566",
      "--docs-shape-row-pad": "12px",
    });
  });

  it("renders the State shape knobs with their sidebar labels", () => {
    render(<RailHarness />);
    openPane("State shape");

    for (const label of [
      "Border",
      "Background",
      "Names",
      "Types",
      "Type chip background",
      "Muted fill",
      "Optional marker",
      "Optional marker background",
      "Rules",
      "Header background",
      "Header text",
      "Header rule",
      "Description text",
      "Child rule",
      "Child row background",
      "Column head background",
      "Row padding",
      "Row min height",
      "Name weight",
      "Text size",
      "Type text size",
      "Header text size",
      "Header weight",
      "Column head text size",
      "Padding X",
      "Header padding Y",
      "Column head padding Y",
      "Border width",
      "Corner radius",
      "Rule width",
      "Header rule width",
      "Column head rule width",
      "Pane divider width",
      "Header texture opacity",
      "Indent",
      "Tree tick length",
      "Tree inset",
      "Child rule width",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    const rowPad = screen.getByLabelText(/Row padding/) as HTMLInputElement;
    expect(rowPad).toHaveProperty("min", "0");
    expect(rowPad).toHaveProperty("max", "24");
    expect(rowPad).toHaveProperty("value", "6");
    // Every registry key has a human label: no raw camelCase key leaks.
    const unlabelled = Object.keys(THEME_TOKEN_REGISTRY["state-shape"]).filter(
      (key) => /[A-Z]/.test(key) && screen.queryByText(key) !== null,
    );
    expect(unlabelled).toEqual([]);
    const textSize = screen.getByLabelText(/^Text size/) as HTMLInputElement;
    expect(textSize).toHaveProperty("min", "10");
    expect(textSize).toHaveProperty("max", "18");
    expect(textSize).toHaveProperty("step", "0.5");
    expect(textSize).toHaveProperty("value", "13");
    const headerWeight = screen.getByLabelText(/^Header weight/) as HTMLInputElement;
    expect(headerWeight).toHaveProperty("value", "700");
    const texture = screen.getByLabelText(/^Header texture opacity/) as HTMLInputElement;
    expect(texture).toHaveProperty("max", "1");
    expect(texture).toHaveProperty("value", "0.1");
  });
});

describe("style rail process-outline tokens", () => {
  it("registers every process-outline var under the process-outline entry", () => {
    const entry = THEME_TOKEN_REGISTRY["process-outline"];
    expect(entry.ink).toEqual({ vars: ["--docs-process-outline-ink"], kind: "color" });
    expect(entry.rail).toEqual({ vars: ["--docs-process-outline-rail"], kind: "color" });
    expect(entry.noteFg).toEqual({ vars: ["--docs-process-outline-note-fg"], kind: "color" });
    expect(entry.noteBg).toEqual({ vars: ["--docs-process-outline-note-bg"], kind: "color" });
    expect(entry.noteBorder).toEqual({ vars: ["--docs-process-outline-note-border"], kind: "color" });
    expect(entry.codeBg).toEqual({ vars: ["--docs-process-outline-code-bg"], kind: "color" });
    expect(entry.deepInk).toEqual({ vars: ["--docs-process-outline-deep-ink"], kind: "color" });
    // Note text, rule and bullet dots are three independent colors.
    expect(entry.noteRule).toEqual({ vars: ["--docs-process-outline-note-rule"], kind: "color" });
    expect(entry.noteBullet).toEqual({ vars: ["--docs-process-outline-note-bullet"], kind: "color" });
    // One color per nesting level (the approved palette has six; deeper
    // levels inherit the sixth), plus the loop-keyword accent outside it.
    for (const level of [1, 2, 3, 4, 5, 6]) {
      expect(entry[`cycle${level}`]).toEqual({
        vars: [`--docs-process-outline-cycle-${level}`],
        kind: "color",
      });
    }
    expect(entry.keywordFg).toEqual({
      vars: ["--docs-process-outline-keyword-fg"],
      kind: "color",
    });
    expect(entry.keywordWeight).toEqual({
      vars: ["--docs-process-outline-keyword-weight"],
      kind: "number",
      min: 300,
      max: 900,
      step: 50,
      defaultValue: 700,
    });
    // The flow frame (top/bottom rules + padding) was hard-coded; it rides
    // the shared frame keys now.
    expect(entry.border).toEqual({ vars: ["--docs-process-outline-border"], kind: "color" });
    expect(entry.borderWidth).toEqual({
      vars: ["--docs-process-outline-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    });
    expect(entry.padY).toEqual({
      vars: ["--docs-process-outline-pad-y"],
      kind: "length",
      min: 0,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: 14,
    });
    expect(entry.padX).toEqual({
      vars: ["--docs-process-outline-pad-x"],
      kind: "length",
      min: 0,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: 16,
    });
    expect(entry.indent).toEqual({
      vars: ["--docs-process-outline-indent"],
      kind: "length",
      min: 16,
      max: 72,
      step: 1,
      unit: "px",
      defaultValue: 46,
    });
    expect(entry.rowGap).toEqual({
      vars: ["--docs-process-outline-row-gap"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 12,
    });
    // Branch and root separation are knobs. Branch gap spaces the children
    // of a root step; it matches the row gap by default.
    expect(entry.branchGap).toEqual({
      vars: ["--docs-process-outline-branch-gap"],
      kind: "length",
      min: 0,
      max: 48,
      step: 1,
      unit: "px",
      defaultValue: 12,
    });
    expect(entry.rootGap).toEqual({
      vars: ["--docs-process-outline-root-gap"],
      kind: "length",
      min: 0,
      max: 64,
      step: 1,
      unit: "px",
      defaultValue: 30,
    });
    expect(entry.arrowGap).toEqual({
      vars: ["--docs-process-outline-arrow-gap"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 2,
    });
    expect(entry.lineHeight).toEqual({
      vars: ["--docs-process-outline-line-height"],
      kind: "length",
      min: 16,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: 22,
    });
    expect(entry.textSize).toEqual({
      vars: ["--docs-process-outline-text-size"],
      kind: "length",
      min: 12,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12.5,
    });
    // The root line's size and the empty placeholder's size were hard-coded
    // in the component; both ride tokens now.
    expect(entry.rootTextSize).toEqual({
      vars: ["--docs-process-outline-root-text-size"],
      kind: "length",
      min: 13,
      max: 22,
      step: 0.5,
      unit: "px",
      defaultValue: 13.5,
    });
    expect(entry.emptyTextSize).toEqual({
      vars: ["--docs-process-outline-empty-text-size"],
      kind: "length",
      min: 12,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    });
    // Notes are subordinate: their own size (at the 12px floor), their own
    // line rhythm, an inset that pulls the run under its parent step, and a
    // rule width for the left edge.
    expect(entry.noteTextSize).toEqual({
      vars: ["--docs-process-outline-note-text-size"],
      kind: "length",
      min: 12,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    });
    expect(entry.noteLineHeight).toEqual({
      vars: ["--docs-process-outline-note-line-height"],
      kind: "length",
      min: 12,
      max: 32,
      step: 1,
      unit: "px",
      defaultValue: 17,
    });
    expect(entry.noteInset).toEqual({
      vars: ["--docs-process-outline-note-inset"],
      kind: "length",
      min: 0,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: 8,
    });
    // Notes render as bullets behind a 1px left rule. The card box is still
    // expressible, purely in tokens: border width and horizontal padding
    // default to zero and the classic theme sets them to get its box back.
    expect(entry.noteBorderWidth).toEqual({
      vars: ["--docs-process-outline-note-border-width"],
      kind: "length",
      min: 0,
      max: 4,
      step: 0.5,
      unit: "px",
      defaultValue: 0,
    });
    expect(entry.noteRuleWidth).toEqual({
      vars: ["--docs-process-outline-note-rule-width"],
      kind: "length",
      min: 0,
      max: 6,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    });
    expect(entry.notePadY).toEqual({
      vars: ["--docs-process-outline-note-pad-y"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 1,
    });
    expect(entry.notePadX).toEqual({
      vars: ["--docs-process-outline-note-pad-x"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 0,
    });
    expect(entry.noteRuleGap).toEqual({
      vars: ["--docs-process-outline-note-rule-gap"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 8,
    });
    // Mix strengths are unitless percentages: the component multiplies them
    // by 1% at the use site, where the depth color actually exists. Note
    // accent is 0 by default — rule and dots render as their flat colors.
    expect(entry.noteAccent).toEqual({
      vars: ["--docs-process-outline-note-accent"],
      kind: "number",
      min: 0,
      max: 100,
      step: 5,
      defaultValue: 0,
    });
    expect(entry.chipTint).toEqual({
      vars: ["--docs-process-outline-chip-tint"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 10,
    });
    expect(entry.chipInkMix).toEqual({
      vars: ["--docs-process-outline-chip-ink-mix"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 64,
    });
    // The trace mark is a mini pill now, built on the chips' own tint/mix
    // formula; the old dot-size and arrowhead-stroke knobs are gone with it.
    expect(entry.traceDotSize).toBeUndefined();
    expect(entry.traceStroke).toBeUndefined();
    expect(entry.traceBg).toEqual({
      vars: ["--docs-process-outline-trace-bg"],
      kind: "color",
    });
    expect(entry.traceTextSize).toEqual({
      vars: ["--docs-process-outline-trace-text-size"],
      kind: "length",
      min: 12,
      max: 16,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    });
    expect(entry.traceTint).toEqual({
      vars: ["--docs-process-outline-trace-tint"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 10,
    });
    expect(entry.traceInkMix).toEqual({
      vars: ["--docs-process-outline-trace-ink-mix"],
      kind: "number",
      min: 0,
      max: 100,
      step: 5,
      defaultValue: 70,
    });
    // Dragging across step lines highlights each line in its own depth colour
    // — the chip tint formula again, never the block-wide selection wash.
    expect(entry.selectBg).toEqual({
      vars: ["--docs-process-outline-select-bg"],
      kind: "color",
    });
    expect(entry.selectTint).toEqual({
      vars: ["--docs-process-outline-select-tint"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 15,
    });
    expect(entry.selectPad).toEqual({
      vars: ["--docs-process-outline-select-pad"],
      kind: "length",
      min: 0,
      max: 8,
      step: 0.5,
      unit: "px",
      defaultValue: 2,
    });
    // Hand-editing a line shows a hairline outline in the line's depth color;
    // 0 leaves just the caret. There is no block-wide edit tint at any value.
    expect(entry.focusRing).toEqual({
      vars: ["--docs-process-outline-focus-ring"],
      kind: "length",
      min: 0,
      max: 3,
      step: 0.5,
      unit: "px",
      defaultValue: 1,
    });
    expect(entry.arrowSize).toEqual({
      vars: ["--docs-process-outline-arrow-size"],
      kind: "length",
      min: 3,
      max: 12,
      step: 0.5,
      unit: "px",
      defaultValue: 6,
    });
    expect(entry.stroke).toEqual({
      vars: ["--docs-process-outline-stroke"],
      kind: "length",
      min: 0.5,
      max: 4,
      step: 0.25,
      unit: "px",
      defaultValue: 1.5,
    });
  });

  it("normalizes and applies process-outline color and geometry overrides onto their CSS vars", () => {
    const settings = normalizeSettings({
      components: {
        "process-outline": {
          ink: "#112233",
          rail: "#5D6266",
          noteBg: "#AABBCC",
          codeBg: "#DDEEFF",
          indent: 48,
          rowGap: "10px",
          arrowGap: 6,
          lineHeight: 26,
          textSize: 14,
          noteTextSize: "13px",
          arrowSize: 8,
          stroke: "2px",
          unknown: "#000000",
        },
      },
    });

    expect(settings.components).toEqual({
      "process-outline": {
        ink: "#112233",
        rail: "#5d6266",
        noteBg: "#aabbcc",
        codeBg: "#ddeeff",
        indent: "48px",
        rowGap: "10px",
        arrowGap: "6px",
        lineHeight: "26px",
        textSize: "14px",
        noteTextSize: "13px",
        arrowSize: "8px",
        stroke: "2px",
      },
    });
    expect(styleRailVars(settings)).toMatchObject({
      "--docs-process-outline-ink": "#112233",
      "--docs-process-outline-rail": "#5d6266",
      "--docs-process-outline-note-bg": "#aabbcc",
      "--docs-process-outline-code-bg": "#ddeeff",
      "--docs-process-outline-indent": "48px",
      "--docs-process-outline-row-gap": "10px",
      "--docs-process-outline-arrow-gap": "6px",
      "--docs-process-outline-line-height": "26px",
      "--docs-process-outline-text-size": "14px",
      "--docs-process-outline-note-text-size": "13px",
      "--docs-process-outline-arrow-size": "8px",
      "--docs-process-outline-stroke": "2px",
    });
  });

  it("removes the geometry overrides when the knobs sit at their defaults", () => {
    const settings = normalizeSettings({
      components: {
        "process-outline": {
          indent: "46px",
          rowGap: "12px",
          branchGap: "12px",
          rootGap: "30px",
          arrowGap: "2px",
          lineHeight: "22px",
          textSize: "12.5px",
          rootTextSize: "13.5px",
          emptyTextSize: "12px",
          noteTextSize: "12px",
          noteLineHeight: "17px",
          noteInset: "8px",
          noteBorderWidth: "0px",
          noteRuleWidth: "1px",
          notePadY: "1px",
          notePadX: "0px",
          noteRuleGap: "8px",
          noteAccent: "0",
          chipTint: "10",
          chipInkMix: "64",
          traceTextSize: "12px",
          traceTint: "10",
          traceInkMix: "70",
          selectTint: "15",
          selectPad: "2px",
          focusRing: "1px",
          keywordWeight: "700",
          borderWidth: "1px",
          padY: "14px",
          padX: "16px",
          arrowSize: "6px",
          stroke: "1.5px",
        },
      },
    });

    const vars = styleRailVars(settings);
    expect(vars["--docs-process-outline-indent"]).toBeNull();
    expect(vars["--docs-process-outline-row-gap"]).toBeNull();
    expect(vars["--docs-process-outline-branch-gap"]).toBeNull();
    expect(vars["--docs-process-outline-root-gap"]).toBeNull();
    expect(vars["--docs-process-outline-arrow-gap"]).toBeNull();
    expect(vars["--docs-process-outline-line-height"]).toBeNull();
    expect(vars["--docs-process-outline-text-size"]).toBeNull();
    expect(vars["--docs-process-outline-root-text-size"]).toBeNull();
    expect(vars["--docs-process-outline-empty-text-size"]).toBeNull();
    expect(vars["--docs-process-outline-note-text-size"]).toBeNull();
    expect(vars["--docs-process-outline-note-line-height"]).toBeNull();
    expect(vars["--docs-process-outline-note-inset"]).toBeNull();
    expect(vars["--docs-process-outline-note-border-width"]).toBeNull();
    expect(vars["--docs-process-outline-note-rule-width"]).toBeNull();
    expect(vars["--docs-process-outline-note-pad-y"]).toBeNull();
    expect(vars["--docs-process-outline-note-pad-x"]).toBeNull();
    expect(vars["--docs-process-outline-note-accent"]).toBeNull();
    expect(vars["--docs-process-outline-chip-tint"]).toBeNull();
    expect(vars["--docs-process-outline-chip-ink-mix"]).toBeNull();
    expect(vars["--docs-process-outline-arrow-size"]).toBeNull();
    expect(vars["--docs-process-outline-stroke"]).toBeNull();
    expect(vars["--docs-process-outline-note-rule-gap"]).toBeNull();
    expect(vars["--docs-process-outline-trace-text-size"]).toBeNull();
    expect(vars["--docs-process-outline-trace-tint"]).toBeNull();
    expect(vars["--docs-process-outline-trace-ink-mix"]).toBeNull();
    expect(vars["--docs-process-outline-select-tint"]).toBeNull();
    expect(vars["--docs-process-outline-select-pad"]).toBeNull();
    expect(vars["--docs-process-outline-focus-ring"]).toBeNull();
    expect(vars["--docs-process-outline-keyword-weight"]).toBeNull();
    expect(vars["--docs-process-outline-border-width"]).toBeNull();
    expect(vars["--docs-process-outline-pad-y"]).toBeNull();
    expect(vars["--docs-process-outline-pad-x"]).toBeNull();
  });

  // The class of bug this guards: a knob in the rail whose var the component
  // never reads (or reads behind an !important / a re-declaration), or whose
  // fallback / semantic.css value disagrees with the registry default.
  it("wires every process-outline token through the component with its default as the fallback", () => {
    const semanticCss = readFileSync(new URL("../theme/semantic.css", import.meta.url), "utf8");
    const componentSource = readFileSync(
      new URL(
        "../../../../docs-viewer/src/components/process-outline/ProcessOutlineDocsBlock.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const entry = THEME_TOKEN_REGISTRY["process-outline"];

    for (const [key, token] of Object.entries(entry)) {
      for (const cssVar of token.vars) {
        // Consumed by the component ...
        expect([key, componentSource.includes(`var(${cssVar},`)]).toEqual([key, true]);
        // ... and declared once per mode in semantic.css.
        const declarations = semanticCss.match(new RegExp(`^\\s*${escape(cssVar)}:\\s*([^;]+);`, "gm")) ?? [];
        expect([key, declarations.length]).toEqual([key, 2]);
        if (token.kind === "color") continue;
        const value = `${token.defaultValue}${token.unit ?? ""}`;
        // Every read of the var falls back to the registry default ...
        const reads = componentSource.match(new RegExp(`var\\(${escape(cssVar)},\\s*[^)]*\\)`, "g")) ?? [];
        expect(reads.length).toBeGreaterThan(0);
        for (const read of reads) {
          expect([key, read.replace(/\s+/g, "")]).toEqual([key, `var(${cssVar},${value})`]);
        }
        // ... which is also the semantic.css value in light and dark.
        for (const declaration of declarations) {
          expect([key, declaration.trim()]).toEqual([key, `${cssVar}: ${value};`]);
        }
      }
    }

    // No orphan: every process-outline var the component reads is a knob.
    const registered = new Set(Object.values(entry).flatMap((token) => token.vars));
    const consumed = new Set(componentSource.match(/--docs-process-outline-[a-z0-9-]+/g) ?? []);
    expect([...consumed].filter((cssVar) => !registered.has(cssVar))).toEqual([]);
    // Nothing in the component pins a value or re-declares a token, which is
    // what made stroke, the depth colors and note text dead knobs before.
    expect(componentSource).not.toContain("data-variator-tokens");
    expect(componentSource).not.toMatch(/^\s*--docs-process-outline-[a-z0-9-]+\s*:/m);
  });

  it("renders the Process Outline knobs with their sidebar labels", () => {
    render(<RailHarness />);
    openPane("Process Outline");

    for (const label of [
      "Ink",
      "Deep ink",
      "Rail",
      "Depth 1 color",
      "Depth 5 color",
      "Depth 6 color",
      "Loop keyword",
      "Loop keyword weight",
      "Note text",
      "Note rule",
      "Note bullets",
      "Note background",
      "Note border",
      "Border",
      "Border width",
      "Padding Y",
      "Padding X",
      "Note rule gap",
      "Selected line background",
      "Selected line tint",
      "Selected line padding",
      "Code background",
      "Indent",
      "Row gap",
      "Branch gap",
      "Root gap",
      "Arrow gap",
      "Line height",
      "Text size",
      "Root text size",
      "Empty text size",
      "Note text size",
      "Note line height",
      "Note inset",
      "Note border width",
      "Note rule width",
      "Note padding Y",
      "Note padding X",
      "Note accent strength",
      "Chip tint strength",
      "Chip label mix",
      "Trace pill background",
      "Trace pill size",
      "Trace pill tint",
      "Trace pill label mix",
      "Focused line ring",
      "Arrow size",
      "Stroke",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }

    const indent = screen.getByLabelText(/^Indent/) as HTMLInputElement;
    expect(indent).toHaveProperty("min", "16");
    expect(indent).toHaveProperty("max", "72");
    expect(indent).toHaveProperty("value", "46");
    const rowGap = screen.getByLabelText(/^Row gap/) as HTMLInputElement;
    expect(rowGap).toHaveProperty("min", "0");
    expect(rowGap).toHaveProperty("max", "24");
    expect(rowGap).toHaveProperty("value", "12");
    // The strength knobs are unitless percentages, not lengths.
    const chipTint = screen.getByLabelText(/Chip tint strength/) as HTMLInputElement;
    expect(chipTint).toHaveProperty("max", "100");
    expect(chipTint).toHaveProperty("value", "10");
    const arrowGap = screen.getByLabelText(/Arrow gap/) as HTMLInputElement;
    expect(arrowGap).toHaveProperty("min", "0");
    expect(arrowGap).toHaveProperty("max", "16");
    expect(arrowGap).toHaveProperty("value", "2");
    const lineHeight = screen.getByLabelText(/Line height/) as HTMLInputElement;
    expect(lineHeight).toHaveProperty("min", "16");
    expect(lineHeight).toHaveProperty("max", "40");
    expect(lineHeight).toHaveProperty("value", "22");
    const textSize = screen.getByLabelText(/^Text size/) as HTMLInputElement;
    expect(textSize).toHaveProperty("min", "12");
    expect(textSize).toHaveProperty("max", "18");
    expect(textSize).toHaveProperty("value", "12.5");
    const noteTextSize = screen.getByLabelText(/Note text size/) as HTMLInputElement;
    expect(noteTextSize).toHaveProperty("min", "12");
    expect(noteTextSize).toHaveProperty("max", "18");
    expect(noteTextSize).toHaveProperty("value", "12");
    const arrowSize = screen.getByLabelText(/Arrow size/) as HTMLInputElement;
    expect(arrowSize).toHaveProperty("min", "3");
    expect(arrowSize).toHaveProperty("max", "12");
    expect(arrowSize).toHaveProperty("value", "6");
    const stroke = screen.getByLabelText(/Stroke/) as HTMLInputElement;
    expect(stroke).toHaveProperty("min", "0.5");
    expect(stroke).toHaveProperty("max", "4");
    expect(stroke).toHaveProperty("value", "1.5");
  });
});

describe("style rail sequence tokens", () => {
  const SEQUENCE_COLORS = {
    border: "--docs-sequence-border",
    bg: "--docs-sequence-bg",
    expandFg: "--docs-sequence-expand-fg",
    diagramBg: "--docs-sequence-diagram-bg",
    diagramText: "--docs-sequence-diagram-text",
    diagramLine: "--docs-sequence-line",
    actorFill: "--docs-sequence-actor-fill",
    actorBorder: "--docs-sequence-actor-border",
    noteBg: "--docs-sequence-note-bg",
    fragment: "--docs-sequence-fragment",
  };
  const SEQUENCE_LENGTHS = {
    borderWidth: { cssVar: "--docs-sequence-border-width", min: 0, max: 4, step: 0.5, defaultValue: 1 },
    radius: { cssVar: "--docs-sequence-radius", min: 0, max: 24, step: 1, defaultValue: 8 },
    padding: { cssVar: "--docs-sequence-padding", min: 0, max: 40, step: 1, defaultValue: 12 },
    maxHeight: { cssVar: "--docs-sequence-max-height", min: 160, max: 1200, step: 20, defaultValue: 420 },
    expandTextSize: {
      cssVar: "--docs-sequence-expand-text-size",
      min: 10,
      max: 18,
      step: 0.5,
      defaultValue: 12,
    },
  };
  const semanticCss = readFileSync(new URL("../theme/semantic.css", import.meta.url), "utf8");
  const embedCss = readFileSync(new URL("../pages/sequence-embed.css", import.meta.url), "utf8");

  it("registers the sequence frame and diagram vars", () => {
    const entry = THEME_TOKEN_REGISTRY.sequence;
    expect(Object.keys(entry).sort()).toEqual(
      [...Object.keys(SEQUENCE_COLORS), ...Object.keys(SEQUENCE_LENGTHS)].sort(),
    );
    for (const [key, cssVar] of Object.entries(SEQUENCE_COLORS)) {
      expect(entry[key]).toEqual({ vars: [cssVar], kind: "color" });
    }
    for (const [key, { cssVar, ...range }] of Object.entries(SEQUENCE_LENGTHS)) {
      expect(entry[key]).toEqual({ vars: [cssVar], kind: "length", unit: "px", ...range });
    }
  });

  it("reads every sequence token in the embed stylesheet with its default as the fallback", () => {
    // Frame lengths: the literal the stylesheet used to hardcode is now the
    // fallback, and the same value sits in semantic.css for both modes.
    for (const [key, { cssVar, defaultValue }] of Object.entries(SEQUENCE_LENGTHS)) {
      expect([key, embedCss.includes(`var(${cssVar}, ${defaultValue}px)`)]).toEqual([key, true]);
      expect([key, semanticCss.split(`${cssVar}: ${defaultValue}px;`).length - 1]).toEqual([key, 2]);
    }
    expect(embedCss).toContain(
      "border: var(--docs-sequence-border-width, 1px) solid var(--docs-sequence-border, var(--border));",
    );
    expect(embedCss).toContain("border-radius: var(--docs-sequence-radius, 8px);");
    expect(embedCss).toContain("background: var(--docs-sequence-bg, transparent);");
    expect(embedCss).toContain("padding: var(--docs-sequence-padding, 12px);");
    // The viewport cap survives next to the knob.
    expect(embedCss).toContain("max-height: min(var(--docs-sequence-max-height, 420px), 55vh);");
    expect(embedCss).toContain("color: var(--docs-sequence-expand-fg, currentColor);");
    expect(embedCss).toContain("font-size: var(--docs-sequence-expand-text-size, 12px);");

    // Diagram colors reach the SVG through the sequence package's own
    // --seq-* vars, on both surfaces that host it; the fallbacks are the
    // package defaults, so stock rendering is unchanged.
    expect(embedCss).toMatch(/\.docs-sequence-preview,\s*\.docs-sequence-dialog \{\s*--seq-bg:/);
    for (const mapping of [
      "--seq-bg: var(--docs-sequence-diagram-bg, #ffffff);",
      "--seq-text: var(--docs-sequence-diagram-text, #252525);",
      "--seq-accent: var(--docs-sequence-line, #c77d2e);",
      "--seq-participant-fill: var(--docs-sequence-actor-fill, #fff8f0);",
      "--seq-participant-stroke: var(--docs-sequence-actor-border, var(--docs-sequence-line, #c77d2e));",
      "--seq-note-fill: var(--docs-sequence-note-bg, var(--docs-sequence-actor-fill, #fff8f0));",
      "--seq-fragment-accent: var(--docs-sequence-fragment, #5b7fbd);",
    ]) {
      expect(embedCss).toContain(mapping);
    }

    // Every color var is consumed and declared once per mode.
    for (const [key, cssVar] of Object.entries(SEQUENCE_COLORS)) {
      expect([key, embedCss.includes(`var(${cssVar},`)]).toEqual([key, true]);
      expect([key, semanticCss.split(`${cssVar}: `).length - 1]).toEqual([key, 2]);
    }
    for (const declaration of [
      "--docs-sequence-border: var(--border);",
      "--docs-sequence-bg: transparent;",
      "--docs-sequence-expand-fg: currentColor;",
      "--docs-sequence-diagram-bg: #ffffff;",
      "--docs-sequence-diagram-text: #252525;",
      "--docs-sequence-line: #c77d2e;",
      "--docs-sequence-actor-fill: #fff8f0;",
      // Derived defaults track their source until a theme sets them.
      "--docs-sequence-actor-border: var(--docs-sequence-line);",
      "--docs-sequence-note-bg: var(--docs-sequence-actor-fill);",
      "--docs-sequence-fragment: #5b7fbd;",
    ]) {
      expect([declaration, semanticCss.split(declaration).length - 1]).toEqual([declaration, 2]);
    }
  });

  it("applies sequence overrides onto their CSS vars and drops knobs parked at default", () => {
    const settings = normalizeSettings({
      components: {
        sequence: {
          border: "#112233",
          diagramLine: "#445566",
          radius: 12,
          padding: "20px",
          maxHeight: 600,
          borderWidth: "1px",
          expandTextSize: "12px",
          unknown: "#000000",
        },
      },
    });

    const vars = styleRailVars(settings);
    expect(vars).toMatchObject({
      "--docs-sequence-border": "#112233",
      "--docs-sequence-line": "#445566",
      "--docs-sequence-radius": "12px",
      "--docs-sequence-padding": "20px",
      "--docs-sequence-max-height": "600px",
    });
    expect(vars["--docs-sequence-border-width"]).toBeNull();
    expect(vars["--docs-sequence-expand-text-size"]).toBeNull();
  });

  it("renders the Sequence knobs with their sidebar labels", () => {
    render(<RailHarness />);
    openPane("Sequence");

    for (const label of [
      "Border",
      "Background",
      "Expand label",
      "Diagram background",
      "Diagram text",
      "Diagram lines",
      "Actor fill",
      "Actor border",
      "Note background",
      "Fragment frame",
      "Border width",
      "Corner radius",
      "Padding",
      "Max preview height",
      "Expand label size",
    ]) {
      // "Background" is also a nav entry, so a label may match more than once.
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    const radius = screen.getByLabelText(/Corner radius/) as HTMLInputElement;
    expect(radius).toHaveProperty("min", "0");
    expect(radius).toHaveProperty("max", "24");
    expect(radius).toHaveProperty("value", "8");
    const maxHeight = screen.getByLabelText(/Max preview height/) as HTMLInputElement;
    expect(maxHeight).toHaveProperty("min", "160");
    expect(maxHeight).toHaveProperty("max", "1200");
    expect(maxHeight).toHaveProperty("value", "420");
  });
});

describe("style rail canvas tokens", () => {
  const CANVAS_LENGTHS = {
    borderWidth: { cssVar: "--docs-canvas-border-width", min: 0, max: 4, step: 0.5, defaultValue: 1 },
    radius: { cssVar: "--docs-canvas-radius", min: 0, max: 24, step: 1, defaultValue: 6 },
    padding: { cssVar: "--docs-canvas-padding", min: 0, max: 40, step: 1, defaultValue: 0 },
  };
  const semanticCss = readFileSync(new URL("../theme/semantic.css", import.meta.url), "utf8");
  const embedSource = readFileSync(new URL("../pages/CanvasEmbed.tsx", import.meta.url), "utf8");

  it("registers the canvas frame vars", () => {
    const entry = THEME_TOKEN_REGISTRY.canvas;
    expect(Object.keys(entry).sort()).toEqual(["bg", "border", ...Object.keys(CANVAS_LENGTHS)].sort());
    expect(entry.border).toEqual({ vars: ["--docs-canvas-border"], kind: "color" });
    expect(entry.bg).toEqual({ vars: ["--docs-canvas-bg"], kind: "color" });
    for (const [key, { cssVar, ...range }] of Object.entries(CANVAS_LENGTHS)) {
      expect(entry[key]).toEqual({ vars: [cssVar], kind: "length", unit: "px", ...range });
    }
  });

  it("reads every canvas token on the embed frame with its default as the fallback", () => {
    // The border color knob used to exist in the rail while the real frame
    // drew a bare `border` — the loaded frame and every state card read it now.
    expect(embedSource.split("border-[color:var(--docs-canvas-border,var(--border))]").length - 1).toBe(4);
    expect(embedSource).not.toMatch(/rounded-md border"/);
    expect(embedSource).toContain("border-[length:var(--docs-canvas-border-width,1px)]");
    expect(embedSource).toContain("bg-[color:var(--docs-canvas-bg,transparent)]");
    expect(embedSource).toContain("p-[var(--docs-canvas-padding,0px)]");
    // Radius follows the global --radius (6px at stock) in the fallback and in
    // semantic.css alike, on the frame and on its focus-ring overlay.
    expect(
      embedSource.split("rounded-[var(--docs-canvas-radius,max(0px,calc(var(--radius,8px)-2px)))]").length - 1,
    ).toBe(2);
    for (const declaration of [
      "--docs-canvas-border: var(--border);",
      "--docs-canvas-border-width: 1px;",
      "--docs-canvas-radius: max(0px, calc(var(--radius) - 2px));",
      "--docs-canvas-bg: transparent;",
      "--docs-canvas-padding: 0px;",
    ]) {
      expect([declaration, semanticCss.split(declaration).length - 1]).toEqual([declaration, 2]);
    }
  });

  it("applies canvas overrides onto their CSS vars and drops knobs parked at default", () => {
    const settings = normalizeSettings({
      components: {
        canvas: { border: "#112233", bg: "#445566", radius: 12, padding: "8px", borderWidth: "1px" },
      },
    });

    const vars = styleRailVars(settings);
    expect(vars).toMatchObject({
      "--docs-canvas-border": "#112233",
      "--docs-canvas-bg": "#445566",
      "--docs-canvas-radius": "12px",
      "--docs-canvas-padding": "8px",
    });
    expect(vars["--docs-canvas-border-width"]).toBeNull();
  });

  it("renders the Canvas knobs with their sidebar labels", () => {
    render(<RailHarness />);
    openPane("Canvas");

    for (const label of ["Border", "Background", "Border width", "Corner radius", "Padding"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    const radius = screen.getByLabelText(/Corner radius/) as HTMLInputElement;
    expect(radius).toHaveProperty("min", "0");
    expect(radius).toHaveProperty("max", "24");
    expect(radius).toHaveProperty("value", "6");
    const padding = screen.getByLabelText(/^Padding/) as HTMLInputElement;
    expect(padding).toHaveProperty("value", "0");
  });
});

describe("style rail rich-text block tokens", () => {
  /**
   * The eight rich-text block types: paragraph, heading, list-item, quote,
   * callout, divider, image, video. One table drives every assertion, so a
   * new knob has to land here with its var, range and default — and then
   * prove it is declared, wired and labelled.
   *
   * `fallback` is the literal the consumer carries inside `var(name,…)`. It
   * equals the default unless stated: the em-multiplier knobs that replaced
   * Tailwind Typography metrics keep the UNTHEMED value as their fallback
   * (what a host with no theme layer rendered before the knob existed),
   * while semantic.css carries the workbench value the registry defaults to.
   */
  type Range = { cssVar: string; min: number; max: number; step: number; defaultValue: number };
  type LengthToken = Range & { declared?: string; fallback?: string };
  type NumberToken = Range & { fallback?: string };
  type BlockTokens = {
    pane: string;
    colors: Record<string, string>;
    lengths: Record<string, LengthToken>;
    numbers: Record<string, NumberToken>;
  };
  const RADIUS_DECLARED = "max(0px, calc(var(--radius) - 2px))";
  const RADIUS_FALLBACK = "max(0px,calc(var(--radius,8px)-2px))";
  const mediaTokens = (pane: string, prefix: string): BlockTokens => ({
    pane,
    colors: { border: `${prefix}-border`, caption: `${prefix}-caption-fg` },
    lengths: {
      borderWidth: { cssVar: `${prefix}-border-width`, min: 0, max: 4, step: 0.5, defaultValue: 1 },
      radius: {
        cssVar: `${prefix}-radius`,
        min: 0,
        max: 24,
        step: 1,
        defaultValue: 6,
        declared: RADIUS_DECLARED,
        fallback: RADIUS_FALLBACK,
      },
      captionTextSize: {
        cssVar: `${prefix}-caption-text-size`,
        min: 9,
        max: 20,
        step: 0.5,
        defaultValue: 12,
      },
      captionGap: { cssVar: `${prefix}-caption-gap`, min: 0, max: 24, step: 1, defaultValue: 4 },
      margin: { cssVar: `${prefix}-margin`, min: 0, max: 64, step: 1, defaultValue: 16 },
    },
    numbers: {},
  });
  const BLOCKS: Record<string, BlockTokens> = {
    paragraph: {
      pane: "Paragraph",
      colors: { fg: "--docs-paragraph-fg" },
      lengths: {},
      numbers: {
        spacing: {
          cssVar: "--docs-paragraph-spacing",
          min: 0,
          max: 3,
          step: 0.05,
          defaultValue: 1.1428571,
          fallback: "0.6666667",
        },
      },
    },
    heading: {
      pane: "Heading",
      colors: { fg: "--docs-heading-fg" },
      lengths: {
        marginTop: { cssVar: "--docs-heading-margin-top", min: 0, max: 72, step: 1, defaultValue: 24 },
        marginBottom: {
          cssVar: "--docs-heading-margin-bottom",
          min: 0,
          max: 48,
          step: 1,
          defaultValue: 12,
        },
      },
      numbers: {
        weight: { cssVar: "--docs-heading-weight", min: 300, max: 900, step: 50, defaultValue: 600 },
        h1Size: {
          cssVar: "--docs-heading-h1-size",
          min: 1,
          max: 4,
          step: 0.05,
          defaultValue: 2.1428571,
          fallback: "2",
        },
        h2Size: {
          cssVar: "--docs-heading-h2-size",
          min: 1,
          max: 3,
          step: 0.05,
          defaultValue: 1.4285714,
          fallback: "1.5",
        },
        h3Size: {
          cssVar: "--docs-heading-h3-size",
          min: 1,
          max: 3,
          step: 0.05,
          defaultValue: 1.2857143,
          fallback: "1.17",
        },
      },
    },
    "list-item": {
      pane: "List item",
      colors: { marker: "--docs-list-marker-fg", fg: "--docs-list-item-fg" },
      lengths: {
        itemGap: { cssVar: "--docs-list-item-gap", min: 0, max: 24, step: 0.5, defaultValue: 4 },
      },
      numbers: {},
    },
    quote: {
      pane: "Quote",
      colors: { fg: "--docs-quote-fg", border: "--docs-quote-border", bg: "--docs-quote-bg" },
      lengths: {
        borderWidth: {
          cssVar: "--docs-quote-border-width",
          min: 0,
          max: 8,
          step: 0.5,
          defaultValue: 2,
        },
        indent: { cssVar: "--docs-quote-indent", min: 0, max: 48, step: 1, defaultValue: 12 },
        padY: { cssVar: "--docs-quote-pad-y", min: 0, max: 32, step: 1, defaultValue: 0 },
      },
      numbers: {
        spacing: {
          cssVar: "--docs-quote-spacing",
          min: 0,
          max: 4,
          step: 0.05,
          defaultValue: 1.3333333,
          fallback: "0.8888889",
        },
        textScale: {
          cssVar: "--docs-quote-text-scale",
          min: 0.75,
          max: 2,
          step: 0.05,
          defaultValue: 1,
        },
      },
    },
    callout: {
      pane: "Callout",
      colors: {
        border: "--docs-callout-border",
        fill: "--docs-callout-body-bg",
        fg: "--docs-callout-fg",
        infoAccent: "--docs-callout-info-accent",
        infoHeaderBg: "--docs-callout-info-header-bg",
        infoHeaderFg: "--docs-callout-info-header-fg",
        decisionAccent: "--docs-callout-decision-accent",
        decisionHeaderBg: "--docs-callout-decision-header-bg",
        decisionHeaderFg: "--docs-callout-decision-header-fg",
        warningAccent: "--docs-callout-warning-accent",
        warningHeaderBg: "--docs-callout-warning-header-bg",
        warningHeaderFg: "--docs-callout-warning-header-fg",
        successAccent: "--docs-callout-success-accent",
        successHeaderBg: "--docs-callout-success-header-bg",
        successHeaderFg: "--docs-callout-success-header-fg",
      },
      lengths: {
        borderWidth: {
          cssVar: "--docs-callout-border-width",
          min: 0,
          max: 4,
          step: 0.5,
          defaultValue: 1,
        },
        // Light default; the dark block keeps the global --radius corner and
        // the component's own fallback is the unthemed `rounded-lg`.
        radius: {
          cssVar: "--docs-callout-radius",
          min: 0,
          max: 24,
          step: 1,
          defaultValue: 4,
          fallback: "0.5rem",
        },
        padX: { cssVar: "--docs-callout-pad-x", min: 0, max: 40, step: 1, defaultValue: 16 },
        headerPadY: {
          cssVar: "--docs-callout-header-pad-y",
          min: 0,
          max: 32,
          step: 1,
          defaultValue: 12,
        },
        bodyPadY: {
          cssVar: "--docs-callout-body-pad-y",
          min: 0,
          max: 32,
          step: 1,
          defaultValue: 14,
        },
        titleTextSize: {
          cssVar: "--docs-callout-title-text-size",
          min: 10,
          max: 24,
          step: 0.5,
          defaultValue: 14,
        },
        iconSize: { cssVar: "--docs-callout-icon-size", min: 0, max: 32, step: 1, defaultValue: 16 },
        margin: { cssVar: "--docs-callout-margin", min: 0, max: 64, step: 1, defaultValue: 16 },
      },
      numbers: {
        titleWeight: {
          cssVar: "--docs-callout-title-weight",
          min: 300,
          max: 900,
          step: 50,
          defaultValue: 700,
        },
        bodyTextScale: {
          cssVar: "--docs-callout-body-text-scale",
          min: 0.6,
          max: 1.5,
          step: 0.05,
          defaultValue: 1,
        },
      },
    },
    divider: {
      pane: "Divider",
      colors: { color: "--docs-divider-color" },
      lengths: {
        thickness: { cssVar: "--docs-divider-thickness", min: 0, max: 8, step: 0.5, defaultValue: 1 },
      },
      numbers: {
        spacing: {
          cssVar: "--docs-divider-spacing",
          min: 0,
          max: 6,
          step: 0.05,
          defaultValue: 2.8571429,
          fallback: "1.3333333",
        },
      },
    },
    image: mediaTokens("Image", "--docs-image"),
    video: mediaTokens("Video", "--docs-video"),
  };
  /** The approved callout palette: [light, dark] per tone token. */
  const CALLOUT_PALETTE: Record<string, [string, string]> = {
    "--docs-callout-fg": ["#30343b", "#e4e7eb"],
    "--docs-callout-info-accent": ["#1683c7", "#69b9e8"],
    "--docs-callout-info-header-bg": ["#e8f4fb", "#182e3b"],
    "--docs-callout-info-header-fg": ["#15384d", "#d9f1ff"],
    "--docs-callout-decision-accent": ["#7657a4", "#bda4df"],
    "--docs-callout-decision-header-bg": ["#f2eef8", "#2c2538"],
    "--docs-callout-decision-header-fg": ["#3f3158", "#eee5fa"],
    "--docs-callout-warning-accent": ["#a86608", "#e6b35e"],
    "--docs-callout-warning-header-bg": ["#fbf2df", "#352b1b"],
    "--docs-callout-warning-header-fg": ["#553606", "#fae5bb"],
    "--docs-callout-success-accent": ["#287c55", "#7bc9a2"],
    "--docs-callout-success-header-bg": ["#eaf5ef", "#1d3028"],
    "--docs-callout-success-header-fg": ["#214d39", "#d9f4e5"],
  };
  const LABELS: Record<string, string> = {
    fg: "Text",
    bg: "Background",
    border: "Border",
    fill: "Fill",
    marker: "Marker",
    caption: "Caption",
    color: "Color",
    spacing: "Spacing (em)",
    weight: "Weight",
    marginTop: "Space above",
    marginBottom: "Space below",
    h1Size: "H1 size (em)",
    h2Size: "H2 size (em)",
    h3Size: "H3 size (em)",
    itemGap: "Item gap",
    borderWidth: "Border width",
    indent: "Indent",
    padY: "Padding Y",
    textScale: "Text scale",
    infoAccent: "Info accent",
    infoHeaderBg: "Info header background",
    infoHeaderFg: "Info header text",
    decisionAccent: "Decision accent",
    decisionHeaderBg: "Decision header background",
    decisionHeaderFg: "Decision header text",
    warningAccent: "Warning / risk accent",
    warningHeaderBg: "Warning / risk header background",
    warningHeaderFg: "Warning / risk header text",
    successAccent: "Success accent",
    successHeaderBg: "Success header background",
    successHeaderFg: "Success header text",
    radius: "Corner radius",
    padX: "Padding X",
    headerPadY: "Header padding Y",
    bodyPadY: "Body padding Y",
    titleTextSize: "Title text size",
    titleWeight: "Title weight",
    iconSize: "Icon size",
    bodyTextScale: "Body text scale",
    margin: "Margin",
    thickness: "Thickness",
    captionTextSize: "Caption text size",
    captionGap: "Caption gap",
  };

  const viewerSource = (path: string) =>
    readFileSync(new URL(`../../../../docs-viewer/src/${path}`, import.meta.url), "utf8");
  const semanticCss = readFileSync(new URL("../theme/semantic.css", import.meta.url), "utf8");
  const indexCss = readFileSync(new URL("../index.css", import.meta.url), "utf8");
  const blockClasses = viewerSource("render/block-classes.ts");
  const calloutSource = viewerSource("components/rich-text/CalloutDocsBlock.tsx");
  /** Where each block's tokens are read. The list marker color is host CSS. */
  const CONSUMERS: Record<string, string> = {
    paragraph: blockClasses,
    heading: blockClasses,
    "list-item": blockClasses + viewerSource("styles/list-markers.css").replaceAll(", ", ","),
    quote: blockClasses,
    callout: calloutSource.replaceAll(", #", ",#"),
    divider: viewerSource("components/rich-text/divider.tsx"),
    image: viewerSource("components/rich-text/image.tsx"),
    video: viewerSource("components/rich-text/VideoDocsBlock.tsx"),
  };
  const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

  it("registers exactly the pinned tokens for every rich-text block", () => {
    for (const [file, { colors, lengths, numbers }] of Object.entries(BLOCKS)) {
      const entry = THEME_TOKEN_REGISTRY[file];
      expect(Object.keys(entry).sort()).toEqual(
        [...Object.keys(colors), ...Object.keys(lengths), ...Object.keys(numbers)].sort(),
      );
      for (const [key, cssVar] of Object.entries(colors)) {
        expect(entry[key]).toEqual({ vars: [cssVar], kind: "color" });
      }
      for (const [key, { cssVar, min, max, step, defaultValue }] of Object.entries(lengths)) {
        expect(entry[key]).toEqual({
          vars: [cssVar],
          kind: "length",
          unit: "px",
          min,
          max,
          step,
          defaultValue,
        });
      }
      for (const [key, { cssVar, min, max, step, defaultValue }] of Object.entries(numbers)) {
        expect(entry[key]).toEqual({ vars: [cssVar], kind: "number", min, max, step, defaultValue });
      }
    }
  });

  it("points the callout's border, fill and text knobs at vars the callout reads", () => {
    // Regression: `border` and `fill` used to write the shared
    // --docs-viewer-callout-* palette vars, which the redesigned callout never
    // read (they tinted the QUOTE instead), and `fg` was re-declared on the
    // callout element, shadowing the rail's root-level override. All three
    // were dead sliders.
    const registered = Object.values(THEME_TOKEN_REGISTRY).flatMap((tokens) =>
      Object.values(tokens).flatMap((token) => token.vars),
    );
    expect(registered).not.toContain("--docs-viewer-callout-border");
    expect(registered).not.toContain("--docs-viewer-callout-fill");
    for (const cssVar of Object.values(BLOCKS.callout.colors)) {
      // Read, with a fallback...
      expect(CONSUMERS.callout).toContain(`var(${cssVar},`);
      // ...and never declared by the component, on any selector.
      expect(calloutSource).not.toMatch(new RegExp(`${cssVar}:\\s`));
    }
  });

  it("declares every var in both semantic.css blocks at the registry default", () => {
    for (const [file, { colors, lengths, numbers }] of Object.entries(BLOCKS)) {
      for (const cssVar of Object.values(colors)) {
        // The callout frame color is deliberately undeclared: unset, the
        // frame follows each tone's accent.
        const expected = cssVar === "--docs-callout-border" ? 0 : 2;
        expect(`${cssVar} ×${occurrences(semanticCss, `  ${cssVar}: `)}`).toBe(
          `${cssVar} ×${expected}`,
        );
      }
      for (const { cssVar, defaultValue, declared } of Object.values(lengths)) {
        if (file === "callout" && cssVar === "--docs-callout-radius") {
          // One default, two modes: light is the registry default, dark keeps
          // the global --radius corner it has always rendered.
          expect(occurrences(semanticCss, `  ${cssVar}: ${defaultValue}px;`)).toBe(1);
          expect(occurrences(semanticCss, `  ${cssVar}: var(--radius);`)).toBe(1);
          continue;
        }
        const declaration = `  ${cssVar}: ${declared ?? `${defaultValue}px`};`;
        expect(`${declaration} ×${occurrences(semanticCss, declaration)}`).toBe(
          `${declaration} ×2`,
        );
      }
      for (const { cssVar, defaultValue } of Object.values(numbers)) {
        const declaration = `  ${cssVar}: ${defaultValue};`;
        expect(`${declaration} ×${occurrences(semanticCss, declaration)}`).toBe(
          `${declaration} ×2`,
        );
      }
    }
    // The callout palette is declared per mode, and each literal is the one
    // the component falls back to when no theme layer is present.
    for (const [cssVar, [light, dark]] of Object.entries(CALLOUT_PALETTE)) {
      expect(occurrences(semanticCss, `  ${cssVar}: ${light};`)).toBe(1);
      expect(occurrences(semanticCss, `  ${cssVar}: ${dark};`)).toBe(1);
      expect(occurrences(calloutSource, `var(${cssVar}, ${light})`)).toBe(1);
      expect(occurrences(calloutSource, `var(${cssVar}, ${dark})`)).toBe(1);
    }
    expect(occurrences(semanticCss, "  --docs-callout-body-bg: var(--background);")).toBe(2);
    expect(occurrences(semanticCss, "  --docs-quote-bg: var(--docs-viewer-callout-fill);")).toBe(2);
    expect(occurrences(semanticCss, "  --docs-list-item-fg: var(--docs-viewer-text-body);")).toBe(2);
  });

  it("wires every var into its consumer with a literal fallback", () => {
    // A registered knob the component never reads is a dead slider (the
    // state-shape rowPad bug): every var must appear as `var(<name>,<fallback>)`.
    for (const [file, { colors, lengths, numbers }] of Object.entries(BLOCKS)) {
      const source = CONSUMERS[file];
      for (const cssVar of Object.values(colors)) {
        expect(`${file}: ${source.includes(`var(${cssVar},`) ? cssVar : "MISSING"}`).toBe(
          `${file}: ${cssVar}`,
        );
      }
      for (const { cssVar, defaultValue, fallback } of Object.values(lengths)) {
        const reader = `var(${cssVar},${fallback ?? `${defaultValue}px`})`;
        expect(`${file}: ${source.includes(reader) ? reader : "MISSING"}`).toBe(
          `${file}: ${reader}`,
        );
      }
      for (const { cssVar, defaultValue, fallback } of Object.values(numbers)) {
        const reader = `var(${cssVar},${fallback ?? defaultValue})`;
        expect(`${file}: ${source.includes(reader) ? reader : "MISSING"}`).toBe(
          `${file}: ${reader}`,
        );
      }
    }
    // The light-mode callout corner rule reads the same token first.
    expect(calloutSource).toContain("border-radius:var(--docs-callout-radius,4px) !important");
  });

  it("drops the hardcoded utilities the tokens replaced", () => {
    // A literal left beside its token would shadow the knob. Comments are
    // stripped first: they name the old utilities on purpose.
    const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");
    const absent = (source: string, literals: string[]) =>
      literals.filter((literal) => code(source).includes(literal));

    expect(
      absent(blockClasses, [
        '"my-3 ',
        "mt-6 mb-3",
        "font-semibold",
        "text-foreground",
        '"my-1 flex',
        "my-4 border-l-2",
        "border-l-2",
        "pl-3",
      ]),
    ).toEqual([]);
    expect(absent(CONSUMERS.divider, ["my-6"])).toEqual([]);
    for (const source of [CONSUMERS.image, CONSUMERS.video]) {
      expect(
        absent(source, ["not-prose my-4", "mt-1 text-xs", "rounded-md border border-["]),
      ).toEqual([]);
    }
    expect(
      absent(calloutSource, [
        "not-prose my-4",
        "rounded-lg",
        "px-4 py-3",
        "h-4 w-4",
        "text-sm font-bold",
        "border-radius:4px !important",
      ]),
    ).toEqual([]);
  });

  it("keeps the workbench's unlayered prose rules on the same tokens", () => {
    // index.css rules sit outside every cascade layer, so they beat the
    // block utilities: a property they set must read the block's token.
    expect(indexCss).toContain("background: var(--docs-quote-bg);");
    expect(indexCss).toContain("border-color: var(--docs-quote-border);");
    expect(indexCss).toContain("color: var(--docs-quote-fg);");
    expect(indexCss).not.toContain("background: var(--docs-viewer-callout-fill)");
    expect(indexCss).toContain("color: var(--docs-paragraph-fg);");
    expect(indexCss).toContain("color: var(--docs-heading-fg);");
    expect(indexCss).toContain("color: var(--docs-list-item-fg);");
    expect(indexCss).toContain("color: var(--docs-callout-fg);");
    // Typography's `h2 + *` margin reset, restated for the edit surface now
    // that the blocks' margin-top utilities out-order it.
    expect(indexCss).toContain(
      ".docs-editor-prosemirror :where(h2, h3, h4) + :where(p, blockquote, li) {\n  margin-top: 0;\n}",
    );
  });

  it("writes margins as margin-top/-bottom utilities so they out-order Typography", () => {
    // Tailwind emits `my-*` (margin-block) BEFORE the Typography plugin's
    // rules and `mt-*`/`mb-*` AFTER them; only the longhand pair lets a
    // spacing knob win on a `prose` host. The `not-prose` figures and the
    // callout are exempt from Typography, so `my-[…]` is fine there.
    for (const cssVar of [
      "--docs-paragraph-spacing",
      "--docs-quote-spacing",
      "--docs-list-item-gap",
      "--docs-heading-margin-top",
      "--docs-heading-margin-bottom",
    ]) {
      expect(blockClasses).not.toMatch(new RegExp(`my-\\[[^\\]]*${cssVar}`));
    }
    expect(CONSUMERS.divider).not.toMatch(/my-\[[^\]]*--docs-divider-spacing/);
    expect(blockClasses).toContain("mt-[calc(var(--docs-paragraph-spacing,0.6666667)*1em)]");
    expect(blockClasses).toContain("mb-[calc(var(--docs-paragraph-spacing,0.6666667)*1em)]");
    expect(blockClasses).toContain("mt-[calc(var(--docs-quote-spacing,0.8888889)*1em)]");
    expect(blockClasses).toContain("mb-[calc(var(--docs-quote-spacing,0.8888889)*1em)]");
    expect(blockClasses).toContain("mt-[var(--docs-list-item-gap,4px)]");
    expect(blockClasses).toContain("mb-[var(--docs-list-item-gap,4px)]");
    expect(CONSUMERS.divider).toContain("mt-[calc(var(--docs-divider-spacing,1.3333333)*1em)]");
    expect(CONSUMERS.divider).toContain("mb-[calc(var(--docs-divider-spacing,1.3333333)*1em)]");
  });

  it("normalizes and applies rich-text overrides onto their CSS vars", () => {
    const settings = normalizeSettings({
      components: {
        paragraph: { fg: "#AABBCC", spacing: "2", unknown: "1" },
        heading: { weight: 800, marginTop: "40px", h1Size: "3", h2Size: "99" },
        "list-item": { fg: "#112233", itemGap: "10px" },
        quote: { bg: "#445566", borderWidth: "4px", indent: "20px", textScale: "1.5" },
        callout: {
          border: "#010203",
          fill: "#040506",
          fg: "#070809",
          warningAccent: "#0A0B0C",
          radius: "12px",
          titleWeight: "500",
          bodyTextScale: "0.8",
        },
        divider: { thickness: "3px", spacing: "1.5" },
        image: { radius: "0px", captionTextSize: "14px" },
        video: { borderWidth: "2px", margin: "32px" },
      },
    });

    expect(settings.components).toEqual({
      paragraph: { fg: "#aabbcc", spacing: "2" },
      // h2Size 99 is out of range and dropped.
      heading: { weight: "800", marginTop: "40px", h1Size: "3" },
      "list-item": { fg: "#112233", itemGap: "10px" },
      quote: { bg: "#445566", borderWidth: "4px", indent: "20px", textScale: "1.5" },
      callout: {
        border: "#010203",
        fill: "#040506",
        fg: "#070809",
        warningAccent: "#0a0b0c",
        radius: "12px",
        titleWeight: "500",
        bodyTextScale: "0.8",
      },
      divider: { thickness: "3px", spacing: "1.5" },
      image: { radius: "0px", captionTextSize: "14px" },
      video: { borderWidth: "2px", margin: "32px" },
    });
    expect(styleRailVars(settings)).toMatchObject({
      "--docs-paragraph-fg": "#aabbcc",
      "--docs-paragraph-spacing": "2",
      "--docs-heading-weight": "800",
      "--docs-heading-margin-top": "40px",
      "--docs-heading-h1-size": "3",
      "--docs-list-item-fg": "#112233",
      "--docs-list-item-gap": "10px",
      "--docs-quote-bg": "#445566",
      "--docs-quote-border-width": "4px",
      "--docs-quote-indent": "20px",
      "--docs-quote-text-scale": "1.5",
      "--docs-callout-border": "#010203",
      "--docs-callout-body-bg": "#040506",
      "--docs-callout-fg": "#070809",
      "--docs-callout-warning-accent": "#0a0b0c",
      "--docs-callout-radius": "12px",
      "--docs-callout-title-weight": "500",
      "--docs-callout-body-text-scale": "0.8",
      "--docs-divider-thickness": "3px",
      "--docs-divider-spacing": "1.5",
      "--docs-image-radius": "0px",
      "--docs-image-caption-text-size": "14px",
      "--docs-video-border-width": "2px",
      "--docs-video-margin": "32px",
    });
  });

  it("removes every geometry override when its knob sits at the registry default", () => {
    const components: Record<string, Record<string, string>> = {};
    for (const [file, { lengths, numbers }] of Object.entries(BLOCKS)) {
      components[file] = {};
      for (const [key, { defaultValue }] of Object.entries(lengths)) {
        components[file][key] = `${defaultValue}px`;
      }
      for (const [key, { defaultValue }] of Object.entries(numbers)) {
        components[file][key] = String(defaultValue);
      }
    }
    const settings = normalizeSettings({ components });
    const vars = styleRailVars(settings);
    for (const [file, { lengths, numbers }] of Object.entries(BLOCKS)) {
      for (const [key, { cssVar }] of Object.entries({ ...lengths, ...numbers })) {
        expect(`${cssVar}: ${vars[cssVar]}`).toBe(`${cssVar}: null`);
        expect(isLeafOverridden(settings, componentLeaf(file, key))).toBe(false);
      }
    }
  });

  it("renders every rich-text pane's knobs with their sidebar labels", () => {
    render(<RailHarness />);
    for (const [file, { pane, lengths, numbers }] of Object.entries(BLOCKS)) {
      openPane(pane);
      for (const key of Object.keys(THEME_TOKEN_REGISTRY[file])) {
        const label = LABELS[key];
        expect(`${file}.${key}: ${label}`).not.toBe(`${file}.${key}: undefined`);
        expect(`${file}.${key}: ${screen.queryAllByText(label).length > 0}`).toBe(
          `${file}.${key}: true`,
        );
      }
      // Every registry key has a human label: no raw camelCase key leaks.
      const unlabelled = Object.keys(THEME_TOKEN_REGISTRY[file]).filter(
        (key) => /[A-Z]/.test(key) && screen.queryByText(key) !== null,
      );
      expect(unlabelled).toEqual([]);
      // Each slider starts at the registry default, inside its range.
      for (const [key, { min, max, step, defaultValue }] of Object.entries({
        ...lengths,
        ...numbers,
      })) {
        const label = LABELS[key];
        const slider = screen
          .getAllByText(label)
          .map((node) => node.closest("label")?.querySelector('input[type="range"]'))
          .find((input): input is HTMLInputElement => Boolean(input));
        expect(`${file}.${key}: ${slider ? "slider" : "MISSING"}`).toBe(`${file}.${key}: slider`);
        expect(slider).toHaveProperty("min", String(min));
        expect(slider).toHaveProperty("max", String(max));
        expect(slider).toHaveProperty("step", String(step));
        expect(
          slider?.closest("label")?.textContent?.includes(
            `${defaultValue}${key in lengths ? "px" : ""}`,
          ),
        ).toBe(true);
      }
    }
  });

  it("stores a moved rich-text slider with its unit and counts it on the block's pane", () => {
    render(<RailHarness />);
    openPane("Quote");
    const slider = (label: string) =>
      screen
        .getAllByText(label)
        .map((node) => node.closest("label")?.querySelector('input[type="range"]'))
        .find((input): input is HTMLInputElement => Boolean(input)) as HTMLInputElement;

    fireEvent.change(slider("Border width"), { target: { value: "4" } });
    fireEvent.change(slider("Spacing (em)"), { target: { value: "2" } });

    expect(JSON.parse(screen.getByTestId("component-settings").textContent ?? "null")).toEqual({
      quote: { borderWidth: "4px", spacing: "2" },
    });
    expect(screen.getByRole("button", { name: "Quote, 2 overrides" })).toBeTruthy();
  });
});

describe("style rail repo baseline", () => {
  /**
   * The repo-side settings file: the `railDefaults` block of
   * `themes/<id>/theme.json`, exactly as the theme loader hands it back.
   * Every value here differs from stock so the two reference points can be
   * told apart.
   */
  const repoRailDefaults = {
    typography: { fontSize: 16 },
    layout: { contentWidth: 88, wideWidth: 2000, contentMargin: 120 },
  };

  it("installs the repo file as the baseline, validated against stock", () => {
    const baseline = setStyleRailBaseline({
      accent: "chartreuse", // not a real accent -> falls back to stock
      typography: { fontSize: 99 }, // out of range -> clamped to the cap
      layout: { wideWidth: 2000 },
    });

    expect(baseline.accent).toBe(DEFAULT_STYLE_RAIL_SETTINGS.accent);
    expect(baseline.typography.fontSize).toBe(28);
    expect(baseline.layout.wideWidth).toBe(2000);
    // Keys the repo file never mentions stay at stock.
    expect(baseline.layout.contentMargin).toBe(DEFAULT_STYLE_RAIL_SETTINGS.layout.contentMargin);
    expect(getStyleRailBaseline()).toBe(baseline);
  });

  it("stays at stock when the repo has saved nothing yet", () => {
    expect(setStyleRailBaseline(undefined)).toBe(DEFAULT_STYLE_RAIL_SETTINGS);
    expect(setStyleRailBaseline({})).toEqual(DEFAULT_STYLE_RAIL_SETTINGS);
  });

  it("makes the repo baseline the default for keys a blob omits", () => {
    setStyleRailBaseline(repoRailDefaults);

    const settings = normalizeSettings({ accent: "purple" });
    expect(settings.accent).toBe("purple");
    expect(settings.layout.contentMargin).toBe(120);
    expect(settings.typography.fontSize).toBe(16);

    // Stock stays reachable for callers that ask for it explicitly — that
    // is how the baseline itself is loaded.
    expect(
      normalizeSettings({ accent: "purple" }, DEFAULT_STYLE_RAIL_SETTINGS).layout.contentMargin,
    ).toBe(DEFAULT_STYLE_RAIL_SETTINGS.layout.contentMargin);
  });

  it("layers this browser's stored blob over the repo baseline", () => {
    setStyleRailBaseline(repoRailDefaults);
    // Nothing stored: the repo's settings simply ARE this browser's.
    expect(loadStyleRailSettings().layout.wideWidth).toBe(2000);

    saveStyleRailSettings({
      ...DEFAULT_STYLE_RAIL_SETTINGS,
      layout: { ...DEFAULT_STYLE_RAIL_SETTINGS.layout, wideWidth: 1100 },
    });
    expect(loadStyleRailSettings().layout.wideWidth).toBe(1100);
  });

  it("fills a partial stored blob from the repo, not from stock", () => {
    setStyleRailBaseline(repoRailDefaults);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ accent: "green" }));

    const loaded = loadStyleRailSettings();
    expect(loaded.accent).toBe("green");
    expect(loaded.layout.contentMargin).toBe(120);
    expect(loaded.typography.fontSize).toBe(16);
  });

  it("treats 'at default' as the repo value, so stock now reads as drift", () => {
    setStyleRailBaseline(repoRailDefaults);

    const atBaseline = getStyleRailBaseline();
    expect(isLeafOverridden(atBaseline, settingLeaf("layout.contentMargin"))).toBe(false);
    expect(isLeafOverridden(atBaseline, settingLeaf("layout.wideWidth"))).toBe(false);
    expect(paneOverrideCount(atBaseline, "layout.editor")).toBe(0);

    // The compiled-in stock settings are the DRIFTED state now: they no
    // longer match what this repo calls default.
    expect(
      isLeafOverridden(DEFAULT_STYLE_RAIL_SETTINGS, settingLeaf("layout.contentMargin")),
    ).toBe(true);
  });

  it("still emits vars for values sitting at the repo baseline", () => {
    setStyleRailBaseline(repoRailDefaults);

    // Not an override in the UI, but semantic.css only knows stock — so
    // these must still be written, or a --theme-locked serve and a static
    // export would render 1040/88 instead of the repo's 2000/120.
    const vars = styleRailVars(getStyleRailBaseline());
    expect(vars["--style-wide-width"]).toBe("2000px");
    expect(vars["--style-content-margin"]).toBe("120px");
    expect(vars["--style-content-width"]).toBe("88ch");
  });

  it("resets to the repo baseline rather than to stock", () => {
    setStyleRailBaseline(repoRailDefaults);
    render(
      <RailHarness
        initial={{ ...DEFAULT_STYLE_RAIL_SETTINGS, accent: "red" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));

    const settings = JSON.parse(
      screen.getByTestId("rail-settings").textContent ?? "{}",
    ) as StyleRailSettings;
    expect(settings.accent).toBe("blue");
    expect(settings.layout.contentMargin).toBe(120);
    expect(settings.layout.wideWidth).toBe(2000);
  });

  it("shows the repo save affordance only when the host may author the theme", () => {
    // No handler = a static export or a (possibly) --theme-locked serve,
    // where the server refuses the write with 403 anyway.
    render(<RailHarness />);
    expect(screen.queryByRole("button", { name: "Save style to repo" })).toBeNull();
    cleanup();

    const onSaveStyleToRepo = mock(() => {});
    render(<RailHarness onSaveStyleToRepo={onSaveStyleToRepo} />);
    fireEvent.click(screen.getByRole("button", { name: "Save style to repo" }));
    expect(onSaveStyleToRepo).toHaveBeenCalledTimes(1);
  });
});


describe("page transition styles", () => {
  it("loads older themes with quick fade defaults and clamps incoming settings", () => {
    expect(normalizeSettings({}).transition).toEqual({ type: "fade", fadeOutMs: 80, fadeInMs: 120 });
    expect(normalizeSettings({ transition: { type: "bad", fadeOutMs: -2, fadeInMs: 9999 } }).transition)
      .toEqual({ type: "fade", fadeOutMs: 0, fadeInMs: 800 });
  });

  it("carries saved transition settings into consumer CSS and resets to the theme", () => {
    const baseline = setStyleRailBaseline({ transition: { type: "none", fadeInMs: 200 } });
    const loaded = normalizeSettings({ transition: { fadeOutMs: 50 } });
    expect(loaded.transition).toEqual({ type: "none", fadeOutMs: 50, fadeInMs: 200 });
    const vars = styleRailVars(loaded);
    expect(vars["--docs-page-transition-type"]).toBe("none");
    expect(vars["--docs-page-fade-out"]).toBe("50ms");
    expect(vars["--docs-page-fade-in"]).toBe("200ms");
    expect(paneOverrideCount(loaded, "layout.transitions")).toBe(1);
    expect(paneOverrideCount(baseline, "layout.transitions")).toBe(0);
  });
});
