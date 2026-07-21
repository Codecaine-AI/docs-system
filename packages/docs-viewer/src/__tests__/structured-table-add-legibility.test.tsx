import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { useState } from "react";
import { StructuredTableNodeView } from "../components/structured-table/editor-node-view";
import { StructuredTableBlock } from "../components/structured-table/StructuredTableDocsBlock";
import {
  columnsFlashRange,
  rowsFlashRange,
} from "../components/structured-table/editor/BirthFlash";
import { EditableCell } from "../components/structured-table/editor/EditableCell";
import {
  buildColumnMenuItems,
  buildRowMenuItems,
} from "../components/structured-table/editor/HandleMenu";
import type { TableData } from "../components/structured-table/editor/mutations";
import {
  ADD_DRAG_COLUMN_STEP_PX,
} from "../components/structured-table/editor/use-add-drag";
import { HEADER_ROW, TableGrid } from "../components/structured-table/editor/TableGrid";

afterEach(() => {
  cleanup();
});

const DATA: TableData = {
  columns: ["A", "B"],
  rows: [
    ["x", "y"],
    ["z", "w"],
  ],
};

const noop = () => {};

/**
 * Unlike the static furniture-test mock, this harness feeds updateAttributes
 * back into the node's blockProps — the same render cycle a real editor
 * produces — so freshly added cells actually mount, the pending-focus target
 * resolves against them, and the birth flash measures real registrations.
 */
function LiveNodeView({
  initial,
  history,
}: {
  initial: TableData;
  history: string[];
}) {
  const [blockProps, setBlockProps] = useState<Record<string, unknown>>({
    columns: initial.columns,
    rows: initial.rows,
  });
  const props = {
    node: {
      attrs: { blockId: "tbl-1", blockProps },
      type: { name: "docStructuredTable" },
    },
    editor: {
      isEditable: true,
      isDestroyed: false,
      view: { focus: () => history.push("focus") },
      commands: {
        undo: () => history.push("undo"),
        redo: () => history.push("redo"),
      },
    },
    updateAttributes: (attrs: Record<string, unknown>) => {
      setBlockProps(attrs.blockProps as Record<string, unknown>);
    },
  } as unknown as ReactNodeViewProps;
  return <StructuredTableNodeView {...props} />;
}

function renderLive(initial: TableData = DATA) {
  const history: string[] = [];
  const rendered = render(<LiveNodeView initial={initial} history={history} />);
  return { ...rendered, history };
}

function query(container: HTMLElement, selector: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(selector);
}

/** mousedown + mouseup inside the drag dead zone = a plain add-bar click. */
function clickBar(bar: HTMLElement) {
  fireEvent.mouseDown(bar, { button: 0, clientX: 0, clientY: 0 });
  fireEvent.mouseUp(document);
}

function clickHandle(handle: HTMLElement) {
  fireEvent.mouseDown(handle, { button: 0, clientX: 0, clientY: 0 });
  fireEvent.mouseUp(document);
}

function menuButton(label: string): HTMLElement {
  const menu = query(document.body, "[data-table-handle-menu]")!;
  return Array.from(menu.querySelectorAll("button")).find(
    (button) => button.textContent === label,
  )!;
}

