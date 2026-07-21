import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { StructuredTableNodeView } from "../components/structured-table/editor-node-view";
import {
  HEADER_ROW,
  TableGrid,
  resolveNavigation,
} from "../components/structured-table/editor/TableGrid";
import type { TableData } from "../components/structured-table/editor/mutations";

afterEach(() => {
  cleanup();
});

const DATA: TableData = {
  columns: ["Stage", "Owner"],
  rows: [
    ["Alpha", "ford"],
    ["Beta", "ana"],
  ],
};

const noop = () => {};

function renderGrid(overrides?: {
  onCommitHeader?: (columnIndex: number, value: string) => void;
  onCommitCell?: (rowIndex: number, columnIndex: number, value: string) => void;
  onHoverCell?: (rowIndex: number | null, columnIndex: number | null) => void;
  data?: TableData;
}) {
  return render(
    <TableGrid
      data={overrides?.data ?? DATA}
      editable
      onCommitHeader={overrides?.onCommitHeader ?? noop}
      onCommitCell={overrides?.onCommitCell ?? noop}
      onHoverCell={overrides?.onHoverCell ?? noop}
    />,
  );
}

/** Editable cells in grid order: header row left-to-right, then body rows. */
function gridCells(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="textbox"]'));
}

function typeInto(cell: HTMLElement, text: string) {
  cell.focus();
  cell.textContent = text;
  fireEvent.input(cell);
}

describe("TableGrid", () => {
  it("renders the read surface's table structure and classes", () => {
    const { container } = renderGrid();

    const wrapper = container.querySelector("div");
    expect(wrapper?.className).toContain(
      "border-[color:var(--docs-table-border,transparent)]",
    );
    const header = container.querySelector("thead");
    expect(header?.className).toContain(
      "border-b-[length:var(--docs-table-header-rule-width,1.5px)]",
    );
    expect(header?.className).toContain("var(--docs-table-header-rule-opacity,0.5)");

    const headerCells = container.querySelectorAll("thead th");
    expect(headerCells.length).toBe(2);
    expect(headerCells[0]?.className).toContain(
      "text-[length:calc(var(--docs-table-font-size,14px)-1px)]",
    );
    expect(headerCells[0]?.className).toContain(
      "py-[length:var(--docs-table-cell-pad-y,10px)]",
    );
    expect(headerCells[0]?.className).toContain(
      "pr-[length:var(--docs-table-cell-pad-x,16px)]",
    );
    expect(headerCells[1]?.className).toContain("pr-0");

    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBe(2);
    expect(bodyRows[0]?.className).toContain(
      "border-b-[length:var(--docs-table-row-rule-width,1px)]",
    );
    expect(bodyRows[1]?.className).not.toContain("border-b");
    const bodyCells = container.querySelectorAll("tbody td");
    expect(bodyCells[0]?.className).toContain(
      "text-[length:var(--docs-table-font-size,14px)]",
    );

    const cells = gridCells(container);
    expect(cells.length).toBe(6);
    expect(cells.map((cell) => cell.textContent)).toEqual([
      "Stage",
      "Owner",
      "Alpha",
      "ford",
      "Beta",
      "ana",
    ]);
  });

  it("reports hover coordinates per cell and clears on leave", () => {
    const hovers: Array<[number | null, number | null]> = [];
    const { container } = renderGrid({
      onHoverCell: (row, col) => hovers.push([row, col]),
    });

    const headerCells = container.querySelectorAll("thead th");
    const bodyCells = container.querySelectorAll("tbody td");
    fireEvent.mouseEnter(headerCells[1]!);
    fireEvent.mouseEnter(bodyCells[2]!);
    fireEvent.mouseLeave(container.querySelector("div")!);

    expect(hovers).toEqual([
      [HEADER_ROW, 1],
      [1, 0],
      [null, null],
    ]);
  });

  it("commits an edited body cell on blur with row/column coordinates", () => {
    const commits: Array<[number, number, string]> = [];
    const { container } = renderGrid({
      onCommitCell: (row, col, value) => commits.push([row, col, value]),
    });

    const cell = gridCells(container)[3]!;
    typeInto(cell, "ana");
    fireEvent.blur(cell);

    expect(commits).toEqual([[0, 1, "ana"]]);
  });

  it("commits header edits through onCommitHeader", () => {
    const commits: Array<[number, string]> = [];
    const { container } = renderGrid({
      onCommitHeader: (col, value) => commits.push([col, value]),
    });

    const header = gridCells(container)[0]!;
    typeInto(header, "Phase");
    fireEvent.blur(header);

    expect(commits).toEqual([[0, "Phase"]]);
  });

  it("commits on a debounce while typing, without duplicate commits on blur", async () => {
    const commits: string[] = [];
    const { container } = renderGrid({
      onCommitCell: (_row, _col, value) => commits.push(value),
    });

    const cell = gridCells(container)[2]!;
    typeInto(cell, "Alpha 2");
    expect(commits).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(commits).toEqual(["Alpha 2"]);
    fireEvent.blur(cell);
    expect(commits).toEqual(["Alpha 2"]);
  });

  it("moves focus with Tab/Shift-Tab across the header-then-body order", () => {
    const { container } = renderGrid();
    const cells = gridCells(container);

    cells[0]!.focus();
    fireEvent.keyDown(cells[0]!, { key: "Tab" });
    expect(document.activeElement).toBe(cells[1]!);

    // Header row wraps into the first body row.
    fireEvent.keyDown(cells[1]!, { key: "Tab" });
    expect(document.activeElement).toBe(cells[2]!);

    fireEvent.keyDown(cells[2]!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cells[1]!);

    // No-ops at the very ends.
    cells[5]!.focus();
    fireEvent.keyDown(cells[5]!, { key: "Tab" });
    expect(document.activeElement).toBe(cells[5]!);
    cells[0]!.focus();
    fireEvent.keyDown(cells[0]!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cells[0]!);
  });

  it("Enter moves down the same column and commits; Escape blurs", () => {
    const commits: Array<[number, number, string]> = [];
    const { container } = renderGrid({
      onCommitCell: (row, col, value) => commits.push([row, col, value]),
    });
    const cells = gridCells(container);

    typeInto(cells[3]!, "ana!");
    fireEvent.keyDown(cells[3]!, { key: "Enter" });
    expect(commits).toEqual([[0, 1, "ana!"]]);
    expect(document.activeElement).toBe(cells[5]!);

    // Last row: Enter is a no-op for focus.
    fireEvent.keyDown(cells[5]!, { key: "Enter" });
    expect(document.activeElement).toBe(cells[5]!);

    fireEvent.keyDown(cells[5]!, { key: "Escape" });
    expect(document.activeElement).not.toBe(cells[5]!);
  });

  it("keeps the pure navigation math consistent at the boundaries", () => {
    expect(resolveNavigation({ row: HEADER_ROW, col: 1 }, "next", DATA)).toEqual({
      row: 0,
      col: 0,
    });
    expect(resolveNavigation({ row: 0, col: 0 }, "previous", DATA)).toEqual({
      row: HEADER_ROW,
      col: 1,
    });
    expect(resolveNavigation({ row: HEADER_ROW, col: 0 }, "previous", DATA)).toBeNull();
    expect(resolveNavigation({ row: 1, col: 1 }, "next", DATA)).toBeNull();
    expect(resolveNavigation({ row: HEADER_ROW, col: 1 }, "down", DATA)).toEqual({
      row: 0,
      col: 1,
    });
    expect(resolveNavigation({ row: 1, col: 0 }, "down", DATA)).toBeNull();
  });
});

