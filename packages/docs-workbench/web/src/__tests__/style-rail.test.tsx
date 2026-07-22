import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";

import {
  DEFAULT_STYLE_RAIL_SETTINGS,
  StyleRail,
  applyStyleRailVars,
  loadStyleRailSettings,
  normalizeSettings,
  saveStyleRailSettings,
  styleRailVars,
  type StyleRailSettings,
} from "../shell/StyleRail";
import {
  THEME_TOKEN_REGISTRY,
  compileThemeCss,
  readThemeDefinition,
} from "../theme/theme-folders";

const STORAGE_KEY = "docs-style-rail-settings.v1";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
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

function RailHarness({ initial = DEFAULT_STYLE_RAIL_SETTINGS }: { initial?: StyleRailSettings }) {
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
        onSelectTheme={() => {}}
        onSettingsChange={setSettings}
        settings={settings}
        themes={[{ id: "default", name: "Default", source: "builtin" }]}
      />
      <output data-testid="list-settings">{JSON.stringify(settings.list)}</output>
      <output data-testid="reference-settings">{JSON.stringify(settings.reference)}</output>
      <output data-testid="component-settings">{JSON.stringify(settings.components)}</output>
      <output data-testid="dark-setting">{String(dark)}</output>
    </>
  );
}

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
    fireEvent.click(screen.getByRole("button", { name: "Components" }));
    fireEvent.click(screen.getByRole("button", { name: "List item" }));

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
    const referencesToggle = screen.getByRole("button", { name: "References" });
    fireEvent.click(referencesToggle);
    const referencesElement = referencesToggle.closest("section")!;
    const referencesSection = within(referencesElement);

    expect(referencesSection.getByText("Text color")).toBeTruthy();
    expect(referencesSection.getByText("Hover underline")).toBeTruthy();
    expect(referencesSection.queryAllByText("Hover color")).toHaveLength(0);
    expect(referencesElement.querySelectorAll("input[type='color']")).toHaveLength(2);

    const iconToggle = referencesSection.getByRole("button", { name: "Icon" });
    fireEvent.click(iconToggle);
    const iconElement = iconToggle.closest("section")!;
    const iconSection = within(iconElement);
    expect(iconElement.querySelectorAll("input[type='color']")).toHaveLength(1);

    fireEvent.change(iconSection.getByLabelText(/Size/), { target: { value: "18" } });
    fireEvent.change(iconSection.getByLabelText(/Spacing/), { target: { value: "7" } });
    fireEvent.change(iconSection.getByLabelText("Position"), { target: { value: "after" } });

    expect(JSON.parse(screen.getByTestId("reference-settings").textContent ?? "null")).toEqual({
      ...DEFAULT_STYLE_RAIL_SETTINGS.reference,
      iconSize: 18,
      iconGap: 7,
      iconPosition: "after",
    });
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

  it("renders the Sidebar section and its nine controls in the Layout tab", () => {
    render(<RailHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Layout" }));
    const sidebarToggle = screen.getByRole("button", { name: "Sidebar" });
    fireEvent.click(sidebarToggle);
    const sidebarSection = within(sidebarToggle.closest("section")!);

    expect(sidebarSection.getByText("Background")).toBeTruthy();
    expect(sidebarSection.getByText("Text color")).toBeTruthy();

    const font = sidebarSection.getByLabelText("Font") as HTMLSelectElement;
    expect(Array.from(font.options, (option) => option.value)).toEqual([
      "sans",
      "serif",
      "mono",
    ]);
    expect(font.value).toBe("sans");

    const textSize = sidebarSection.getByLabelText(/Text size/) as HTMLInputElement;
    expect(textSize).toHaveProperty("min", "10");
    expect(textSize).toHaveProperty("max", "20");
    expect(textSize).toHaveProperty("step", "1");
    expect(textSize).toHaveProperty("value", "14");

    const padding = sidebarSection.getByLabelText(/^Padding/) as HTMLInputElement;
    expect(padding).toHaveProperty("min", "0");
    expect(padding).toHaveProperty("max", "16");
    expect(padding).toHaveProperty("step", "1");
    expect(padding).toHaveProperty("value", "4");

    const indentGuides = sidebarSection.getByLabelText("Indent guides") as HTMLInputElement;
    expect(indentGuides).toHaveProperty("type", "checkbox");
    expect(indentGuides).toHaveProperty("checked", true);
    expect(sidebarSection.getByText("Guide color")).toBeTruthy();

    const guideWidth = sidebarSection.getByLabelText(/Guide width/) as HTMLInputElement;
    expect(guideWidth).toHaveProperty("min", "1");
    expect(guideWidth).toHaveProperty("max", "4");
    expect(guideWidth).toHaveProperty("step", "0.5");
    expect(guideWidth).toHaveProperty("value", "1");

    const guideOpacity = sidebarSection.getByLabelText(/Guide opacity/) as HTMLInputElement;
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
    fireEvent.click(screen.getByRole("button", { name: "Components" }));
    const tableSection = screen.getByRole("button", { name: "Structured table" });
    fireEvent.click(tableSection);

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
    fireEvent.click(screen.getByRole("button", { name: "Components" }));
    fireEvent.click(screen.getByRole("button", { name: "Structured table" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Components" }));
    const codeToggle = screen.getByRole("button", { name: "Code" });
    fireEvent.click(codeToggle);
    const codeSection = within(codeToggle.closest("section")!);

    for (const label of [
      "Language badge",
      "Annotation accent",
      "Line numbers",
      "Gutter background",
      "Zebra stripe",
      "Rules",
    ]) {
      expect(codeSection.getByText(label)).toBeTruthy();
    }
  });

  it("renders metadata-driven code rule/zebra sliders and stores their units", () => {
    render(<RailHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Components" }));
    fireEvent.click(screen.getByRole("button", { name: "Code" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Components" }));
    const linkingToggle = screen.getByRole("button", { name: "Linked panels" });
    fireEvent.click(linkingToggle);
    const linkingSection = within(linkingToggle.closest("section")!);

    for (const label of ["Zebra stripe", "Link highlight", "Pin & rail"]) {
      expect(linkingSection.getByText(label)).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: "Components" }));
    const toggle = screen.getByRole("button", { name: "Interaction surface" });
    fireEvent.click(toggle);
    const section = within(toggle.closest("section")!);

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
      expect(section.getByText(label)).toBeTruthy();
    }

    const rowPad = section.getByLabelText(/Row padding/) as HTMLInputElement;
    expect(rowPad).toHaveProperty("min", "4");
    expect(rowPad).toHaveProperty("max", "16");
    expect(rowPad).toHaveProperty("value", "8");
    const opGap = section.getByLabelText(/Card gap/) as HTMLInputElement;
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
    expect(entry.muted).toEqual({ vars: ["--docs-shape-muted"], kind: "color" });
    expect(entry.rule).toEqual({ vars: ["--docs-shape-rule"], kind: "color" });
    expect(entry.headerBg).toEqual({ vars: ["--docs-shape-header-bg"], kind: "color" });
    expect(entry.descFg).toEqual({ vars: ["--docs-shape-desc-fg"], kind: "color" });
    expect(entry.childRule).toEqual({ vars: ["--docs-shape-child-rule"], kind: "color" });
    expect(entry.rowPad).toEqual({
      vars: ["--docs-shape-row-pad"],
      kind: "length",
      min: 4,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 9,
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
    fireEvent.click(screen.getByRole("button", { name: "Components" }));
    const toggle = screen.getByRole("button", { name: "State shape" });
    fireEvent.click(toggle);
    const section = within(toggle.closest("section")!);

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
      expect(section.getByText(label)).toBeTruthy();
    }

    const rowPad = section.getByLabelText(/Row padding/) as HTMLInputElement;
    expect(rowPad).toHaveProperty("min", "4");
    expect(rowPad).toHaveProperty("max", "16");
    expect(rowPad).toHaveProperty("value", "9");
  });
});

describe("style rail waterfall tokens", () => {
  it("registers every waterfall var under the waterfall entry", () => {
    const entry = THEME_TOKEN_REGISTRY.waterfall;
    expect(entry.ink).toEqual({ vars: ["--docs-waterfall-ink"], kind: "color" });
    expect(entry.rail).toEqual({ vars: ["--docs-waterfall-rail"], kind: "color" });
    expect(entry.noteFg).toEqual({ vars: ["--docs-waterfall-note-fg"], kind: "color" });
    expect(entry.noteBg).toEqual({ vars: ["--docs-waterfall-note-bg"], kind: "color" });
    expect(entry.noteBorder).toEqual({ vars: ["--docs-waterfall-note-border"], kind: "color" });
    expect(entry.codeBg).toEqual({ vars: ["--docs-waterfall-code-bg"], kind: "color" });
    expect(entry.indent).toEqual({
      vars: ["--docs-waterfall-indent"],
      kind: "length",
      min: 16,
      max: 72,
      step: 1,
      unit: "px",
      defaultValue: 36,
    });
    expect(entry.rowGap).toEqual({
      vars: ["--docs-waterfall-row-gap"],
      kind: "length",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      defaultValue: 7,
    });
    expect(entry.arrowGap).toEqual({
      vars: ["--docs-waterfall-arrow-gap"],
      kind: "length",
      min: 0,
      max: 16,
      step: 1,
      unit: "px",
      defaultValue: 4,
    });
    expect(entry.lineHeight).toEqual({
      vars: ["--docs-waterfall-line-height"],
      kind: "length",
      min: 16,
      max: 40,
      step: 1,
      unit: "px",
      defaultValue: 22,
    });
    expect(entry.textSize).toEqual({
      vars: ["--docs-waterfall-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12.5,
    });
    // Note text size defaults to the step text size (semantic.css keeps the
    // var() reference); the registry default is the same literal number.
    expect(entry.noteTextSize).toEqual({
      vars: ["--docs-waterfall-note-text-size"],
      kind: "length",
      min: 10,
      max: 18,
      step: 0.5,
      unit: "px",
      defaultValue: 12.5,
    });
    expect(entry.arrowSize).toEqual({
      vars: ["--docs-waterfall-arrow-size"],
      kind: "length",
      min: 3,
      max: 12,
      step: 0.5,
      unit: "px",
      defaultValue: 6,
    });
    expect(entry.stroke).toEqual({
      vars: ["--docs-waterfall-stroke"],
      kind: "length",
      min: 0.5,
      max: 4,
      step: 0.25,
      unit: "px",
      defaultValue: 1.5,
    });
  });

  it("normalizes and applies waterfall color and geometry overrides onto their CSS vars", () => {
    const settings = normalizeSettings({
      components: {
        waterfall: {
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
      waterfall: {
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
      "--docs-waterfall-ink": "#112233",
      "--docs-waterfall-rail": "#5d6266",
      "--docs-waterfall-note-bg": "#aabbcc",
      "--docs-waterfall-code-bg": "#ddeeff",
      "--docs-waterfall-indent": "48px",
      "--docs-waterfall-row-gap": "10px",
      "--docs-waterfall-arrow-gap": "6px",
      "--docs-waterfall-line-height": "26px",
      "--docs-waterfall-text-size": "14px",
      "--docs-waterfall-note-text-size": "13px",
      "--docs-waterfall-arrow-size": "8px",
      "--docs-waterfall-stroke": "2px",
    });
  });

  it("removes the geometry overrides when the knobs sit at their defaults", () => {
    const settings = normalizeSettings({
      components: {
        waterfall: {
          indent: "36px",
          rowGap: "7px",
          arrowGap: "4px",
          lineHeight: "22px",
          textSize: "12.5px",
          noteTextSize: "12.5px",
          arrowSize: "6px",
          stroke: "1.5px",
        },
      },
    });

    const vars = styleRailVars(settings);
    expect(vars["--docs-waterfall-indent"]).toBeNull();
    expect(vars["--docs-waterfall-row-gap"]).toBeNull();
    expect(vars["--docs-waterfall-arrow-gap"]).toBeNull();
    expect(vars["--docs-waterfall-line-height"]).toBeNull();
    expect(vars["--docs-waterfall-text-size"]).toBeNull();
    expect(vars["--docs-waterfall-note-text-size"]).toBeNull();
    expect(vars["--docs-waterfall-arrow-size"]).toBeNull();
    expect(vars["--docs-waterfall-stroke"]).toBeNull();
  });

  it("renders the Waterfall knobs with their sidebar labels", () => {
    render(<RailHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Components" }));
    const toggle = screen.getByRole("button", { name: "Waterfall" });
    fireEvent.click(toggle);
    const section = within(toggle.closest("section")!);

    for (const label of [
      "Ink",
      "Rail",
      "Note text",
      "Note background",
      "Note border",
      "Code background",
      "Indent",
      "Row gap",
      "Arrow gap",
      "Line height",
      "Text size",
      "Note text size",
      "Arrow size",
      "Stroke",
    ]) {
      expect(section.getByText(label)).toBeTruthy();
    }

    const indent = section.getByLabelText(/^Indent/) as HTMLInputElement;
    expect(indent).toHaveProperty("min", "16");
    expect(indent).toHaveProperty("max", "72");
    expect(indent).toHaveProperty("value", "36");
    const rowGap = section.getByLabelText(/Row gap/) as HTMLInputElement;
    expect(rowGap).toHaveProperty("min", "0");
    expect(rowGap).toHaveProperty("max", "24");
    expect(rowGap).toHaveProperty("value", "7");
    const arrowGap = section.getByLabelText(/Arrow gap/) as HTMLInputElement;
    expect(arrowGap).toHaveProperty("min", "0");
    expect(arrowGap).toHaveProperty("max", "16");
    expect(arrowGap).toHaveProperty("value", "4");
    const lineHeight = section.getByLabelText(/Line height/) as HTMLInputElement;
    expect(lineHeight).toHaveProperty("min", "16");
    expect(lineHeight).toHaveProperty("max", "40");
    expect(lineHeight).toHaveProperty("value", "22");
    const textSize = section.getByLabelText(/^Text size/) as HTMLInputElement;
    expect(textSize).toHaveProperty("min", "10");
    expect(textSize).toHaveProperty("max", "18");
    expect(textSize).toHaveProperty("value", "12.5");
    const noteTextSize = section.getByLabelText(/Note text size/) as HTMLInputElement;
    expect(noteTextSize).toHaveProperty("min", "10");
    expect(noteTextSize).toHaveProperty("max", "18");
    expect(noteTextSize).toHaveProperty("value", "12.5");
    const arrowSize = section.getByLabelText(/Arrow size/) as HTMLInputElement;
    expect(arrowSize).toHaveProperty("min", "3");
    expect(arrowSize).toHaveProperty("max", "12");
    expect(arrowSize).toHaveProperty("value", "6");
    const stroke = section.getByLabelText(/Stroke/) as HTMLInputElement;
    expect(stroke).toHaveProperty("min", "0.5");
    expect(stroke).toHaveProperty("max", "4");
    expect(stroke).toHaveProperty("value", "1.5");
  });
});
