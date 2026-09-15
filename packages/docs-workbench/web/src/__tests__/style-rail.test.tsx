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

const STORAGE_KEY = "docs-style-rail-settings.v1";
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
      "max-width: var(--style-content-width,100ch);",
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

  it("DocPage's left-margin fallback equals stock layout.contentMargin", () => {
    expect(DEFAULT_STYLE_RAIL_SETTINGS.layout.contentMargin).toBe(88);
    expect(layoutSource).toContain("px-[var(--style-content-margin,88px)]");
  });

  it("the wide lane's fallback equals stock layout.wideWidth", () => {
    expect(DEFAULT_STYLE_RAIL_SETTINGS.layout.wideWidth).toBe(1040);
    expect(laneSource).toContain("max-w-[var(--style-wide-width,1040px)]");
  });

  it("the text lane's fallback equals stock layout.contentWidth", () => {
    expect(DEFAULT_STYLE_RAIL_SETTINGS.layout.contentWidth).toBe(100);
    expect(laneSource).toContain("max-w-[var(--style-content-width,100ch)]");
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
      "Language badge",
      "Annotation accent",
      "Line numbers",
      "Gutter background",
      "Zebra stripe",
      "Rules",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
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
});

describe("style rail interaction-surface tokens", () => {
  it("registers every restyled interaction-surface var under the interaction-surface entry", () => {
    const entry = THEME_TOKEN_REGISTRY["interaction-surface"];
    expect(entry.border).toEqual({ vars: ["--docs-interaction-border"], kind: "color" });
    expect(entry.bg).toEqual({ vars: ["--docs-interaction-bg"], kind: "color" });
    expect(entry.rule).toEqual({ vars: ["--docs-interaction-rule"], kind: "color" });
    expect(entry.headerBg).toEqual({ vars: ["--docs-interaction-header-bg"], kind: "color" });
    expect(entry.headerFg).toEqual({ vars: ["--docs-interaction-header-fg"], kind: "color" });
    expect(entry.sigName).toEqual({ vars: ["--docs-interaction-sig-name"], kind: "color" });
    expect(entry.sigType).toEqual({ vars: ["--docs-interaction-sig-type"], kind: "color" });
    expect(entry.sigPunct).toEqual({ vars: ["--docs-interaction-sig-punct"], kind: "color" });
    expect(entry.noteName).toEqual({ vars: ["--docs-interaction-note-name"], kind: "color" });
    expect(entry.noteType).toEqual({ vars: ["--docs-interaction-note-type"], kind: "color" });
    expect(entry.noteFg).toEqual({ vars: ["--docs-interaction-note-fg"], kind: "color" });
    expect(entry.childRule).toEqual({ vars: ["--docs-interaction-child-rule"], kind: "color" });
    expect(entry.rowPad).toEqual({
      vars: ["--docs-interaction-row-pad"],
      kind: "length",
      min: 4,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 8,
    });
    expect(entry.opGap).toEqual({
      vars: ["--docs-interaction-op-gap"],
      kind: "length",
      min: 6,
      max: 28,
      step: 1,
      unit: "px",
      defaultValue: 14,
    });
  });

  it("normalizes and applies interaction-surface overrides onto their CSS vars", () => {
    const settings = normalizeSettings({
      components: {
        "interaction-surface": {
          rule: "#112233",
          headerBg: "#AABBCC",
          sigName: "#0E7490",
          noteFg: "#445566",
          childRule: "#778899",
          rowPad: "10px",
          opGap: 20,
          unknown: "#000000",
        },
      },
    });

    expect(settings.components).toEqual({
      "interaction-surface": {
        rule: "#112233",
        headerBg: "#aabbcc",
        sigName: "#0e7490",
        noteFg: "#445566",
        childRule: "#778899",
        rowPad: "10px",
        opGap: "20px",
      },
    });
    expect(styleRailVars(settings)).toMatchObject({
      "--docs-interaction-rule": "#112233",
      "--docs-interaction-header-bg": "#aabbcc",
      "--docs-interaction-sig-name": "#0e7490",
      "--docs-interaction-note-fg": "#445566",
      "--docs-interaction-child-rule": "#778899",
      "--docs-interaction-row-pad": "10px",
      "--docs-interaction-op-gap": "20px",
    });
  });

  it("renders the Interaction surface knobs with their sidebar labels", () => {
    render(<RailHarness />);
    openPane("Interaction surface");

    for (const label of [
      "Border",
      "Background",
      "Rules",
      "Header background",
      "Header text",
      "Signature name",
      "Signature type",
      "Signature punctuation",
      "Note name",
      "Note type",
      "Note text",
      "Child rule",
      "Row padding",
      "Card gap",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    const rowPad = screen.getByLabelText(/Row padding/) as HTMLInputElement;
    expect(rowPad).toHaveProperty("min", "4");
    expect(rowPad).toHaveProperty("max", "16");
    expect(rowPad).toHaveProperty("value", "8");
    const opGap = screen.getByLabelText(/Card gap/) as HTMLInputElement;
    expect(opGap).toHaveProperty("min", "6");
    expect(opGap).toHaveProperty("max", "28");
    expect(opGap).toHaveProperty("value", "14");
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
      min: 4,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 10,
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
      "Muted fill",
      "Rules",
      "Header background",
      "Description text",
      "Child rule",
      "Row padding",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    const rowPad = screen.getByLabelText(/Row padding/) as HTMLInputElement;
    expect(rowPad).toHaveProperty("min", "4");
    expect(rowPad).toHaveProperty("max", "24");
    expect(rowPad).toHaveProperty("value", "10");
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
    // The depth cycle: five hues plus the loop-keyword accent that sits
    // outside it. The component re-declares one var per nesting level, so
    // these are the only colors the rail needs for the whole tree.
    for (const level of [1, 2, 3, 4, 5]) {
      expect(entry[`cycle${level}`]).toEqual({
        vars: [`--docs-process-outline-cycle-${level}`],
        kind: "color",
      });
    }
    expect(entry.keywordFg).toEqual({
      vars: ["--docs-process-outline-keyword-fg"],
      kind: "color",
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
    // Branch and root separation used to be hard-coded in the component
    // (a 14px margin); both are knobs now.
    expect(entry.branchGap).toEqual({
      vars: ["--docs-process-outline-branch-gap"],
      kind: "length",
      min: 0,
      max: 48,
      step: 1,
      unit: "px",
      defaultValue: 20,
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
      defaultValue: 4,
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
      min: 10,
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
      min: 10,
      max: 22,
      step: 0.5,
      unit: "px",
      defaultValue: 13.5,
    });
    expect(entry.emptyTextSize).toEqual({
      vars: ["--docs-process-outline-empty-text-size"],
      kind: "length",
      min: 9,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12,
    });
    // Notes are subordinate now: their own smaller size, their own line
    // rhythm, an inset that pulls the card under its parent step, and a rule
    // width for the accented left edge.
    expect(entry.noteTextSize).toEqual({
      vars: ["--docs-process-outline-note-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 11.5,
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
      defaultValue: 10,
    });
    // Notes render BOXLESS by default — plain bullets under their parent step.
    // The card is still expressible, purely in tokens: border, rule and padding
    // all default to zero and the classic theme sets them to get its box back.
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
      defaultValue: 0,
    });
    expect(entry.notePadY).toEqual({
      vars: ["--docs-process-outline-note-pad-y"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 0,
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
    // Mix strengths are unitless percentages: the component multiplies them
    // by 1% at the use site, where the depth color actually exists.
    expect(entry.noteAccent).toEqual({
      vars: ["--docs-process-outline-note-accent"],
      kind: "number",
      min: 0,
      max: 100,
      step: 5,
      defaultValue: 55,
    });
    expect(entry.chipTint).toEqual({
      vars: ["--docs-process-outline-chip-tint"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 13,
    });
    expect(entry.chipInkMix).toEqual({
      vars: ["--docs-process-outline-chip-ink-mix"],
      kind: "number",
      min: 0,
      max: 100,
      step: 5,
      defaultValue: 60,
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
      min: 0,
      max: 14,
      step: 0.5,
      unit: "px",
      defaultValue: 9.5,
    });
    expect(entry.traceTint).toEqual({
      vars: ["--docs-process-outline-trace-tint"],
      kind: "number",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 16,
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
      defaultValue: 22,
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
    // Hand-editing a line shows the caret and nothing else unless a theme asks
    // for the ring; there is no block-wide edit tint at any value.
    expect(entry.focusRing).toEqual({
      vars: ["--docs-process-outline-focus-ring"],
      kind: "length",
      min: 0,
      max: 3,
      step: 0.5,
      unit: "px",
      defaultValue: 0,
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
          branchGap: "20px",
          rootGap: "30px",
          arrowGap: "4px",
          lineHeight: "22px",
          textSize: "12.5px",
          rootTextSize: "13.5px",
          emptyTextSize: "12px",
          noteTextSize: "11.5px",
          noteLineHeight: "17px",
          noteInset: "10px",
          noteBorderWidth: "0px",
          noteRuleWidth: "0px",
          notePadY: "0px",
          notePadX: "0px",
          noteAccent: "55",
          chipTint: "13",
          chipInkMix: "60",
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
  });

  it("renders the Process Outline knobs with their sidebar labels", () => {
    render(<RailHarness />);
    openPane("Process Outline");

    for (const label of [
      "Ink",
      "Rail",
      "Depth 1 color",
      "Depth 5 color",
      "Loop keyword",
      "Note text",
      "Note background",
      "Note border",
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
    expect(chipTint).toHaveProperty("value", "13");
    const arrowGap = screen.getByLabelText(/Arrow gap/) as HTMLInputElement;
    expect(arrowGap).toHaveProperty("min", "0");
    expect(arrowGap).toHaveProperty("max", "16");
    expect(arrowGap).toHaveProperty("value", "4");
    const lineHeight = screen.getByLabelText(/Line height/) as HTMLInputElement;
    expect(lineHeight).toHaveProperty("min", "16");
    expect(lineHeight).toHaveProperty("max", "40");
    expect(lineHeight).toHaveProperty("value", "22");
    const textSize = screen.getByLabelText(/^Text size/) as HTMLInputElement;
    expect(textSize).toHaveProperty("min", "10");
    expect(textSize).toHaveProperty("max", "18");
    expect(textSize).toHaveProperty("value", "12.5");
    const noteTextSize = screen.getByLabelText(/Note text size/) as HTMLInputElement;
    expect(noteTextSize).toHaveProperty("min", "10");
    expect(noteTextSize).toHaveProperty("max", "18");
    expect(noteTextSize).toHaveProperty("value", "11.5");
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
  it("registers the sequence frame border var", () => {
    expect(THEME_TOKEN_REGISTRY.sequence.border).toEqual({
      vars: ["--docs-sequence-border"],
      kind: "color",
    });
  });

  it("renders the Sequence pane Border control", () => {
    render(<RailHarness />);
    openPane("Sequence");

    expect(screen.getByText("Border")).toBeTruthy();
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
    expect(baseline.typography.fontSize).toBe(20);
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
