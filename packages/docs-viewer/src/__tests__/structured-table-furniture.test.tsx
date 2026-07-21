import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, createEvent, fireEvent, render } from "@testing-library/react";
import type { ReactNodeViewProps } from "@tiptap/react";
import {
  HANDLE_OFFSET_CALC,
  StructuredTableNodeView,
} from "../components/structured-table/editor-node-view";
import { ADD_BAR_TOOLTIP_DELAY_MS } from "../components/structured-table/editor/AddButtons";
import { addDragLabel } from "../components/structured-table/editor/AddDragPreview";
import { DragRegionOverlay } from "../components/structured-table/editor/DropIndicator";
import {
  SelectionOverlay,
  paddedRectStyle,
} from "../components/structured-table/editor/SelectionOverlay";
import { EditableCell } from "../components/structured-table/editor/EditableCell";
import { unionRect } from "../components/structured-table/editor/geometry";
import {
  buildColumnMenuItems,
  buildRowMenuItems,
} from "../components/structured-table/editor/HandleMenu";
import type { TableData } from "../components/structured-table/editor/mutations";
import {
  cellRectKey,
  columnOffsets,
  rangeRects,
  relativeRect,
  rowOffsets,
  type CellRectMap,
} from "../components/structured-table/editor/overlay-geometry";
import {
  ADD_DRAG_COLUMN_STEP_PX,
  ADD_DRAG_ROW_STEP_PX,
  applyAddDrag,
  planAddDragNet,
  trailingEmptyColumns,
  trailingEmptyRows,
} from "../components/structured-table/editor/use-add-drag";
import { planReorderDrop } from "../components/structured-table/editor/use-reorder-drag";

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

type UpdateCall = Record<string, unknown>;

function nodeViewProps(
  blockProps: Record<string, unknown>,
  editable = true,
): { props: ReactNodeViewProps; calls: UpdateCall[]; history: string[] } {
  const calls: UpdateCall[] = [];
  const history: string[] = [];
  const props = {
    node: {
      attrs: { blockId: "tbl-1", blockProps },
      type: { name: "docStructuredTable" },
    },
    editor: {
      isEditable: editable,
      isDestroyed: false,
      view: { focus: () => history.push("focus") },
      commands: {
        undo: () => history.push("undo"),
        redo: () => history.push("redo"),
      },
    },
    updateAttributes: (attrs: UpdateCall) => calls.push(attrs),
  } as unknown as ReactNodeViewProps;
  return { props, calls, history };
}

function renderView(data: TableData = DATA, editable = true) {
  const { props, calls, history } = nodeViewProps(
    { columns: data.columns, rows: data.rows },
    editable,
  );
  const rendered = render(<StructuredTableNodeView {...props} />);
  return { ...rendered, calls, history };
}

type PlainRect = { left: number; top: number; width: number; height: number };

function mockRect(element: Element, rect: PlainRect) {
  (element as HTMLElement).getBoundingClientRect = () =>
    ({
      x: rect.left,
      y: rect.top,
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      toJSON: () => rect,
    }) as DOMRect;
}

function query(container: HTMLElement, selector: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(selector);
}

/** mousedown on a handle then mouseup within the dead zone = click (opens the menu). */
function clickHandle(handle: HTMLElement) {
  fireEvent.mouseDown(handle, { button: 0, clientX: 0, clientY: 0 });
  fireEvent.mouseUp(document);
}

