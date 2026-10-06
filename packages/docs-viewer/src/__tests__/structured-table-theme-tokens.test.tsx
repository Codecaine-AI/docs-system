import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { StructuredTableBlock } from "../components/structured-table/StructuredTableDocsBlock";
import { TableGrid } from "../components/structured-table/editor/TableGrid";
import {
  TABLE_PROSE_MEASURE_CLASS,
  TABLE_STICKY_BODY_CELL_CLASSES,
  TABLE_STICKY_HEADER_CELL_CLASSES,
} from "../components/structured-table/table-classes";

afterEach(() => {
  cleanup();
});

/**
 * Every structured-table theme token must reach the DOM on BOTH surfaces — a
 * token the registry lists but no element consumes is a rail slider that does
 * nothing. Each row names the element that carries the token and the exact
 * `var()` it must read, fallback included: the fallback is what renders where
 * semantic.css is absent (static export), so it has to equal that default.
 */
const COLUMNS = ["Stage", "Owner"];
const ROWS = [
  ["Alpha", "ford"],
  ["Beta", "ana"],
];
const noop = () => {};

type Surface = { name: string; render: () => HTMLElement };

const SURFACES: Surface[] = [
  {
    name: "read block",
    render: () =>
      render(<StructuredTableBlock id="tbl" title="Owners" columns={COLUMNS} rows={ROWS} />)
        .container,
  },
  {
    name: "editor grid (editable)",
    render: () =>
      render(
        <TableGrid
          data={{ columns: COLUMNS, rows: ROWS }}
          editable
          onCommitHeader={noop}
          onCommitCell={noop}
          onHoverCell={noop}
        />,
      ).container,
  },
  {
    name: "editor grid (read-only)",
    render: () =>
      render(
        <TableGrid
          data={{ columns: COLUMNS, rows: ROWS }}
          editable={false}
          onCommitHeader={noop}
          onCommitCell={noop}
          onHoverCell={noop}
        />,
      ).container,
  },
];

/** [element selector, the var() reference that element's class must carry]. */
const TOKEN_CONSUMERS: Array<[string, string]> = [
  // Frame: the panel's rule-colored border on the panel fill
  ["div:has(> table)", "border-[color:var(--docs-table-border,var(--docs-rule,#e6e5e3))]"],
  ["div:has(> table)", "border-[length:var(--docs-table-border-width,1px)]"],
  ["div:has(> table)", "rounded-[var(--docs-table-radius,var(--radius,2px))]"],
  ["div:has(> table)", "bg-[color:var(--docs-table-bg,var(--docs-panel,#f8f8f7))]"],
  // Header band: muted text over one rule
  ["thead", "bg-[color:var(--docs-table-header-bg,transparent)]"],
  ["thead", "text-[color:var(--docs-table-header-fg,var(--docs-muted,#666562))]"],
  ["thead", "border-b-[length:var(--docs-table-header-rule-width,1px)]"],
  ["thead", "var(--docs-table-header-rule,var(--docs-rule,#e6e5e3))"],
  ["thead", "calc(var(--docs-table-header-rule-opacity,1)*100%)"],
  [
    "thead th",
    "text-[length:var(--docs-table-header-text-size,var(--docs-table-font-size,13.5px))]",
  ],
  ["thead th", "font-[var(--docs-table-header-weight,500)]"],
  // Rows: the soft rule
  ["tbody tr", "border-b-[length:var(--docs-table-row-rule-width,1px)]"],
  ["tbody tr", "var(--docs-table-row-rule,var(--docs-rule-soft,#efeeec))"],
  ["tbody tr", "calc(var(--docs-table-row-rule-opacity,1)*100%)"],
  ["tbody tr", "hover:bg-[color:var(--docs-table-row-hover-bg,var(--docs-hover,#ebebea))]"],
  ["tbody tr", "h-[var(--docs-table-row-min-height,28px)]"],
  // Column dividers: 0px at stock, color and opacity follow the row rules
  ["tbody td", "border-r-[length:var(--docs-table-column-rule-width,0px)]"],
  [
    "tbody td",
    "var(--docs-table-column-rule,var(--docs-table-row-rule,var(--docs-rule-soft,#efeeec)))",
  ],
  [
    "tbody td",
    "calc(var(--docs-table-column-rule-opacity,var(--docs-table-row-rule-opacity,1))*100%)",
  ],
  ["thead th", "border-r-[length:var(--docs-table-column-rule-width,0px)]"],
  // Cells
  ["tbody td", "py-[length:var(--docs-table-cell-pad-y,4px)]"],
  ["tbody td", "px-[length:var(--docs-table-cell-pad-x,12px)]"],
  ["thead th", "py-[length:var(--docs-table-cell-pad-y,4px)]"],
  ["thead th", "px-[length:var(--docs-table-cell-pad-x,12px)]"],
  ["tbody td", "text-[length:var(--docs-table-font-size,13.5px)]"],
  ["tbody td", "font-[var(--docs-table-body-weight,400)]"],
  ["tbody td", "text-[color:var(--docs-table-fg,var(--docs-text,#2a2a2a))]"],
  // Identifier cells: the key column's mono cell takes the key token
  [
    "tbody td",
    "data-[cell-kind=key]:text-[color:var(--docs-table-key-fg,var(--docs-syn-prop,#0d7164))]",
  ],
  ["table", "leading-[var(--docs-table-line-height,1.45)]"],
];

