import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { StructuredTableBlock } from "../components/structured-table/StructuredTableDocsBlock";
import { TableGrid } from "../components/structured-table/editor/TableGrid";
import { TABLE_PROSE_FLOOR_CLASS, TABLE_PROSE_MEASURE_CLASS } from "../components/structured-table/table-classes";

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
  it.each([
    ["draws no title: the title only names the table", () => {
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
    }],
    ["renders columns and rows from structured props", () => {
      const { container } = render(
        <StructuredTableBlock
          id="tbl-1"
          title="Rollout matrix"
          columns={["Stage", "Owner", "Status"]}
          rows={[
            ["Alpha", "ford", "done"],
            ["Beta", "ana", "in progress"],
          ]}
        />,
      );

      expect(screen.getByText("Stage")).toBeTruthy();
      expect(screen.getByText("Owner")).toBeTruthy();
      expect(screen.getByText("Status")).toBeTruthy();
      expect(screen.getByText("Alpha")).toBeTruthy();
      expect(screen.getByText("in progress")).toBeTruthy();
      expect(screen.queryByText("normal")).toBeNull();
      expect(screen.queryByText("tbl-1")).toBeNull();

      const section = container.querySelector('[data-docs-block-type="structured-table"]');
      expect(section?.getAttribute("data-source-id")).toBe("tbl-1");
      expect(section?.className).toBe("not-prose my-4");
      // The title is never drawn: the frame starts at the header row, and the
      // title only names the table for assistive tech.
      expect(screen.queryByText("Rollout matrix")).toBeNull();
      expect(container.querySelector("table")?.getAttribute("aria-label")).toBe("Rollout matrix");
      expect(section?.children.length).toBe(1);
      expect(section?.firstElementChild?.firstElementChild?.tagName).toBe("TABLE");
    }],
  ])("%s", (_title: string, run: () => void | Promise<void>) => run());
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
});
