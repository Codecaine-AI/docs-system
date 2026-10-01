import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { StructuredTableBlock } from "../components/structured-table/StructuredTableDocsBlock";
import { TableGrid } from "../components/structured-table/editor/TableGrid";
import {
  TABLE_TITLE_BAR_CLASSES,
  TABLE_TITLE_CLASSES,
  TABLE_WRAPPER_CLASSES,
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
  ["thead th", "[font-weight:var(--docs-table-header-weight,500)]"],
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
  ["tbody td", "[font-weight:var(--docs-table-body-weight,400)]"],
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

  it("sets the title in the panel head through its three tokens", () => {
    const { container } = render(
      <StructuredTableBlock id="tbl" title="Owners" columns={COLUMNS} rows={ROWS} />,
    );
    const head = container.querySelector("section > [data-table-title-bar]");
    expect(head?.className).toBe(TABLE_TITLE_BAR_CLASSES);
    const title = head?.querySelector("span[id]");
    expect(title?.textContent).toBe("Owners");
    expect(title?.className).toBe(TABLE_TITLE_CLASSES);
    for (const reference of [
      "text-[length:var(--docs-table-title-text-size,13.5px)]",
      "[font-weight:var(--docs-table-title-weight,600)]",
      "text-[color:var(--docs-table-title-fg,var(--docs-ink,#1f1f1f))]",
    ]) {
      expect(TABLE_TITLE_CLASSES).toContain(reference);
    }
    // The head is the top of the panel frame: same border, fill and radius
    // tokens as the grid frame, with the soft rule under it.
    for (const reference of [
      "border-x-[color:var(--docs-table-border,var(--docs-rule,#e6e5e3))]",
      "border-t-[length:var(--docs-table-border-width,1px)]",
      "rounded-t-[var(--docs-table-radius,var(--radius,2px))]",
      "bg-[color:var(--docs-table-bg,var(--docs-panel,#f8f8f7))]",
      "border-b-[color:var(--docs-table-row-rule,var(--docs-rule-soft,#efeeec))]",
    ]) {
      expect(TABLE_TITLE_BAR_CLASSES).toContain(reference);
    }
    // The family tile is decorative; the title names the table.
    const tile = head?.querySelector('[aria-hidden="true"]');
    expect(tile?.className).toContain("bg-[color:var(--docs-fam-text-solid,#9b9a97)]");
    expect(tile?.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("table")?.getAttribute("aria-labelledby")).toBe(title?.id);
    // The grid frame drops its top edge under a head.
    expect(container.querySelector("section")?.hasAttribute("data-table-titled")).toBe(true);
    expect(TABLE_WRAPPER_CLASSES).toContain("[[data-table-titled]_&]:border-t-0");
  });

  it("renders no panel head without a title", () => {
    const { container } = render(<StructuredTableBlock id="tbl" columns={COLUMNS} rows={ROWS} />);
    expect(container.querySelector("[data-table-title-bar]")).toBeNull();
    expect(container.querySelector("section")?.hasAttribute("data-table-titled")).toBe(false);
    expect(container.querySelector("table")?.hasAttribute("aria-labelledby")).toBe(false);
  });
});