describe("structured-table theme tokens reach the DOM", () => {
  for (const surface of SURFACES) {
    it(`${surface.name} consumes every table token with its default as fallback`, () => {
      const container = surface.render();
      for (const [selector, reference] of TOKEN_CONSUMERS) {
        const element = container.querySelector(selector);
        expect(element, `${selector} is missing`).not.toBeNull();
        expect(element!.className, `${selector} must read ${reference}`).toContain(reference);
      }
    });

    it(`${surface.name} keeps empty cells one themed text line tall`, () => {
      const container = surface.render();
      const cells = Array.from(container.querySelectorAll('[role="textbox"]'));
      // The read block renders cell content straight into the th/td.
      if (surface.name === "read block") {
        expect(cells.length).toBe(0);
        return;
      }
      expect(cells.length).toBe(6);
      for (const cell of cells) {
        expect(cell.className).toContain(
          "min-h-[calc(var(--docs-table-line-height,1.45)*1em)]",
        );
        expect(cell.className).not.toContain("min-h-[1.55em]");
      }
    });
  }

  it("leaves no hardcoded frame, type or hover values behind", () => {
    for (const surface of SURFACES) {
      const container = surface.render();
      const wrapper = container.querySelector("div:has(> table)")!;
      expect(wrapper.className).not.toContain("rounded-md");
      expect(wrapper.className).not.toContain("bg-background");
      expect(wrapper.className.split(" ")).not.toContain("border");
      expect(container.querySelector("table")!.className).not.toContain("leading-[1.55]");
      expect(container.querySelector("thead th")!.className).not.toContain("font-medium");
      expect(container.querySelector("tbody tr")!.className).not.toContain("bg-muted/20");
      cleanup();
    }
  });

  it("drops the divider on the last column and the rule on the last row", () => {
    for (const surface of SURFACES) {
      const container = surface.render();
      const headerCells = container.querySelectorAll("thead th");
      const bodyRows = container.querySelectorAll("tbody tr");
      expect(headerCells[headerCells.length - 1]?.className).not.toContain("border-r");
      expect(bodyRows[bodyRows.length - 1]?.className).not.toContain("border-b");
      // The min-height floor is not a rule: the last row still carries it.
      expect(bodyRows[bodyRows.length - 1]?.className).toContain(
        "h-[var(--docs-table-row-min-height,28px)]",
      );
      cleanup();
    }
  });

  it("draws no title: the title only names the table", () => {
    const { container } = render(
      <StructuredTableBlock id="tbl" title="Owners" columns={COLUMNS} rows={ROWS} />,
    );
    expect(container.textContent).not.toContain("Owners");
    expect(container.querySelector("table")?.getAttribute("aria-label")).toBe("Owners");
    // The frame is the section's only child: it starts at the header row.
    expect(container.querySelector("section")?.children.length).toBe(1);
    cleanup();
    const untitled = render(<StructuredTableBlock id="tbl" columns={COLUMNS} rows={ROWS} />);
    expect(untitled.container.querySelector("table")?.hasAttribute("aria-label")).toBe(false);
  });
});

