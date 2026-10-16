import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { useState } from "react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { TableCell } from "@codecaine-ai/docs-model";
import {
  EditableCell,
  HOVER_DWELL_MS,
  ensureCellEditor,
  getCellEditor,
} from "../components/structured-table/editor/EditableCell";
import { StructuredTableNodeView } from "../components/structured-table/editor-node-view";
import { TableGrid } from "../components/structured-table/editor/TableGrid";
import type { TableData } from "../components/structured-table/editor/mutations";

/**
 * Lazy cell editors: an edit-mode structured-table cell renders the editor's
 * markup statically and mounts its TipTap instance only on focus, pointerdown
 * or a resting pointer, releasing it at idle afterwards. Idle callbacks are
 * queued by a fake requestIdleCallback and flushed explicitly, so release
 * timing is deterministic.
 */

let idleQueue: Array<() => void> = [];

beforeEach(() => {
  idleQueue = [];
  globalThis.requestIdleCallback = ((callback: IdleRequestCallback) => {
    idleQueue.push(() => callback({ didTimeout: false, timeRemaining: () => 50 }));
    return idleQueue.length;
  }) as typeof requestIdleCallback;
  globalThis.cancelIdleCallback = ((handle: number) => {
    idleQueue[handle - 1] = () => {};
  }) as typeof cancelIdleCallback;
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
  delete (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback;
  delete (globalThis as { cancelIdleCallback?: unknown }).cancelIdleCallback;
});

function flushIdle() {
  act(() => {
    const queued = idleQueue;
    idleQueue = [];
    for (const run of queued) run();
  });
}

const noop = () => {};

function liveEditors(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror"));
}

function cells(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="textbox"]'));
}

function renderGrid(data: TableData, onCommitCell = noop as (r: number, c: number, v: TableCell) => void) {
  return render(
    <TableGrid
      data={data}
      editable
      onCommitHeader={noop}
      onCommitCell={onCommitCell}
      onHoverCell={noop}
    />,
  );
}

/** ~20-colours scale: 7 columns x 200 rows + header = 1,407 cells. */
function bigTable(): TableData {
  const columns = ["Name", "Hex", "Pigment", "Lightfast", "Notes", "Code", "Link"];
  const rows: TableCell[][] = Array.from({ length: 200 }, (_, row) => [
    `Colour ${row}`,
    `#${(row * 4099).toString(16).padStart(6, "0").slice(0, 6)}`,
    [{ insert: "PB", attributes: { bold: true } }, { insert: ` ${row}` }],
    row % 3 === 0 ? "I" : "II",
    `Line one\nline two for ${row}`,
    [{ insert: `c${row}`, attributes: { code: true } }],
    [{ insert: "ref", attributes: { link: `https://example.com/${row}` } }],
  ]);
  return { columns, rows };
}

