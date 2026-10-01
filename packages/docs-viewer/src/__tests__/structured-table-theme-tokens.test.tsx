import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { StructuredTableBlock } from "../components/structured-table/StructuredTableDocsBlock";
import { TableGrid } from "../components/structured-table/editor/TableGrid";
import { TABLE_TITLE_CLASSES } from "../components/structured-table/table-classes";

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
  // Frame
  ["div:has(> table)", "border-[color:var(--docs-table-border,var(--border))]"],
  ["div:has(> table)", "border-[length:var(--docs-table-border-width,1px)]"],
  ["div:has(> table)", "rounded-[var(--docs-table-radius,var(--radius,2px))]"],
  ["div:has(> table)", "bg-[color:var(--docs-table-bg,var(--background))]"],
  // Header band
  ["thead", "bg-[color:var(--docs-table-header-bg,transparent)]"],
  ["thead", "text-[color:var(--docs-table-header-fg,currentColor)]"],
  ["thead", "border-b-[length:var(--docs-table-header-rule-width,2px)]"],
  ["thead", "var(--docs-table-header-rule,var(--docs-table-header-fg,currentColor))"],
  ["thead", "calc(var(--docs-table-header-rule-opacity,0.7)*100%)"],
  [
    "thead th",
    "text-[length:var(--docs-table-header-text-size,calc(var(--docs-table-font-size,14px)-1px))]",
  ],
  ["thead th", "[font-weight:var(--docs-table-header-weight,500)]"],
  // Rows
  ["tbody tr", "border-b-[length:var(--docs-table-row-rule-width,1px)]"],
  ["tbody tr", "var(--docs-table-row-rule,var(--border))"],
  ["tbody tr", "calc(var(--docs-table-row-rule-opacity,1)*100%)"],
  [
    "tbody tr",
    "hover:bg-[color:var(--docs-table-row-hover-bg,color-mix(in_srgb,var(--muted)_20%,transparent))]",
  ],
  ["tbody tr", "h-[var(--docs-table-row-min-height,0px)]"],
  // Column dividers (each falls back to its row-rule twin)
  [
    "tbody td",
    "border-r-[length:var(--docs-table-column-rule-width,var(--docs-table-row-rule-width,1px))]",
  ],
  ["tbody td", "var(--docs-table-column-rule,var(--docs-table-row-rule,var(--border)))"],
  [
    "tbody td",
    "calc(var(--docs-table-column-rule-opacity,var(--docs-table-row-rule-opacity,1))*100%)",
  ],
  [
    "thead th",
    "border-r-[length:var(--docs-table-column-rule-width,var(--docs-table-row-rule-width,1px))]",
  ],
  // Cells
  ["tbody td", "py-[length:var(--docs-table-cell-pad-y,10px)]"],
  ["tbody td", "px-[length:var(--docs-table-cell-pad-x,12px)]"],
  ["thead th", "py-[length:var(--docs-table-cell-pad-y,10px)]"],
  ["thead th", "px-[length:var(--docs-table-cell-pad-x,12px)]"],
  ["tbody td", "text-[length:var(--docs-table-font-size,14px)]"],
  ["tbody td", "[font-weight:var(--docs-table-body-weight,400)]"],
  ["tbody td", "text-[color:var(--docs-table-fg,currentColor)]"],
  ["table", "leading-[var(--docs-table-line-height,1.55)]"],
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
          "min-h-[calc(var(--docs-table-line-height,1.55)*1em)]",
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
        "h-[var(--docs-table-row-min-height,0px)]",
      );
      cleanup();
    }
  });

  it("routes the title line through its four tokens", () => {
    const { container } = render(
      <StructuredTableBlock id="tbl" title="Owners" columns={COLUMNS} rows={ROWS} />,
    );
    const title = container.querySelector("section > div");
    expect(title?.textContent).toBe("Owners");
    expect(title?.className).toBe(TABLE_TITLE_CLASSES);
    for (const reference of [
      "text-[length:var(--docs-table-title-text-size,14px)]",
      "[font-weight:var(--docs-table-title-weight,500)]",
      "text-[color:var(--docs-table-title-fg,var(--foreground))]",
      "mb-[var(--docs-table-title-gap,6px)]",
    ]) {
      expect(TABLE_TITLE_CLASSES).toContain(reference);
    }
    // `text-sm` would pin the size and its 20px leading; the ratio scales.
    expect(TABLE_TITLE_CLASSES).not.toContain("text-sm");
    expect(TABLE_TITLE_CLASSES).toContain("leading-[calc(1.25/0.875)]");
  });
});