describe("structured-table column sizing and the pinned first column", () => {
  const LAYOUT_COLUMNS = ["Key", "Notes", "Unit"];
  const LAYOUT_ROWS = [
    ["headerRuleWidth", "Header rule thickness, set in pixels under the header row", "px"],
    ["cellPaddingY", "Vertical cell padding", "px"],
  ];
  const layoutSurfaces = [
    () =>
      render(<StructuredTableBlock id="tbl" columns={LAYOUT_COLUMNS} rows={LAYOUT_ROWS} />)
        .container,
    () =>
      render(
        <TableGrid
          data={{ columns: LAYOUT_COLUMNS, rows: LAYOUT_ROWS }}
          editable
          onCommitHeader={noop}
          onCommitCell={noop}
          onHoverCell={noop}
        />,
      ).container,
  ];

  it("shrinks the frame and table to their content instead of filling the lane", () => {
    for (const renderSurface of layoutSurfaces) {
      const container = renderSurface();
      const frame = container.querySelector("div:has(> table)")!;
      expect(frame.className).toContain("w-fit");
      expect(frame.className).toContain("max-w-full");
      expect(frame.className).toContain("overflow-auto");
      expect(container.querySelector("table")!.className.split(" ")).not.toContain("w-full");
      cleanup();
    }
  });

  it("keeps identifier and short columns on one line and measures the one prose column", () => {
    for (const renderSurface of layoutSurfaces) {
      const container = renderSurface();
      const fits = Array.from(container.querySelectorAll("thead th")).map((th) =>
        th.getAttribute("data-column-fit"),
      );
      expect(fits).toEqual(["fit", "prose", "fit"]);
      const [key, notes, unit] = Array.from(container.querySelectorAll("tbody tr:first-child td"));
      for (const cell of [key, unit]) {
        expect(cell!.className.split(" ")).toContain("whitespace-nowrap");
        expect(cell!.querySelector(`.${CSS.escape("max-w-[var(--ds-layout-lane-text)]")}`)).toBeNull();
      }
      expect(notes!.className.split(" ")).not.toContain("whitespace-nowrap");
      const measure = notes!.querySelector("div")!;
      expect(measure.className).toBe(TABLE_PROSE_MEASURE_CLASS);
      expect(measure.textContent).toContain("Header rule thickness");
      cleanup();
    }
  });

  it("pins the first column with an opaque fill matching its row", () => {
    for (const renderSurface of layoutSurfaces) {
      const container = renderSurface();
      const firstHeader = container.querySelector("thead th")!;
      const firstBody = container.querySelector("tbody td")!;
      for (const reference of TABLE_STICKY_HEADER_CELL_CLASSES.split(" ")) {
        expect(firstHeader.className).toContain(reference);
      }
      for (const reference of TABLE_STICKY_BODY_CELL_CLASSES.split(" ")) {
        expect(firstBody.className).toContain(reference);
      }
      // Only the first column is pinned.
      expect(container.querySelectorAll("tbody td")[1]!.className).not.toContain("sticky");
      cleanup();
    }
    expect(TABLE_STICKY_BODY_CELL_CLASSES).toContain("sticky left-0");
    expect(TABLE_STICKY_BODY_CELL_CLASSES).toContain(
      "[tr:hover>&]:bg-[color:var(--docs-table-row-hover-bg,var(--docs-hover,#ebebea))]",
    );
    expect(TABLE_STICKY_HEADER_CELL_CLASSES).toContain(
      "var(--docs-table-bg,var(--docs-panel,#f8f8f7))",
    );
    // The edge rule only shows while the frame actually scrolls.
    expect(TABLE_STICKY_BODY_CELL_CLASSES).toContain("[[data-table-overflow]_&]:after:opacity-100");
  });
});
