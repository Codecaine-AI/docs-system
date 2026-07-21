import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";

import {
  DEFAULT_STYLE_RAIL_SETTINGS,
  StyleRail,
  loadStyleRailSettings,
  normalizeSettings,
  saveStyleRailSettings,
  styleRailVars,
  type StyleRailSettings,
} from "../shell/StyleRail";

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
    });
    expect(normalizeSettings({ accent: "purple" }).sidebar).toEqual(
      DEFAULT_STYLE_RAIL_SETTINGS.sidebar,
    );

    expect(
      normalizeSettings({
        sidebar: {
          textColor: "#ABCDEF",
          font: "serif",
          fontSize: 99,
          padding: -1,
        },
      }).sidebar,
    ).toEqual({
      textColor: "#abcdef",
      font: "serif",
      fontSize: 20,
      padding: 0,
    });

    expect(
      normalizeSettings({
        sidebar: {
          textColor: 123,
          font: "display",
          fontSize: 0,
          padding: 99,
        },
      }).sidebar,
    ).toEqual({
      textColor: null,
      font: "sans",
      fontSize: 10,
      padding: 16,
    });
  });

  it("emits sidebar overrides and omits them at defaults", () => {
    const defaultVars = styleRailVars(DEFAULT_STYLE_RAIL_SETTINGS);
    expect({
      textColor: defaultVars["--docs-sidebar-item-fg"],
      font: defaultVars["--docs-sidebar-font"],
      fontSize: defaultVars["--docs-sidebar-font-size"],
      padding: defaultVars["--docs-sidebar-item-py"],
    }).toEqual({
      textColor: null,
      font: null,
      fontSize: null,
      padding: null,
    });

    const vars = styleRailVars(
      settingsWithSidebar({
        textColor: "#123456",
        font: "mono",
        fontSize: 17,
        padding: 9,
      }),
    );
    expect(vars["--docs-sidebar-item-fg"]).toBe("#123456");
    expect(vars["--docs-sidebar-font"]).toBe(
      "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace",
    );
    expect(vars["--docs-sidebar-font-size"]).toBe("17px");
    expect(vars["--docs-sidebar-item-py"]).toBe("9px");
  });

  it("renders the Sidebar section and its five controls in the Layout tab", () => {
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
  });
});

describe("style rail component token kinds", () => {
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
