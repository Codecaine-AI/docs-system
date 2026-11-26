import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { StructuredTableBlock } from "../components/structured-table/StructuredTableDocsBlock";
import { TableGrid } from "../components/structured-table/editor/TableGrid";
import {
  TABLE_PROSE_FLOOR_CLASS,
  TABLE_PROSE_MEASURE_CLASS,
  TABLE_STICKY_BODY_CELL_CLASSES,
  TABLE_STICKY_HEADER_CELL_CLASSES,
} from "../components/structured-table/table-classes";

afterEach(() => {
  cleanup();
});

/**
 * Structured-table rendering on the read block and both editor grids. That
 * each token's fallback equals its default is owned by
 * layout-metrics-drift.test.ts (against TABLE_METRICS), and that every token
 * has a reader by the workbench's style-rail-token-wiring.test.ts.
 */
const COLUMNS = ["Stage", "Owner"];
const ROWS = [
  ["Alpha", "ford"],
  ["Beta", "ana"],
];
const noop = () => {};

describe("structured-table title", () => {
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
      expect(measure.className).toBe(`${TABLE_PROSE_MEASURE_CLASS} ${TABLE_PROSE_FLOOR_CLASS}`);
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