describe("post-add focus target", () => {
  it("add-column bar click moves the caret into the new column's header cell", () => {
    const { container, history } = renderLive();
    clickBar(query(container, "[data-table-add-column]")!);

    const headers = container.querySelectorAll('thead [role="textbox"]');
    expect(headers.length).toBe(3);
    expect(document.activeElement).toBe(headers[2]!);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Column 3 header");
    // The cell focus REPLACES the editor-view refocus.
    expect(history).not.toContain("focus");
  });

  it("add-row bar click moves the caret into the new row's first cell", () => {
    const { container } = renderLive();
    clickBar(query(container, "[data-table-add-row]")!);

    expect(container.querySelectorAll("tbody tr").length).toBe(3);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Row 3, column 1");
  });

  it("corner add-both focuses the new column's header cell", () => {
    const { container } = renderLive();
    fireEvent.click(query(container, "[data-table-add-both]")!);

    expect(document.activeElement?.getAttribute("aria-label")).toBe("Column 3 header");
  });

  it("menu inserts focus the new column header / new row first cell", () => {
    const { container } = renderLive();
    fireEvent.mouseEnter(container.querySelectorAll("thead th")[0]!);
    clickHandle(query(container, "[data-table-column-handle]")!);
    fireEvent.click(menuButton("Insert right"));

    // Inserted between A and B: the new (empty) header at index 1 has focus.
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Column 2 header");
    expect(document.activeElement?.textContent).toBe("");

    fireEvent.mouseEnter(container.querySelectorAll("tbody td")[0]!);
    clickHandle(query(container, "[data-table-row-handle]")!);
    fireEvent.click(menuButton("Insert above"));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Row 1, column 1");
  });

  it("duplicate and drag-to-add-many hand focus back to the editor view instead", () => {
    const { container, history } = renderLive();
    fireEvent.mouseEnter(container.querySelectorAll("thead th")[0]!);
    clickHandle(query(container, "[data-table-column-handle]")!);
    fireEvent.click(menuButton("Duplicate"));
    expect(document.activeElement?.getAttribute("role")).not.toBe("textbox");
    expect(history).toContain("focus");

    history.length = 0;
    fireEvent.mouseDown(query(container, "[data-table-add-column]")!, {
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.mouseMove(document, { clientX: 2 * ADD_DRAG_COLUMN_STEP_PX + 20, clientY: 0 });
    fireEvent.mouseUp(document);
    expect(document.activeElement?.getAttribute("role")).not.toBe("textbox");
    expect(history).toContain("focus");
  });

  it("Mod-Z inside the freshly focused cell still reaches the editor history", () => {
    const { container, history } = renderLive();
    clickBar(query(container, "[data-table-add-column]")!);
    const active = document.activeElement as HTMLElement;
    expect(active.getAttribute("aria-label")).toBe("Column 3 header");
    fireEvent.keyDown(active, { key: "z", metaKey: true });
    expect(history).toContain("undo");
  });
});

describe("birth flash", () => {
  it("appears after a bar-click add and clears on animationend", () => {
    const { container } = renderLive();
    clickBar(query(container, "[data-table-add-column]")!);

    const slab = query(container, "[data-table-birth-flash]")!;
    expect(slab).toBeTruthy();
    expect(slab.className).toContain("pointer-events-none");
    expect(slab.className).toContain("var(--docs-editor-accent");
    expect(slab.style.animation).toContain("docs-table-birth-flash");

    fireEvent.animationEnd(slab);
    expect(query(container, "[data-table-birth-flash]")).toBeNull();
  });

  it("flashes one slab over the whole drag-added region", () => {
    const { container } = renderLive();
    fireEvent.mouseDown(query(container, "[data-table-add-column]")!, {
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.mouseMove(document, { clientX: 2 * ADD_DRAG_COLUMN_STEP_PX + 20, clientY: 0 });
    fireEvent.mouseUp(document);

    expect(container.querySelectorAll("[data-table-birth-flash]").length).toBe(1);
  });

  it("flashes menu inserts and duplicates", () => {
    const { container } = renderLive();
    fireEvent.mouseEnter(container.querySelectorAll("thead th")[0]!);
    clickHandle(query(container, "[data-table-column-handle]")!);
    fireEvent.click(menuButton("Insert left"));
    expect(query(container, "[data-table-birth-flash]")).toBeTruthy();
    fireEvent.animationEnd(query(container, "[data-table-birth-flash]")!);

    fireEvent.mouseEnter(container.querySelectorAll("tbody td")[0]!);
    clickHandle(query(container, "[data-table-row-handle]")!);
    fireEvent.click(menuButton("Duplicate"));
    expect(query(container, "[data-table-birth-flash]")).toBeTruthy();
  });

  it("never flashes structural ops that add nothing (delete, move)", () => {
    const { container } = renderLive();
    fireEvent.mouseEnter(container.querySelectorAll("thead th")[0]!);
    clickHandle(query(container, "[data-table-column-handle]")!);
    fireEvent.click(menuButton("Move right"));
    expect(query(container, "[data-table-birth-flash]")).toBeNull();

    fireEvent.mouseEnter(container.querySelectorAll("tbody td")[0]!);
    clickHandle(query(container, "[data-table-row-handle]")!);
    fireEvent.click(menuButton("Delete row"));
    expect(query(container, "[data-table-birth-flash]")).toBeNull();
  });

  it("builds column ranges header-through-last-row and row ranges full-width", () => {
    const three: TableData = {
      columns: ["A", "B", ""],
      rows: [
        ["x", "y", ""],
        ["z", "w", ""],
      ],
    };
    expect(columnsFlashRange(three, 2, 2)).toEqual({
      anchor: { row: HEADER_ROW, col: 2 },
      head: { row: 1, col: 2 },
    });
    expect(columnsFlashRange(three, 1, 2)).toEqual({
      anchor: { row: HEADER_ROW, col: 1 },
      head: { row: 1, col: 2 },
    });
    // No body rows: the column range degrades to the header cells alone.
    expect(columnsFlashRange({ columns: ["A", ""], rows: [] }, 1, 1)).toEqual({
      anchor: { row: HEADER_ROW, col: 1 },
      head: { row: HEADER_ROW, col: 1 },
    });
    expect(rowsFlashRange(three, 2, 2)).toEqual({
      anchor: { row: 2, col: 0 },
      head: { row: 2, col: 2 },
    });
  });

  it("menu items carry `adds` metadata for inserts and duplicates only", () => {
    const column = buildColumnMenuItems(1, 3);
    expect(column.find((item) => item.label === "Insert left")!.adds).toEqual({
      index: 1,
      focus: true,
    });
    expect(column.find((item) => item.label === "Insert right")!.adds).toEqual({
      index: 2,
      focus: true,
    });
    expect(column.find((item) => item.label === "Duplicate")!.adds).toEqual({
      index: 2,
      focus: false,
    });
    expect(column.find((item) => item.label === "Move left")!.adds).toBeUndefined();
    expect(column.find((item) => item.label === "Delete column")!.adds).toBeUndefined();

    const row = buildRowMenuItems(1, 3);
    expect(row.find((item) => item.label === "Insert above")!.adds).toEqual({
      index: 1,
      focus: true,
    });
    expect(row.find((item) => item.label === "Insert below")!.adds).toEqual({
      index: 2,
      focus: true,
    });
    expect(row.find((item) => item.label === "Duplicate")!.adds).toEqual({
      index: 2,
      focus: false,
    });
    expect(row.find((item) => item.label === "Clear row")!.adds).toBeUndefined();
  });
});

describe("header ghost placeholder", () => {
  function renderGrid(data: TableData, editable = true) {
    return render(
      <TableGrid
        data={data}
        editable={editable}
        onCommitHeader={noop}
        onCommitCell={noop}
        onHoverCell={noop}
      />,
    );
  }

  it("header cells carry a position-based ghost label; body cells never", () => {
    const { container } = renderGrid({ columns: ["", "B"], rows: [["", ""]] });
    const headers = container.querySelectorAll<HTMLElement>('thead [role="textbox"]');
    expect(headers[0]!.getAttribute("data-placeholder")).toBe("Column 1");
    expect(headers[1]!.getAttribute("data-placeholder")).toBe("Column 2");
    // Shown via :empty CSS — no debounce lag, hidden the instant text lands.
    expect(headers[0]!.className).toContain(
      "empty:before:content-[attr(data-placeholder)]",
    );
    expect(headers[0]!.className).toContain("empty:before:text-muted-foreground/60");

    for (const body of container.querySelectorAll<HTMLElement>('tbody [role="textbox"]')) {
      expect(body.getAttribute("data-placeholder")).toBeNull();
    }
  });

  it("numbering follows the column's current position after a reorder", () => {
    const { container, rerender } = renderGrid({ columns: ["", "B"], rows: [] });
    rerender(
      <TableGrid
        data={{ columns: ["B", ""], rows: [] }}
        editable
        onCommitHeader={noop}
        onCommitCell={noop}
        onHoverCell={noop}
      />,
    );
    const headers = container.querySelectorAll<HTMLElement>('thead [role="textbox"]');
    // The empty column moved to position 2 — its ghost says so.
    expect(headers[0]!.getAttribute("data-placeholder")).toBe("Column 1");
    expect(headers[1]!.getAttribute("data-placeholder")).toBe("Column 2");
  });

  it("read mode renders no placeholder at all", () => {
    const grid = renderGrid({ columns: ["", "B"], rows: [["", ""]] }, false);
    expect(grid.container.querySelectorAll("[data-placeholder]").length).toBe(0);

    const read = render(
      <StructuredTableBlock id="tbl-1" columns={["", "B"]} rows={[["", ""]]} />,
    );
    expect(read.container.querySelectorAll("[data-placeholder]").length).toBe(0);
    expect(read.container.textContent).not.toContain("Column 1");
  });

  it("normalizes a stray <br> left by clearing so :empty (and the ghost) returns", () => {
    const { container } = render(
      <EditableCell
        value=""
        editable
        ariaLabel="Column 1 header"
        placeholder="Column 1"
        onCommit={noop}
        onNavigate={noop}
        registerElement={noop}
      />,
    );
    const cell = container.querySelector<HTMLElement>('[role="textbox"]')!;
    cell.focus();
    cell.textContent = "Name";
    fireEvent.input(cell);
    expect(cell.childNodes.length).toBe(1);

    // Select-all + delete leaves a lone <br> in real browsers — without
    // normalization the element is no longer :empty and the ghost stays gone.
    cell.innerHTML = "<br>";
    fireEvent.input(cell);
    expect(cell.childNodes.length).toBe(0);
  });
});