describe("structured-table add buttons", () => {
  it("renders all three appenders, hidden at rest, only when editable", () => {
    const { container } = renderView();
    const column = query(container, "[data-table-add-column]")!;
    const row = query(container, "[data-table-add-row]")!;
    const both = query(container, "[data-table-add-both]")!;
    for (const bar of [column, row, both]) {
      expect(bar.className).toContain("opacity-0");
      expect(bar.className).toContain("hover:opacity-100");
      expect(bar.className).toContain("transition-opacity");
      expect(bar.getAttribute("contenteditable")).toBe("false");
      // Native title tooltips are gone — the dark dwell tooltip replaces them.
      expect(bar.getAttribute("title")).toBeNull();
    }
    // The bars read as "expand", the corner as a diagonal expand.
    expect(column.className).toContain("cursor-col-resize");
    expect(row.className).toContain("cursor-row-resize");
    expect(both.className).toContain("cursor-nwse-resize");

    const readOnly = renderView(DATA, false);
    expect(query(readOnly.container as HTMLElement, "[data-table-add-column]")).toBeNull();
    expect(query(readOnly.container as HTMLElement, "[data-table-add-row]")).toBeNull();
    expect(query(readOnly.container as HTMLElement, "[data-table-add-both]")).toBeNull();
  });

  it("shows the dark two-line tooltip after the hover dwell and hides on leave", async () => {
    const { container } = renderView();
    const bar = query(container, "[data-table-add-column]")!;
    fireEvent.mouseEnter(bar);
    expect(query(container, "[data-table-add-tooltip]")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, ADD_BAR_TOOLTIP_DELAY_MS + 100));
    const tooltip = query(container, "[data-table-add-tooltip]")!;
    expect(tooltip.textContent).toContain("Click to add a new column");
    expect(tooltip.textContent).toContain("Drag to add or remove columns");
    fireEvent.mouseLeave(bar);
    expect(query(container, "[data-table-add-tooltip]")).toBeNull();
  });

  it("lights the right bar on last-column hover and the bottom bar on last-row hover", () => {
    const { container } = renderView();
    const headers = container.querySelectorAll("thead th");
    const bodyCells = container.querySelectorAll("tbody td");

    fireEvent.mouseEnter(headers[1]!);
    expect(query(container, "[data-table-add-column]")!.className).toContain("opacity-100");
    expect(query(container, "[data-table-add-row]")!.className).toContain("opacity-0");

    // Last body row lights the bottom bar; its non-last column leaves the right bar at rest.
    fireEvent.mouseEnter(bodyCells[2]!);
    expect(query(container, "[data-table-add-row]")!.className).toContain("opacity-100");
    expect(query(container, "[data-table-add-column]")!.className).toContain("opacity-0");
  });

  it("commits addColumn / addRow (dead-zone clicks) / both through commitData", () => {
    const { container, calls } = renderView();
    // The bars route through useAddDrag: mousedown + mouseup inside the dead
    // zone is a plain click and appends exactly one.
    fireEvent.mouseDown(query(container, "[data-table-add-column]")!, {
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.mouseUp(document);
    fireEvent.mouseDown(query(container, "[data-table-add-row]")!, {
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.mouseUp(document);
    fireEvent.click(query(container, "[data-table-add-both]")!);

    // Sequential ops compose through dataRef (the mock never re-renders the
    // node attrs, so this pins that each commit builds on the previous one —
    // exactly what a real editor render cycle produces).
    expect(calls).toEqual([
      { blockProps: { columns: ["A", "B", ""], rows: [["x", "y", ""], ["z", "w", ""]] } },
      {
        blockProps: {
          columns: ["A", "B", ""],
          rows: [["x", "y", ""], ["z", "w", ""], ["", "", ""]],
        },
      },
      {
        blockProps: {
          columns: ["A", "B", "", ""],
          rows: [
            ["x", "y", "", ""],
            ["z", "w", "", ""],
            ["", "", "", ""],
            ["", "", "", ""],
          ],
        },
      },
    ]);
  });
});

describe("structured-table add-bar drag", () => {
  it("plans net adds per step and clamps removals to the trailing empty run", () => {
    expect(planAddDragNet(250, ADD_DRAG_COLUMN_STEP_PX, 0, 2)).toBe(2);
    expect(planAddDragNet(ADD_DRAG_COLUMN_STEP_PX - 1, ADD_DRAG_COLUMN_STEP_PX, 0, 2)).toBe(0);
    expect(planAddDragNet(-130, ADD_DRAG_COLUMN_STEP_PX, 1, 3)).toBe(-1);
    // Clamped by the trailing-empty run…
    expect(planAddDragNet(-500, ADD_DRAG_COLUMN_STEP_PX, 1, 3)).toBe(-1);
    // …and by "never below one column/row".
    expect(planAddDragNet(-500, ADD_DRAG_COLUMN_STEP_PX, 5, 3)).toBe(-2);
    expect(planAddDragNet(-500, ADD_DRAG_COLUMN_STEP_PX, 1, 1)).toBe(0);
    expect(planAddDragNet(80, ADD_DRAG_ROW_STEP_PX, 0, 2)).toBe(2);
  });

  it("counts trailing empty columns (header included) and rows", () => {
    expect(trailingEmptyColumns({ columns: ["A", ""], rows: [["x", ""]] })).toBe(1);
    expect(trailingEmptyColumns({ columns: ["A", "H"], rows: [["x", ""]] })).toBe(0);
    expect(trailingEmptyColumns({ columns: ["A", ""], rows: [["x", "y"]] })).toBe(0);
    expect(trailingEmptyColumns({ columns: ["", ""], rows: [] })).toBe(2);
    expect(trailingEmptyRows({ columns: ["A"], rows: [["x"], [""], [""]] })).toBe(2);
    expect(trailingEmptyRows({ columns: ["A"], rows: [["x"]] })).toBe(0);
  });

  it("applyAddDrag folds the whole net change into one TableData", () => {
    expect(applyAddDrag(DATA, "column", 2)).toEqual({
      columns: ["A", "B", "", ""],
      rows: [
        ["x", "y", "", ""],
        ["z", "w", "", ""],
      ],
    });
    expect(
      applyAddDrag({ columns: ["A", "B", ""], rows: [["x", "y", ""]] }, "column", -1),
    ).toEqual({ columns: ["A", "B"], rows: [["x", "y"]] });
    expect(applyAddDrag({ columns: ["A"], rows: [["x"], [""]] }, "row", -1)).toEqual({
      columns: ["A"],
      rows: [["x"]],
    });
    expect(applyAddDrag(DATA, "row", 0)).toBe(DATA);
  });

  it("labels the live preview with signed counts", () => {
    expect(addDragLabel("column", 2)).toBe("+2 columns");
    expect(addDragLabel("column", 1)).toBe("+1 column");
    expect(addDragLabel("row", -1)).toBe("−1 row");
  });

  it("dragging the right bar renders ghost slabs and commits all added columns once", () => {
    const { container, calls } = renderView();
    fireEvent.mouseDown(query(container, "[data-table-add-column]")!, {
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.mouseMove(document, { clientX: 2 * ADD_DRAG_COLUMN_STEP_PX + 20, clientY: 0 });

    expect(container.querySelectorAll("[data-table-add-drag-ghost]").length).toBe(2);
    expect(query(container, "[data-table-add-drag-label]")!.textContent).toBe("+2 columns");

    fireEvent.mouseUp(document);
    expect(query(container, "[data-table-add-drag-preview]")).toBeNull();
    expect(calls).toEqual([
      {
        blockProps: {
          columns: ["A", "B", "", ""],
          rows: [
            ["x", "y", "", ""],
            ["z", "w", "", ""],
          ],
        },
      },
    ]);
  });

  it("dragging the right bar left marks trailing empty columns and commits their removal", () => {
    const { container, calls } = renderView({
      columns: ["A", "B", ""],
      rows: [
        ["x", "y", ""],
        ["z", "w", ""],
      ],
    });
    fireEvent.mouseDown(query(container, "[data-table-add-column]")!, {
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.mouseMove(document, { clientX: -(ADD_DRAG_COLUMN_STEP_PX + 10), clientY: 0 });

    expect(query(container, "[data-table-add-drag-removal]")).toBeTruthy();
    expect(query(container, "[data-table-add-drag-label]")!.textContent).toBe("−1 column");

    fireEvent.mouseUp(document);
    expect(calls).toEqual([
      { blockProps: { columns: ["A", "B"], rows: [["x", "y"], ["z", "w"]] } },
    ]);
  });

  it("dragging the bottom bar down adds rows in one commit", () => {
    const { container, calls } = renderView();
    fireEvent.mouseDown(query(container, "[data-table-add-row]")!, {
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.mouseMove(document, { clientX: 0, clientY: ADD_DRAG_ROW_STEP_PX + 12 });
    expect(query(container, "[data-table-add-drag-label]")!.textContent).toBe("+1 row");

    fireEvent.mouseUp(document);
    expect(calls).toEqual([
      { blockProps: { columns: ["A", "B"], rows: [["x", "y"], ["z", "w"], ["", ""]] } },
    ]);
  });

  it("Escape cancels an add drag without committing", () => {
    const { container, calls } = renderView();
    fireEvent.mouseDown(query(container, "[data-table-add-column]")!, {
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.mouseMove(document, { clientX: ADD_DRAG_COLUMN_STEP_PX + 20, clientY: 0 });
    expect(query(container, "[data-table-add-drag-preview]")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(query(container, "[data-table-add-drag-preview]")).toBeNull();
    fireEvent.mouseUp(document);
    expect(calls).toEqual([]);
  });
});

describe("structured-table cell focus furniture", () => {
  it("marks the focused cell's column and row with gray notches, cleared on blur", () => {
    const { container } = renderView();
    const cell = container.querySelectorAll<HTMLElement>('[role="textbox"]')[2]!; // row 0, col 0
    fireEvent.focus(cell);
    expect(query(container, '[data-table-focus-notch="column"]')).toBeTruthy();
    expect(query(container, '[data-table-focus-notch="row"]')).toBeTruthy();

    fireEvent.blur(cell);
    expect(container.querySelectorAll("[data-table-focus-notch]").length).toBe(0);
  });

  it("gives editor cells the whole-cell focus-within accent ring, but never read-mode cells", () => {
    const { container } = renderView();
    expect(container.querySelector("thead th")!.className).toContain("focus-within:");
    expect(container.querySelector("tbody td")!.className).toContain("focus-within:");

    const readOnly = renderView(DATA, false);
    expect(readOnly.container.querySelector("thead th")!.className).not.toContain(
      "focus-within:",
    );
    expect(readOnly.container.querySelector("tbody td")!.className).not.toContain(
      "focus-within:",
    );
  });
});

describe("structured-table handles and menu", () => {
  it("shows the column handle on hover and no row handle for the header row", () => {
    const { container } = renderView();
    fireEvent.mouseEnter(container.querySelectorAll("thead th")[0]!);
    expect(query(container, "[data-table-column-handle]")).toBeTruthy();
    expect(query(container, "[data-table-row-handle]")).toBeNull();
  });

  it("renders six-dot grab glyphs on both handles", () => {
    const { container } = renderView();
    fireEvent.mouseEnter(container.querySelectorAll("tbody td")[0]!);
    const columnHandle = query(container, "[data-table-column-handle]")!;
    const rowHandle = query(container, "[data-table-row-handle]")!;
    expect(columnHandle.querySelectorAll("span span").length).toBe(6);
    expect(rowHandle.querySelectorAll("span span").length).toBe(6);
    // Column pill: 2 rows × 3 dots; row pill: 3 rows × 2 dots.
    expect(columnHandle.querySelector("span")!.className).toContain("grid-cols-3");
    expect(rowHandle.querySelector("span")!.className).toContain("grid-cols-2");
    expect(columnHandle.className).toContain("cursor-grab");
    expect(columnHandle.className).toContain("active:cursor-grabbing");
  });

  it("shows both handles over a body cell; none when not editable", () => {
    const { container } = renderView();
    fireEvent.mouseEnter(container.querySelectorAll("tbody td")[0]!);
    expect(query(container, "[data-table-column-handle]")).toBeTruthy();
    expect(query(container, "[data-table-row-handle]")).toBeTruthy();

    const readOnly = renderView(DATA, false);
    fireEvent.mouseEnter(readOnly.container.querySelectorAll("tbody td")[0]!);
    expect(query(readOnly.container as HTMLElement, "[data-table-column-handle]")).toBeNull();
    expect(query(readOnly.container as HTMLElement, "[data-table-row-handle]")).toBeNull();
  });

  it("handle click opens the column menu, selects the whole column, and menu actions commit once", () => {
    const { container, calls } = renderView();
    fireEvent.mouseEnter(container.querySelectorAll("thead th")[0]!);
    clickHandle(query(container, "[data-table-column-handle]")!);

    const menu = query(container.ownerDocument.body, "[data-table-handle-menu]")!;
    expect(menu.getAttribute("data-table-handle-menu")).toBe("column");
    const surface = query(container, "[data-structured-table-surface]")!;
    expect(surface.getAttribute("data-table-selection")).toBe("active");
    expect(query(container, "[data-table-selection-overlay]")).toBeTruthy();
    // Active handle: full-strength accent background with white dots.
    expect(query(container, "[data-table-column-handle]")!.className).toContain(
      "var(--docs-editor-accent",
    );

    const buttons = Array.from(menu.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Insert left",
      "Insert right",
      "Move left",
      "Move right",
      "Duplicate",
      "Clear column",
      "Delete column",
    ]);
    // Column 0 of 2: can't move left; delete allowed.
    expect(buttons[2]!.disabled).toBe(true);
    expect(buttons[3]!.disabled).toBe(false);
    expect(buttons[6]!.disabled).toBe(false);

    fireEvent.click(buttons[1]!); // Insert right
    expect(calls).toEqual([
      { blockProps: { columns: ["A", "", "B"], rows: [["x", "", "y"], ["z", "", "w"]] } },
    ]);
    // Menu closed and selection cleared after the action.
    expect(query(container.ownerDocument.body, "[data-table-handle-menu]")).toBeNull();
    expect(surface.getAttribute("data-table-selection")).toBe("none");
  });

  it("row handle click opens the row menu with disabled edges and commits row mutations", () => {
    const { container, calls } = renderView();
    fireEvent.mouseEnter(container.querySelectorAll("tbody td")[0]!);
    clickHandle(query(container, "[data-table-row-handle]")!);

    const menu = query(container.ownerDocument.body, "[data-table-handle-menu]")!;
    expect(menu.getAttribute("data-table-handle-menu")).toBe("row");
    const buttons = Array.from(menu.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Insert above",
      "Insert below",
      "Move up",
      "Move down",
      "Duplicate",
      "Clear row",
      "Delete row",
    ]);
    expect(buttons[2]!.disabled).toBe(true); // Move up on row 0
    expect(buttons[3]!.disabled).toBe(false);

    fireEvent.click(buttons[6]!); // Delete row
    expect(calls).toEqual([{ blockProps: { columns: ["A", "B"], rows: [["z", "w"]] } }]);
  });

  it("Escape and click-away close the menu without committing and clear the selection", () => {
    const { container, calls } = renderView();
    fireEvent.mouseEnter(container.querySelectorAll("thead th")[0]!);
    clickHandle(query(container, "[data-table-column-handle]")!);
    expect(query(container.ownerDocument.body, "[data-table-handle-menu]")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(query(container.ownerDocument.body, "[data-table-handle-menu]")).toBeNull();
    const surface = query(container, "[data-structured-table-surface]")!;
    expect(surface.getAttribute("data-table-selection")).toBe("none");

    clickHandle(query(container, "[data-table-column-handle]")!);
    expect(query(container.ownerDocument.body, "[data-table-handle-menu]")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(query(container.ownerDocument.body, "[data-table-handle-menu]")).toBeNull();
    expect(surface.getAttribute("data-table-selection")).toBe("none");
    expect(calls).toEqual([]);
  });

  it("menu builders disable every impossible item on a 1x1 table", () => {
    const column = buildColumnMenuItems(0, 1);
    expect(column.find((item) => item.label === "Move left")!.disabled).toBe(true);
    expect(column.find((item) => item.label === "Move right")!.disabled).toBe(true);
    expect(column.find((item) => item.label === "Delete column")!.disabled).toBe(true);
    expect(column.find((item) => item.label === "Insert left")!.disabled).toBeUndefined();

    const row = buildRowMenuItems(0, 1);
    expect(row.find((item) => item.label === "Move up")!.disabled).toBe(true);
    expect(row.find((item) => item.label === "Move down")!.disabled).toBe(true);
    expect(row.find((item) => item.label === "Delete row")!.disabled).toBe(true);
  });
});

describe("structured-table furniture theme tokens", () => {
  // NOTE: happy-dom's CSSStyleDeclaration silently DROPS calc() values that
  // contain var() (they read back as ""), so these tests pin the calc strings
  // at the source (HANDLE_OFFSET_CALC / paddedRectStyle) instead of reading
  // them off the rendered DOM — the live Playwright pass covers the real-DOM
  // resolution.
  it("pills consume the themed corner radius and sit off-edge via the offset var", () => {
    const { container } = renderView();
    fireEvent.mouseEnter(container.querySelectorAll("tbody td")[0]!);
    const columnHandle = query(container, "[data-table-column-handle]")!;
    const rowHandle = query(container, "[data-table-row-handle]")!;
    for (const handle of [columnHandle, rowHandle]) {
      expect(handle.className).toContain("rounded-[var(--docs-table-handle-radius,3px)]");
      expect(handle.className).not.toContain("rounded-lg");
    }
    // The off-edge axis is a calc() over the themed offset var (fallback =
    // the semantic.css default); the in-edge axis stays a measured number.
    expect(HANDLE_OFFSET_CALC).toBe("calc(-1 * var(--docs-table-handle-offset, 12px))");
  });

  it("selection and drag-region overlays expand by the selection padding on all sides", () => {
    const rect = { left: 10, top: 20, width: 100, height: 40 };
    expect(paddedRectStyle(rect)).toEqual({
      left: "calc(10px - var(--docs-table-selection-pad, 3px))",
      top: "calc(20px - var(--docs-table-selection-pad, 3px))",
      width: "calc(100px + 2 * var(--docs-table-selection-pad, 3px))",
      height: "calc(40px + 2 * var(--docs-table-selection-pad, 3px))",
    });

    // Both overlays mount with the padded style (values themselves are pinned
    // above — happy-dom can't round-trip calc(var()) inline styles).
    const selection = render(<SelectionOverlay rect={rect} />);
    expect(
      query(selection.container as HTMLElement, "[data-table-selection-overlay]"),
    ).toBeTruthy();
    const dragRegion = render(<DragRegionOverlay rect={rect} />);
    expect(query(dragRegion.container as HTMLElement, "[data-table-drag-region]")).toBeTruthy();
  });
});

describe("structured-table reorder drag", () => {
  it("planReorderDrop lands forward drags after the crossed block and backward drags before it", () => {
    const offsets = [0, 100, 200, 300];
    // Dragging block 0 to offset 120: its end (220) passes block 1's center (150).
    expect(planReorderDrop(offsets, 0, 120)).toEqual({ targetIndex: 1, slotIndex: 2 });
    // Dragging block 2 back to offset 50: passes block 1's center (150), not block 0's (50).
    expect(planReorderDrop(offsets, 2, 50)).toEqual({ targetIndex: 1, slotIndex: 1 });
    // No boundary crossed: stays put.
    expect(planReorderDrop(offsets, 1, 100)).toEqual({ targetIndex: 1, slotIndex: 1 });
  });

  function mockColumnGeometry(container: HTMLElement) {
    const surface = query(container, "[data-structured-table-surface]")!;
    mockRect(surface, { left: 0, top: 0, width: 200, height: 80 });
    const headers = container.querySelectorAll("thead th");
    mockRect(headers[0]!, { left: 0, top: 0, width: 100, height: 30 });
    mockRect(headers[1]!, { left: 100, top: 0, width: 100, height: 30 });
    return surface;
  }

  it("dragging a column past a boundary shows the drop indicator and commits moveColumn", () => {
    const { container, calls } = renderView();
    mockColumnGeometry(container);

    fireEvent.mouseEnter(container.querySelectorAll("thead th")[0]!);
    const handle = query(container, "[data-table-column-handle]")!;
    fireEvent.mouseDown(handle, { button: 0, clientX: 50, clientY: 8 });
    fireEvent.mouseMove(document, { clientX: 170, clientY: 8 });

    // Offsets [0,100,200], dragged start 0+120 → target 1, slot 2 → gap at 200.
    const indicator = query(container, "[data-table-drop-indicator]")!;
    expect(indicator.getAttribute("data-table-drop-indicator")).toBe("column");
    expect(indicator.style.left).toBe("198.5px");
    expect(query(container, "[data-table-drag-region]")).toBeTruthy();
    // Floating clone follows the pointer with the dragged column's texts.
    const preview = query(container, "[data-table-drag-preview]")!;
    expect(preview.getAttribute("data-table-drag-preview")).toBe("column");
    expect(preview.textContent).toBe("Axz");

    fireEvent.mouseUp(document);
    expect(query(container, "[data-table-drag-preview]")).toBeNull();
    expect(calls).toEqual([
      { blockProps: { columns: ["B", "A"], rows: [["y", "x"], ["w", "z"]] } },
    ]);
    expect(query(container, "[data-table-drop-indicator]")).toBeNull();
  });

  it("dragging a row down commits moveRow against body-row offsets", () => {
    const THREE_ROWS: TableData = {
      columns: ["A", "B"],
      rows: [
        ["r0a", "r0b"],
        ["r1a", "r1b"],
        ["r2a", "r2b"],
      ],
    };
    const { container, calls } = renderView(THREE_ROWS);
    const surface = query(container, "[data-structured-table-surface]")!;
    mockRect(surface, { left: 0, top: 0, width: 200, height: 150 });
    const bodyRows = container.querySelectorAll("tbody tr");
    bodyRows.forEach((row, index) => {
      mockRect(row.querySelector("td")!, { left: 0, top: index * 40, width: 100, height: 40 });
    });

    fireEvent.mouseEnter(container.querySelectorAll("tbody td")[0]!);
    const handle = query(container, "[data-table-row-handle]")!;
    fireEvent.mouseDown(handle, { button: 0, clientX: 0, clientY: 20 });
    fireEvent.mouseMove(document, { clientX: 0, clientY: 80 });

    // Offsets [0,40,80,120], dragged start 0+60 → end 100 passes row 1's center (60) → target 1.
    const indicator = query(container, "[data-table-drop-indicator]")!;
    expect(indicator.getAttribute("data-table-drop-indicator")).toBe("row");
    expect(indicator.style.top).toBe("78.5px");

    fireEvent.mouseUp(document);
    expect(calls).toEqual([
      {
        blockProps: {
          columns: ["A", "B"],
          rows: [
            ["r1a", "r1b"],
            ["r0a", "r0b"],
            ["r2a", "r2b"],
          ],
        },
      },
    ]);
  });

  it("stays a click inside the 10px dead zone (menu opens, nothing commits)", () => {
    const { container, calls } = renderView();
    mockColumnGeometry(container);
    fireEvent.mouseEnter(container.querySelectorAll("thead th")[0]!);
    const handle = query(container, "[data-table-column-handle]")!;

    fireEvent.mouseDown(handle, { button: 0, clientX: 50, clientY: 8 });
    fireEvent.mouseMove(document, { clientX: 55, clientY: 10 });
    expect(query(container, "[data-table-drop-indicator]")).toBeNull();
    fireEvent.mouseUp(document);

    expect(query(container.ownerDocument.body, "[data-table-handle-menu]")).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("Escape cancels an active drag without committing", () => {
    const { container, calls } = renderView();
    mockColumnGeometry(container);
    fireEvent.mouseEnter(container.querySelectorAll("thead th")[0]!);
    const handle = query(container, "[data-table-column-handle]")!;

    fireEvent.mouseDown(handle, { button: 0, clientX: 50, clientY: 8 });
    fireEvent.mouseMove(document, { clientX: 170, clientY: 8 });
    expect(query(container, "[data-table-drop-indicator]")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(query(container, "[data-table-drop-indicator]")).toBeNull();
    fireEvent.mouseUp(document);
    expect(calls).toEqual([]);
  });
});

describe("structured-table overlay geometry", () => {
  function fakeCell(surface: HTMLElement, tag: "th" | "td", rect: PlainRect): HTMLElement {
    const box = document.createElement(tag);
    const content = document.createElement("div");
    box.appendChild(content);
    surface.appendChild(box);
    mockRect(box, rect);
    return content;
  }

  it("measures cell boxes relative to the surface and unions selection ranges", () => {
    const surface = document.createElement("div");
    mockRect(surface, { left: 10, top: 20, width: 300, height: 100 });
    const cells: CellRectMap = new Map();
    cells.set(
      cellRectKey(-1, 0),
      fakeCell(surface, "th", { left: 10, top: 20, width: 100, height: 30 }),
    );
    cells.set(
      cellRectKey(0, 0),
      fakeCell(surface, "td", { left: 10, top: 50, width: 100, height: 40 }),
    );

    expect(relativeRect(surface, surface)).toEqual({ left: 0, top: 0, width: 300, height: 100 });
    const union = unionRect(
      rangeRects(cells, surface, { row: -1, col: 0 }, { row: 0, col: 0 }),
    );
    expect(union).toEqual({ left: 0, top: 0, width: 100, height: 70 });
  });

  it("builds column and row boundary offsets with the trailing edge appended", () => {
    const surface = document.createElement("div");
    mockRect(surface, { left: 0, top: 0, width: 300, height: 100 });
    const cells: CellRectMap = new Map();
    cells.set(
      cellRectKey(-1, 0),
      fakeCell(surface, "th", { left: 0, top: 0, width: 120, height: 30 }),
    );
    cells.set(
      cellRectKey(-1, 1),
      fakeCell(surface, "th", { left: 120, top: 0, width: 80, height: 30 }),
    );
    cells.set(
      cellRectKey(0, 0),
      fakeCell(surface, "td", { left: 0, top: 30, width: 120, height: 40 }),
    );
    cells.set(
      cellRectKey(1, 0),
      fakeCell(surface, "td", { left: 0, top: 70, width: 120, height: 25 }),
    );

    expect(columnOffsets(cells, surface, 2)).toEqual([0, 120, 200]);
    expect(rowOffsets(cells, surface, 2)).toEqual([30, 70, 95]);
    // Unmeasurable cells yield null rather than a partial offsets array.
    expect(columnOffsets(cells, surface, 3)).toBeNull();
    expect(rowOffsets(cells, surface, 3)).toBeNull();
  });
});

describe("structured-table stale-commit protection", () => {
  it("flushes a focused cell's pending edit BEFORE a menu action, composing both commits", () => {
    const { container, calls, history } = renderView();
    const cell = container.querySelectorAll<HTMLElement>('[role="textbox"]')[2]!; // row 0, col 0
    cell.focus();
    expect(document.activeElement).toBe(cell);
    cell.textContent = "typed";
    fireEvent.input(cell); // pending debounce — must NOT be lost by the move

    fireEvent.mouseEnter(container.querySelectorAll("tbody td")[0]!);
    clickHandle(query(container, "[data-table-row-handle]")!);
    const menu = query(container.ownerDocument.body, "[data-table-handle-menu]")!;
    const moveDown = Array.from(menu.querySelectorAll("button")).find(
      (button) => button.textContent === "Move down",
    )!;
    fireEvent.click(moveDown);

    // First the flushed cell edit at its ORIGINAL position, then the move
    // carrying the edited text to the new position.
    expect(calls).toEqual([
      { blockProps: { columns: ["A", "B"], rows: [["typed", "y"], ["z", "w"]] } },
      { blockProps: { columns: ["A", "B"], rows: [["z", "w"], ["typed", "y"]] } },
    ]);
    // The flush blurred the cell and focus went back to the editor view.
    expect(document.activeElement).not.toBe(cell);
    expect(history).toContain("focus");
  });

  it("a structural op with no pending edit commits exactly once", () => {
    const { container, calls } = renderView();
    const cell = container.querySelectorAll<HTMLElement>('[role="textbox"]')[2]!;
    cell.focus(); // focused but CLEAN — nothing to flush

    fireEvent.mouseEnter(container.querySelectorAll("tbody td")[0]!);
    clickHandle(query(container, "[data-table-row-handle]")!);
    const menu = query(container.ownerDocument.body, "[data-table-handle-menu]")!;
    const moveDown = Array.from(menu.querySelectorAll("button")).find(
      (button) => button.textContent === "Move down",
    )!;
    fireEvent.click(moveDown);

    expect(calls).toEqual([
      { blockProps: { columns: ["A", "B"], rows: [["z", "w"], ["x", "y"]] } },
    ]);
  });

  it("Mod-Z / Mod-Shift-Z / Mod-Y inside a cell reach the editor's history", () => {
    const { container, history } = renderView();
    const cell = container.querySelectorAll<HTMLElement>('[role="textbox"]')[2]!;
    cell.focus();
    fireEvent.keyDown(cell, { key: "z", metaKey: true });
    fireEvent.keyDown(cell, { key: "z", metaKey: true, shiftKey: true });
    fireEvent.keyDown(cell, { key: "y", ctrlKey: true });
    expect(history).toEqual(["undo", "redo", "redo"]);
  });

  it("closing the menu without an action still hands focus back to the editor view", () => {
    const { container, history } = renderView();
    fireEvent.mouseEnter(container.querySelectorAll("thead th")[0]!);
    clickHandle(query(container, "[data-table-column-handle]")!);
    expect(query(container.ownerDocument.body, "[data-table-handle-menu]")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(query(container.ownerDocument.body, "[data-table-handle-menu]")).toBeNull();
    expect(history).toContain("focus");
  });
});

describe("EditableCell external-value sync", () => {
  const noop = () => {};
  const cellProps = (value: string, onCommit: (next: string) => void = noop) => ({
    value,
    editable: true,
    ariaLabel: "cell",
    onCommit,
    onNavigate: noop,
    registerElement: noop,
  });

  it("syncs a focused-but-CLEAN cell's DOM when the external value changes", () => {
    const { container, rerender } = render(<EditableCell {...cellProps("a")} />);
    const element = container.querySelector<HTMLElement>('[role="textbox"]')!;
    element.focus();
    expect(document.activeElement).toBe(element);
    rerender(<EditableCell {...cellProps("b")} />);
    expect(element.textContent).toBe("b");
  });

  it("never touches a focused cell's DOM while it holds a pending local edit", () => {
    const commits: string[] = [];
    const onCommit = (next: string) => commits.push(next);
    const { container, rerender } = render(<EditableCell {...cellProps("a", onCommit)} />);
    const element = container.querySelector<HTMLElement>('[role="textbox"]')!;
    element.focus();
    element.textContent = "a-typed";
    fireEvent.input(element);
    rerender(<EditableCell {...cellProps("b", onCommit)} />);
    expect(element.textContent).toBe("a-typed"); // caret protection intact
    // Blur commits the pending text (committedRef tracks the external "b").
    fireEvent.blur(element);
    expect(commits).toEqual(["a-typed"]);
  });

  it("keeps syncing an unfocused cell as before", () => {
    const { container, rerender } = render(<EditableCell {...cellProps("a")} />);
    const element = container.querySelector<HTMLElement>('[role="textbox"]')!;
    rerender(<EditableCell {...cellProps("b")} />);
    expect(element.textContent).toBe("b");
  });

  it("Mod-A selects only the cell's contents, never the outer document", () => {
    const { container } = render(<EditableCell {...cellProps("hello")} />);
    const element = container.querySelector<HTMLElement>('[role="textbox"]')!;
    element.focus();

    // stopPropagation must keep the keystroke from any editor-level listener.
    const leaks: KeyboardEvent[] = [];
    const listen = (event: KeyboardEvent) => leaks.push(event);
    document.addEventListener("keydown", listen);
    try {
      const event = createEvent.keyDown(element, { key: "a", metaKey: true });
      fireEvent(element, event);
      // preventDefault blocks the browser's native select-all on the outer
      // editing host — the confirmed whole-document data-loss path.
      expect(event.defaultPrevented).toBe(true);
      expect(leaks).toEqual([]);

      const selection = window.getSelection()!;
      expect(element.contains(selection.anchorNode)).toBe(true);
      expect(element.contains(selection.focusNode)).toBe(true);
      expect(selection.toString()).toBe("hello");

      // A second consecutive press keeps the cell-scoped selection.
      fireEvent.keyDown(element, { key: "a", metaKey: true });
      const again = window.getSelection()!;
      expect(element.contains(again.anchorNode)).toBe(true);
      expect(element.contains(again.focusNode)).toBe(true);
    } finally {
      document.removeEventListener("keydown", listen);
    }
  });
});