type UpdateCall = Record<string, unknown>;

function nodeViewProps(blockProps: Record<string, unknown>): {
  props: ReactNodeViewProps;
  calls: UpdateCall[];
} {
  const calls: UpdateCall[] = [];
  const props = {
    node: {
      attrs: { blockId: "tbl-1", blockProps },
      type: { name: "docStructuredTable" },
    },
    editor: { isEditable: true },
    updateAttributes: (attrs: UpdateCall) => calls.push(attrs),
  } as unknown as ReactNodeViewProps;
  return { props, calls };
}

describe("StructuredTableNodeView", () => {
  it("renders title, section attributes, and normalized ragged rows", () => {
    const { props } = nodeViewProps({
      title: "Rollout",
      columns: ["A", "B"],
      rows: [["only-a"]],
    });
    const { container, getByText } = render(<StructuredTableNodeView {...props} />);

    const section = container.querySelector('[data-docs-block-type="structured-table"]');
    expect(section?.getAttribute("data-source-id")).toBe("tbl-1");
    expect(section?.className).toBe("not-prose my-4");
    expect(getByText("Rollout").className).toBe("mb-1.5 text-sm font-medium text-foreground");
    expect(container.querySelector("[data-structured-table-surface]")).toBeTruthy();
    // Ragged row padded to the column count.
    expect(gridCells(container as HTMLElement).map((cell) => cell.textContent)).toEqual([
      "A",
      "B",
      "only-a",
      "",
    ]);
  });

  it("funnels cell edits into one updateAttributes call preserving title and density", () => {
    const { props, calls } = nodeViewProps({
      title: "Rollout",
      density: "compact",
      columns: ["A", "B"],
      rows: [["x", "y"]],
    });
    const { container } = render(<StructuredTableNodeView {...props} />);

    const cell = gridCells(container as HTMLElement)[2]!;
    typeInto(cell, "x-edited");
    fireEvent.blur(cell);

    expect(calls).toEqual([
      {
        blockProps: {
          title: "Rollout",
          density: "compact",
          columns: ["A", "B"],
          rows: [["x-edited", "y"]],
        },
      },
    ]);
  });

  it("commits header edits through updateHeader", () => {
    const { props, calls } = nodeViewProps({
      columns: ["A", "B"],
      rows: [["x", "y"]],
    });
    const { container } = render(<StructuredTableNodeView {...props} />);

    const header = gridCells(container as HTMLElement)[1]!;
    typeInto(header, "B2");
    fireEvent.blur(header);

    expect(calls).toEqual([
      { blockProps: { columns: ["A", "B2"], rows: [["x", "y"]] } },
    ]);
  });

  it("renders the invalid-block placeholder instead of crashing on malformed props", () => {
    for (const blockProps of [
      {},
      { columns: [], rows: [] },
      { columns: ["A"], rows: "nope" },
      { columns: [1, 2], rows: [] },
    ]) {
      const { props } = nodeViewProps(blockProps as Record<string, unknown>);
      const { container, unmount } = render(<StructuredTableNodeView {...props} />);
      expect(container.textContent).toContain("Invalid Structured Table block");
      expect(container.querySelector("table")).toBeNull();
      unmount();
    }
  });
});