describe("lazy structured-table cell editors", () => {
  it("mounts a ~1,400-cell table without a single live editor", () => {
    const data = bigTable();
    const mountStart = performance.now();
    const { container, unmount } = renderGrid(data);
    const mountMs = performance.now() - mountStart;

    expect(cells(container).length).toBe(1407);
    expect(liveEditors(container).length).toBe(0);
    expect(cells(container)[16]!.textContent).toBe("PB 1");

    const unmountStart = performance.now();
    unmount();
    const unmountMs = performance.now() - unmountStart;
    console.log(
      `[lazy-cells] 1,407-cell grid: mount ${mountMs.toFixed(0)} ms, unmount ${unmountMs.toFixed(0)} ms`,
    );
    // Loose ceiling (the eager grid took seconds under happy-dom); the
    // structural assertions above are the real contract.
    expect(mountMs).toBeLessThan(5000);
  });

  it("keeps a live editor only in the focused cell as focus moves", () => {
    const { container } = renderGrid({
      columns: ["A", "B"],
      rows: [
        ["a1", "b1"],
        ["a2", "b2"],
      ],
    });
    const all = cells(container);
    const first = all[2]!;
    const second = all[3]!;

    act(() => first.focus());
    expect(liveEditors(container)).toEqual([first]);
    expect(getCellEditor(first)?.isFocused ?? document.activeElement === first).toBe(true);

    // Tab inside the live editor commits, then focuses the next cell, which
    // mounts its own editor in place.
    act(() => {
      fireEvent.keyDown(first, { key: "Tab" });
    });
    expect(document.activeElement).toBe(second);
    expect(getCellEditor(second)).toBeDefined();

    flushIdle();
    expect(liveEditors(container)).toEqual([second]);
    expect(getCellEditor(first)).toBeUndefined();
    expect(first.getAttribute("contenteditable")).toBeNull();
    expect(first.textContent).toBe("a1");
  });

  it("an idle cell carries exactly the markup its mounted editor renders", () => {
    const values: TableCell[] = [
      "",
      "plain",
      "two\nlines",
      "trailing\n",
      "uses `code` ticks",
      [
        { insert: "bold", attributes: { bold: true } },
        { insert: " it", attributes: { italic: true } },
        { insert: " gone", attributes: { strike: true } },
        { insert: " link", attributes: { link: "https://example.com" } },
      ],
    ];
    for (const value of values) {
      const { container, unmount } = render(
        <EditableCell
          value={value}
          editable
          ariaLabel="Cell"
          onCommit={noop}
          onNavigate={noop}
          registerElement={noop}
        />,
      );
      const element = cells(container)[0]!;
      const idleMarkup = element.innerHTML;
      act(() => {
        ensureCellEditor(element);
      });
      expect(element.classList.contains("ProseMirror")).toBe(true);
      expect(element.innerHTML).toBe(idleMarkup);
      unmount();
    }
  });

  it("releases into the same element with its idle attributes and the committed value", () => {
    const commits: TableCell[] = [];
    const registered: Array<HTMLElement | null> = [];
    const { container } = render(
      <EditableCell
        value="before"
        editable
        ariaLabel="Row 1, column 1"
        onCommit={(next) => commits.push(next)}
        onNavigate={noop}
        registerElement={(element) => registered.push(element)}
      />,
    );
    const element = cells(container)[0]!;
    const idleClass = element.className;

    // A resting pointer warms the editor; an edit made without focus still
    // commits when the pointer leaves and the idle release runs.
    jest.useFakeTimers();
    act(() => {
      fireEvent.pointerEnter(element.parentElement!, { pointerType: "mouse" });
    });
    expect(getCellEditor(element)).toBeUndefined();
    act(() => jest.advanceTimersByTime(HOVER_DWELL_MS));
    const editor = getCellEditor(element)!;
    expect(editor).toBeDefined();
    act(() => {
      editor.commands.setContent(
        { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "after" }] }] },
        { emitUpdate: true },
      );
    });
    act(() => {
      fireEvent.pointerLeave(element.parentElement!, { pointerType: "mouse" });
    });
    flushIdle();

    expect(commits).toEqual(["after"]);
    expect(editor.isDestroyed).toBe(true);
    expect(getCellEditor(element)).toBeUndefined();
    expect(element.className).toBe(idleClass);
    expect(element.getAttribute("contenteditable")).toBeNull();
    expect(element.getAttribute("aria-label")).toBe("Row 1, column 1");
    expect(element.textContent).toBe("after");
    expect(registered).toEqual([element]);
  });

  it("never releases a focused cell, even after the pointer leaves", () => {
    const { container } = render(
      <EditableCell value="x" editable ariaLabel="Cell" onCommit={noop} onNavigate={noop} registerElement={noop} />,
    );
    const element = cells(container)[0]!;
    jest.useFakeTimers();
    act(() => {
      fireEvent.pointerEnter(element.parentElement!, { pointerType: "mouse" });
      jest.advanceTimersByTime(HOVER_DWELL_MS);
      element.focus();
      fireEvent.pointerLeave(element.parentElement!, { pointerType: "mouse" });
    });
    flushIdle();
    expect(getCellEditor(element)).toBeDefined();

    act(() => element.blur());
    flushIdle();
    expect(getCellEditor(element)).toBeUndefined();
  });

  it("mounts on pointerdown when no hover came first", () => {
    const { container } = render(
      <EditableCell value="tap" editable ariaLabel="Cell" onCommit={noop} onNavigate={noop} registerElement={noop} />,
    );
    const element = cells(container)[0]!;
    act(() => {
      fireEvent.pointerDown(element, { pointerType: "touch", clientX: 0, clientY: 0 });
    });
    expect(getCellEditor(element)).toBeDefined();
    expect(document.activeElement).toBe(element);
  });

  it("redraws an idle cell when its value changes", () => {
    const props = { editable: true, ariaLabel: "Cell", onCommit: noop, onNavigate: noop, registerElement: noop };
    const { container, rerender } = render(<EditableCell value="one" {...props} />);
    rerender(<EditableCell value={[{ insert: "two", attributes: { bold: true } }]} {...props} />);
    const element = cells(container)[0]!;
    expect(element.querySelector("strong")?.textContent).toBe("two");
    expect(liveEditors(container).length).toBe(0);
  });

  it("a quick sweep across 50 cells mounts no editor", () => {
    const { container } = renderGrid({
      columns: ["A", "B", "C", "D", "E"],
      rows: Array.from({ length: 10 }, (_, row) => ["a", "b", "c", "d", "e"].map((c) => `${c}${row}`)),
    });
    const body = cells(container).slice(5);
    expect(body.length).toBe(50);
    jest.useFakeTimers();
    for (const cell of body) {
      act(() => {
        fireEvent.pointerEnter(cell.parentElement!, { pointerType: "mouse" });
        jest.advanceTimersByTime(HOVER_DWELL_MS - 100);
        fireEvent.pointerLeave(cell.parentElement!, { pointerType: "mouse" });
      });
    }
    act(() => jest.advanceTimersByTime(HOVER_DWELL_MS * 10));
    expect(liveEditors(container).length).toBe(0);

    // Resting on the last one does mount it.
    const last = body[49]!;
    act(() => {
      fireEvent.pointerEnter(last.parentElement!, { pointerType: "mouse" });
      jest.advanceTimersByTime(HOVER_DWELL_MS);
    });
    expect(liveEditors(container)).toEqual([last]);
  });

  it("idle and live cells compute the same white-space for spaces and newlines", () => {
    // TipTap's own stylesheet (injected when a cell editor mounts) plus the
    // utility the cell carries; the cell sits in a non-editable node-view
    // wrapper inside the outer .ProseMirror, as in the editor.
    const utilities = document.createElement("style");
    utilities.textContent = ".whitespace-pre-wrap { white-space: pre-wrap; } .whitespace-break-spaces { white-space: break-spaces; }";
    document.head.appendChild(utilities);
    const outer = document.createElement("div");
    outer.className = "ProseMirror";
    const wrapper = document.createElement("div");
    wrapper.setAttribute("contenteditable", "false");
    outer.appendChild(wrapper);
    document.body.appendChild(outer);
    try {
      const values: TableCell[] = ["two  spaces", "trailing   ", "line\nbreak  ", "  lead"];
      for (const value of values) {
        const { container, unmount } = render(
          <EditableCell value={value} editable ariaLabel="Cell" onCommit={noop} onNavigate={noop} registerElement={noop} />,
          { container: wrapper.appendChild(document.createElement("div")) },
        );
        const element = cells(container)[0]!;
        const idleText = element.textContent;
        const idleHtml = element.innerHTML;
        act(() => element.focus());
        expect(getCellEditor(element)).toBeDefined();
        expect(document.querySelector("style[data-tiptap-style]")).toBeTruthy();
        const live = getComputedStyle(element).whiteSpace;
        expect(live).toBe("pre-wrap");
        expect(element.innerHTML).toBe(idleHtml);
        expect(element.textContent).toBe(idleText);
        act(() => element.blur());
        flushIdle();
        expect(getCellEditor(element)).toBeUndefined();
        expect(getComputedStyle(element).whiteSpace).toBe(live);
        unmount();
      }
    } finally {
      outer.remove();
      utilities.remove();
    }
  });

  it("undo/redo reach the document history across release and reactivation", () => {
    // A stand-in for the outer editor: blockProps live in state, every
    // updateAttributes is a history step, and undo/redo walk that history.
    const history: Array<Record<string, unknown>> = [];
    let redoStack: Array<Record<string, unknown>> = [];
    function Host() {
      const [blockProps, setBlockProps] = useState<Record<string, unknown>>({
        columns: ["A"],
        rows: [["x"]],
      });
      const props = {
        node: { attrs: { blockId: "tbl-1", blockProps }, type: { name: "docStructuredTable" } },
        editor: {
          isEditable: true,
          isDestroyed: false,
          view: { focus: () => {} },
          commands: {
            undo: () => {
              const previous = history.pop();
              if (!previous) return;
              setBlockProps((current) => {
                redoStack.push(current);
                return previous;
              });
            },
            redo: () => {
              const next = redoStack.pop();
              if (!next) return;
              setBlockProps((current) => {
                history.push(current);
                return next;
              });
            },
          },
        },
        updateAttributes: (attrs: { blockProps: Record<string, unknown> }) =>
          setBlockProps((current) => {
            history.push(current);
            redoStack = [];
            return attrs.blockProps;
          }),
      } as unknown as ReactNodeViewProps;
      return <StructuredTableNodeView {...props} />;
    }
    const { container } = render(<Host />);
    const cell = cells(container)[1]!; // row 0, col 0

    // Edit, blur, and let the idle release tear the editor down.
    act(() => cell.focus());
    act(() => {
      getCellEditor(cell)!.commands.setContent(
        { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "edited" }] }] },
        { emitUpdate: true },
      );
    });
    act(() => cell.blur());
    flushIdle();
    expect(getCellEditor(cell)).toBeUndefined();
    expect(cell.textContent).toBe("edited");

    // Reactivate; Mod-Z inside the cell undoes the earlier edit and the clean,
    // focused editor follows the restored value.
    act(() => cell.focus());
    const editor = getCellEditor(cell)!;
    fireEvent.keyDown(cell, { key: "z", ctrlKey: true });
    expect(editor.getText()).toBe("x");
    fireEvent.keyDown(cell, { key: "y", ctrlKey: true });
    expect(editor.getText()).toBe("edited");

    // Undo while idle redraws the static cell; the next editor starts from it.
    act(() => cell.blur());
    flushIdle();
    expect(getCellEditor(cell)).toBeUndefined();
    act(() => cell.focus());
    fireEvent.keyDown(cell, { key: "z", ctrlKey: true });
    act(() => cell.blur());
    flushIdle();
    expect(cell.textContent).toBe("x");
    act(() => cell.focus());
    expect(getCellEditor(cell)!.getText()).toBe("x");
  });
});
