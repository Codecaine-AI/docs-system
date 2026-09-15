import { afterEach, describe, expect, it } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { Node, type Editor } from "@tiptap/core";
import { EditorContent, useEditor, type ReactNodeViewProps } from "@tiptap/react";
import { DocProcessOutlineWithView } from "../editor/views/node-views";
import { readProcessOutlineSteps, type ProcessOutlineStep } from "@codecaine-ai/docs-model";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import { ProcessOutlineDocsBlock } from "../components/process-outline/ProcessOutlineDocsBlock";
import { ProcessOutlineNodeView } from "../components/process-outline/editor-node-view";
import { readStepsFromProps } from "../components/process-outline/editor/outline-edit";

afterEach(() => {
  cleanup();
});

/**
 * Root
 *   Phase A
 *     Deep with a `chip`
 *     > a clarification
 *   Phase B
 * Second root
 */
const TREE: ProcessOutlineStep[] = [
  {
    text: "Root",
    steps: [
      {
        text: "Phase A",
        steps: [{ text: "Deep with a `chip`" }, { text: "a clarification", kind: "note" }],
      },
      { text: "Phase B" },
    ],
  },
  { text: "Second root" },
];

type UpdateCall = { blockProps: Record<string, unknown> };

function nodeViewProps(
  steps: ProcessOutlineStep[],
  editable = true,
): { props: ReactNodeViewProps; calls: UpdateCall[]; history: string[] } {
  const calls: UpdateCall[] = [];
  const history: string[] = [];
  const props = {
    node: {
      attrs: { blockId: "po-1", blockProps: { steps } },
      type: { name: "docProcessOutline" },
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

/** Node view whose committed attrs feed straight back in, so structural edits really re-render. */
function LiveNodeView({
  initial,
  calls,
  history,
  onExternal,
}: {
  initial: ProcessOutlineStep[];
  calls: UpdateCall[];
  history: string[];
  /** Hands out a setter so a test can land props the way an agent edit or an undo would. */
  onExternal?: (set: (steps: ProcessOutlineStep[]) => void) => void;
}) {
  const [blockProps, setBlockProps] = useState<Record<string, unknown>>({ steps: initial });
  useEffect(() => {
    onExternal?.((steps) => setBlockProps({ steps }));
  }, [onExternal]);
  const props = {
    node: {
      attrs: { blockId: "po-1", blockProps },
      type: { name: "docProcessOutline" },
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
    updateAttributes: (attrs: UpdateCall) => {
      calls.push(attrs);
      setBlockProps(attrs.blockProps);
    },
  } as unknown as ReactNodeViewProps;
  return <ProcessOutlineNodeView {...props} />;
}

function renderLive(initial: ProcessOutlineStep[] = TREE) {
  const calls: UpdateCall[] = [];
  const history: string[] = [];
  let external: (steps: ProcessOutlineStep[]) => void = () => {};
  const rendered = render(
    <LiveNodeView
      initial={initial}
      calls={calls}
      history={history}
      onExternal={(set) => {
        external = set;
      }}
    />,
  );
  /** Land a tree from OUTSIDE the node view (an agent edit, an undo, a collaborator). */
  const landExternal = (steps: ProcessOutlineStep[]) => {
    act(() => {
      external(steps);
    });
  };
  return { ...rendered, calls, history, landExternal };
}

/** The current step tree as the view has committed it (falls back to the seed). */
function committed(calls: UpdateCall[], initial: ProcessOutlineStep[] = TREE): ProcessOutlineStep[] {
  const last = calls[calls.length - 1];
  return readStepsFromProps(last ? last.blockProps : { steps: initial });
}

function lineAt(container: HTMLElement, path: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-process-outline-step="${path}"]`);
  if (!element) throw new Error(`no step line at ${path}`);
  return element;
}

/** Click a chipped line; the island for that path replaces it. */
function focusLine(container: HTMLElement, path: string): HTMLElement {
  act(() => {
    fireEvent.mouseDown(lineAt(container, path));
  });
  const island = lineAt(container, path);
  expect(island.getAttribute("data-process-outline-step-editing")).toBe("true");
  return island;
}

/** Type into the focused island the way the browser does: DOM text, then an input event. */
function typeInto(island: HTMLElement, text: string) {
  island.textContent = text;
  act(() => {
    fireEvent.input(island);
  });
}

function press(island: HTMLElement, key: string, modifiers: Record<string, boolean> = {}) {
  act(() => {
    fireEvent.keyDown(island, { key, ...modifiers });
  });
}

/** The line element for a path, whichever face it is showing. */
function rowAt(container: HTMLElement, path: string): HTMLElement {
  const line = lineAt(container, path).closest<HTMLElement>(".docs-process-outline__line");
  if (!line) throw new Error(`no row at ${path}`);
  return line;
}

/** Pins a box on an element so the geometry half of hit-testing has something to read. */
function stubRect(element: HTMLElement, rect: Partial<DOMRect>) {
  const full = { top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: 0, ...rect };
  element.getBoundingClientRect = () => ({ ...full, toJSON: () => full }) as DOMRect;
}

/** Stacks every step line at 30px intervals, so "which row is nearest y" is a real question. */
function stackRows(container: HTMLElement) {
  const lines = Array.from(container.querySelectorAll<HTMLElement>("[data-process-outline-step]"));
  lines.forEach((line, index) => {
    stubRect(line, { top: index * 30, bottom: index * 30 + 20 });
  });
  return lines;
}

/** Makes the browser's caret-from-point answer `offset` inside `element`'s deepest text. */
function stubCaretPoint(element: HTMLElement, offset: number) {
  // `Node` in this file is ProseMirror's; the DOM one needs naming explicitly.
  type DomNode = globalThis.Node;
  const walk = (node: DomNode): DomNode | null => {
    if (node.nodeType === 3) return node;
    for (const child of Array.from(node.childNodes)) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  const textNode = walk(element);
  const document_ = element.ownerDocument as unknown as { caretPositionFromPoint?: unknown };
  document_.caretPositionFromPoint = () => (textNode ? { offsetNode: textNode, offset } : null);
  return () => {
    document_.caretPositionFromPoint = undefined;
  };
}

/** The paths currently carrying the line-range highlight, top to bottom. */
function selectedPaths(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-process-outline-step-selected="true"]'),
  ).map((line) => line.getAttribute("data-process-outline-step") ?? "");
}

/** The hidden island a live line range focuses (clipboard + keyboard target). */
function rangeHolder(container: HTMLElement): HTMLElement {
  const holder = container.querySelector<HTMLElement>("[data-process-outline-range]");
  if (!holder) throw new Error("no line range");
  return holder;
}

/** Press-drag-release across lines, the way a mouse reports it. */
function dragAcross(container: HTMLElement, from: string, to: string) {
  act(() => {
    fireEvent.mouseDown(lineAt(container, from));
  });
  act(() => {
    fireEvent.mouseMove(lineAt(container, to));
  });
  act(() => {
    fireEvent.mouseUp(lineAt(container, to));
  });
}

/** A clipboard stand-in: `fireEvent` hands it to the event, the handler writes into it. */
function fakeClipboard() {
  const store = new Map<string, string>();
  return {
    setData: (type: string, value: string) => void store.set(type, value),
    getData: (type: string) => store.get(type) ?? "",
  };
}

/** Collapse the selection at `offset` inside the island so caret-sensitive keys see it. */
function placeCaret(island: HTMLElement, offset: number) {
  const selection = island.ownerDocument.defaultView?.getSelection?.();
  const textNode = island.firstChild;
  if (!selection || !textNode) return;
  const range = island.ownerDocument.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

describe("ProcessOutlineNodeView read mode", () => {
  it("renders the read surface's DOM byte-for-byte", () => {
    const { props } = nodeViewProps(TREE, false);
    const view = render(<ProcessOutlineNodeView {...props} />);
    const fromView = view.container.querySelector('[data-docs-block-type="process-outline"]')!;

    const block: DocBlock = { id: "po-1", type: "process-outline", props: { steps: TREE }, children: [] };
    const readSurface = render(
      <ProcessOutlineDocsBlock id="po-1" steps={readProcessOutlineSteps(block)} />,
    );
    const fromRead = readSurface.container.querySelector(
      '[data-docs-block-type="process-outline"]',
    )!;

    expect(fromView.outerHTML).toBe(fromRead.outerHTML);
    expect(fromView.querySelector("[data-process-outline-step]")).toBeNull();
  });

  it("keeps the wide lane and the block-locating wrapper attrs", () => {
    const { props } = nodeViewProps(TREE, false);
    const { container } = render(<ProcessOutlineNodeView {...props} />);
    expect(container.querySelector('[data-doc-lane="wide-left"]')).toBeTruthy();
    expect(container.querySelector('[data-block-id="po-1"]')).toBeTruthy();
    expect(container.querySelector('[data-doc-block="process-outline"]')).toBeTruthy();
  });
});

describe("ProcessOutlineNodeView focus", () => {
  it("renders chips on unfocused lines and raw backticks on the focused one", () => {
    const { container } = renderLive();
    const chipped = lineAt(container, "0.0.0");
    expect(chipped.querySelector("[data-process-outline-code]")?.textContent).toBe("chip");
    expect(chipped.textContent).toBe("Deep with a chip");

    const island = focusLine(container, "0.0.0");
    expect(island.textContent).toBe("Deep with a `chip`");
    expect(island.querySelector("[data-process-outline-code]")).toBeNull();
    expect(island.getAttribute("contenteditable")).toBe("true");

    // Every other line stays chipped.
    expect(lineAt(container, "0.0.1").getAttribute("data-process-outline-step-editing")).toBe(
      "false",
    );
  });

  it("gives note bullets their own editable line", () => {
    const { container } = renderLive();
    const island = focusLine(container, "0.0.1");
    expect(island.closest(".docs-process-outline__note-bullet")).toBeTruthy();
    expect(island.textContent).toBe("a clarification");
  });

  it("returns the line to chips on blur", () => {
    const { container } = renderLive();
    const island = focusLine(container, "0.0.0");
    act(() => {
      fireEvent.blur(island);
    });
    expect(lineAt(container, "0.0.0").getAttribute("data-process-outline-step-editing")).toBe(
      "false",
    );
  });
});

/**
 * The hand-editing hardening suite. Every case here is a path where the
 * DEBOUNCED text commit races something else — a face swap, a structural key,
 * an edit landing from outside. They are grouped because they share one
 * invariant: a pending text flush must never apply twice, and must never
 * apply to a tree it was not written against.
 */
describe("ProcessOutlineNodeView commit hardening", () => {
  it("does not duplicate the text when the line returns to chips", () => {
    const { container } = renderLive();
    const island = focusLine(container, "1");
    typeInto(island, "Second root!");
    act(() => {
      fireEvent.blur(island);
    });
    expect(lineAt(container, "1").textContent).toBe("Second root!");
  });

  it("does not duplicate the text across a debounce flush mid-edit", async () => {
    const { container } = renderLive();
    const island = focusLine(container, "1");
    typeInto(island, "One");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    // The flush re-rendered the block underneath a still-focused island.
    expect(lineAt(container, "1").textContent).toBe("One");
    typeInto(island, "One two");
    act(() => {
      fireEvent.blur(island);
    });
    expect(lineAt(container, "1").textContent).toBe("One two");
  });

  it("blurring after the debounce already fired does not commit twice", async () => {
    const { container, calls } = renderLive();
    const island = focusLine(container, "1");
    typeInto(island, "Committed once");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(calls).toHaveLength(1);
    act(() => {
      fireEvent.blur(island);
    });
    expect(calls).toHaveLength(1);
    expect(committed(calls)[1].text).toBe("Committed once");
  });

  it("Enter uses the text on screen, not the last committed text", () => {
    const { container, calls } = renderLive();
    const island = focusLine(container, "1");
    typeInto(island, "Second root plus");
    press(island, "Enter");

    expect(committed(calls).map((step) => step.text)).toEqual(["Root", "Second root plus", ""]);
  });

  it("Tab carries the pending text into the indent", () => {
    const { container, calls } = renderLive();
    const island = focusLine(container, "0.1");
    typeInto(island, "Phase B renamed");
    press(island, "Tab");

    const steps = committed(calls);
    expect(steps[0].steps?.[0].steps?.map((step) => step.text)).toEqual([
      "Deep with a `chip`",
      "a clarification",
      "Phase B renamed",
    ]);
  });

  it("Shift+Tab carries the pending text into the outdent", () => {
    const { container, calls } = renderLive();
    const island = focusLine(container, "0.0.0");
    typeInto(island, "Lifted");
    press(island, "Tab", { shiftKey: true });

    expect(committed(calls)[0].steps?.map((step) => step.text)).toEqual([
      "Phase A",
      "Lifted",
      "Phase B",
    ]);
  });

  it("a structural key cancels the debounce instead of letting it fire after", async () => {
    const { container, calls } = renderLive();
    const island = focusLine(container, "0.1");
    typeInto(island, "Phase B renamed");
    press(island, "Tab");
    const afterKey = calls.length;

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    // The stale pending flush would have re-applied "Phase B renamed" at the
    // OLD path, which no longer holds that step.
    expect(calls).toHaveLength(afterKey);
  });

  it("clicking another line mid-debounce commits the first line once and cleanly", () => {
    const { container, calls } = renderLive();
    const first = focusLine(container, "0.1");
    typeInto(first, "Phase B edited");
    const second = focusLine(container, "1");

    expect(calls).toHaveLength(1);
    expect(lineAt(container, "0.1").textContent).toBe("Phase B edited");
    expect(second.getAttribute("data-process-outline-step-editing")).toBe("true");
  });

  it("two quick edits to different lines both land", () => {
    const { container, calls } = renderLive();
    typeInto(focusLine(container, "0.1"), "Phase B edited");
    typeInto(focusLine(container, "1"), "Second root edited");
    act(() => {
      fireEvent.blur(lineAt(container, "1"));
    });

    const steps = committed(calls);
    expect(steps[0].steps?.[1].text).toBe("Phase B edited");
    expect(steps[1].text).toBe("Second root edited");
  });

  it("drops a pending flush when the tree changes from outside", async () => {
    const { container, calls, landExternal } = renderLive();
    const island = focusLine(container, "1");
    typeInto(island, "typed but never committed");

    // An agent edit / an undo lands while the debounce is still in flight.
    landExternal([{ text: "Root" }, { text: "landed from outside" }]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(calls).toHaveLength(0);
    expect(lineAt(container, "1").textContent).toBe("landed from outside");
  });

  it("adopts an external edit into the focused island", () => {
    const { container, landExternal } = renderLive();
    focusLine(container, "1");
    landExternal([{ text: "Root" }, { text: "renamed elsewhere" }]);
    expect(lineAt(container, "1").textContent).toBe("renamed elsewhere");
  });

  it("undo after typing commits once and leaves no pending flush behind", async () => {
    const { container, calls, history } = renderLive();
    const island = focusLine(container, "1");
    typeInto(island, "Pending");
    press(island, "z", { metaKey: true });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(calls).toHaveLength(1);
    expect(history).toEqual(["undo"]);
  });
});

describe("ProcessOutlineNodeView typing", () => {
  it("commits typed text as one setStepText after the debounce", async () => {
    const { container, calls } = renderLive();
    const island = focusLine(container, "1");
    typeInto(island, "Second root!");
    expect(calls).toHaveLength(0);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(calls).toHaveLength(1);
    expect(committed(calls)[1].text).toBe("Second root!");
  });

  it("flushes the pending text on blur", () => {
    const { container, calls } = renderLive();
    const island = focusLine(container, "1");
    typeInto(island, "Renamed");
    act(() => {
      fireEvent.blur(island);
    });
    expect(calls).toHaveLength(1);
    expect(committed(calls)[1].text).toBe("Renamed");
  });
});

describe("ProcessOutlineNodeView keys", () => {
  it("Enter adds a sibling step below and moves the caret into it", () => {
    const { container, calls } = renderLive();
    press(focusLine(container, "0.1"), "Enter");

    expect(calls).toHaveLength(1);
    expect(committed(calls)[0].steps?.map((step) => step.text)).toEqual([
      "Phase A",
      "Phase B",
      "",
    ]);
    expect(lineAt(container, "0.2").getAttribute("data-process-outline-step-editing")).toBe(
      "true",
    );
  });

  it("Enter splits the line at the caret", () => {
    const { container, calls } = renderLive();
    const island = focusLine(container, "0.1");
    placeCaret(island, 5);
    press(island, "Enter");

    expect(committed(calls)[0].steps?.map((step) => step.text)).toEqual([
      "Phase A",
      "Phase",
      " B",
    ]);
  });

  it("Enter inside a note keeps writing notes", () => {
    const { container, calls } = renderLive();
    press(focusLine(container, "0.0.1"), "Enter");
    expect(committed(calls)[0].steps?.[0].steps?.[2]).toEqual({ text: "", kind: "note" });
  });

  it("Tab nests the step under its previous sibling", () => {
    const { container, calls } = renderLive();
    press(focusLine(container, "0.1"), "Tab");

    expect(calls).toHaveLength(1);
    const steps = committed(calls);
    expect(steps[0].steps).toHaveLength(1);
    expect(steps[0].steps?.[0].steps?.map((step) => step.text)).toEqual([
      "Deep with a `chip`",
      "a clarification",
      "Phase B",
    ]);
    expect(lineAt(container, "0.0.2").getAttribute("data-process-outline-step-editing")).toBe(
      "true",
    );
  });

  it("Tab is refused when the previous sibling is a note", () => {
    const tree: ProcessOutlineStep[] = [
      { text: "n", kind: "note" },
      { text: "after the note" },
    ];
    const { container, calls } = renderLive(tree);
    press(focusLine(container, "1"), "Tab");
    expect(calls).toHaveLength(0);
    expect(committed(calls, tree)).toEqual(tree);
  });

  it("Tab at the top of a sibling list does nothing", () => {
    const { container, calls } = renderLive();
    press(focusLine(container, "0"), "Tab");
    expect(calls).toHaveLength(0);
  });

  it("Shift+Tab lifts the step to its parent's level", () => {
    const { container, calls } = renderLive();
    press(focusLine(container, "0.0.0"), "Tab", { shiftKey: true });

    expect(committed(calls)[0].steps?.map((step) => step.text)).toEqual([
      "Phase A",
      "Deep with a `chip`",
      "Phase B",
    ]);
  });

  it("Shift+Tab at the root level does nothing", () => {
    const { container, calls } = renderLive();
    press(focusLine(container, "1"), "Tab", { shiftKey: true });
    expect(calls).toHaveLength(0);
  });

  it("Backspace at the start of an empty step deletes it and focuses the step above", () => {
    const tree: ProcessOutlineStep[] = [{ text: "keep", steps: [{ text: "child" }] }, { text: "" }];
    const { container, calls } = renderLive(tree);
    press(focusLine(container, "1"), "Backspace");

    expect(calls).toHaveLength(1);
    expect(committed(calls, tree)).toEqual([{ text: "keep", steps: [{ text: "child" }] }]);
    expect(lineAt(container, "0.0").getAttribute("data-process-outline-step-editing")).toBe("true");
  });

  it("Backspace leaves a non-empty step alone", () => {
    const { container, calls } = renderLive();
    const island = focusLine(container, "1");
    placeCaret(island, 0);
    press(island, "Backspace");
    expect(calls).toHaveLength(0);
  });

  it("Backspace refuses to delete an empty step that still owns children", () => {
    const tree: ProcessOutlineStep[] = [{ text: "", steps: [{ text: "child" }] }];
    const { container, calls } = renderLive(tree);
    press(focusLine(container, "0"), "Backspace");
    expect(calls).toHaveLength(0);
  });

  it("Escape commits and leaves the line", () => {
    const { container, calls, history } = renderLive();
    const island = focusLine(container, "1");
    typeInto(island, "Escaped");
    press(island, "Escape");

    expect(committed(calls)[1].text).toBe("Escaped");
    expect(lineAt(container, "1").getAttribute("data-process-outline-step-editing")).toBe("false");
    expect(history).toContain("focus");
  });

  it("routes Mod-Z and Mod-Shift-Z to the outer editor's history", () => {
    const { container, calls, history } = renderLive();
    const island = focusLine(container, "1");
    typeInto(island, "Pending");
    press(island, "z", { metaKey: true });
    press(island, "z", { metaKey: true, shiftKey: true });

    // The pending text is committed before the history runs, so undo has
    // something to undo.
    expect(calls).toHaveLength(1);
    expect(history).toEqual(["undo", "redo"]);
  });
});

describe("ProcessOutlineNodeView note conversion", () => {
  it("turns a step into a note when `> ` is typed at the start", () => {
    const { container, calls } = renderLive();
    const island = focusLine(container, "0.1");
    typeInto(island, "> Phase B");

    expect(calls).toHaveLength(1);
    expect(committed(calls)[0].steps?.[1]).toEqual({ text: "Phase B", kind: "note" });
    expect(container.querySelectorAll("[data-process-outline-note='true']")).toHaveLength(2);
  });

  it("refuses the conversion for a step with children and leaves the marker as text", async () => {
    const { container, calls } = renderLive();
    const island = focusLine(container, "0.0");
    typeInto(island, "> Phase A");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    const steps = committed(calls);
    expect(steps[0].steps?.[0].kind).toBeUndefined();
    expect(steps[0].steps?.[0].text).toBe("> Phase A");
    expect(steps[0].steps?.[0].steps).toHaveLength(2);
  });

  it("Backspace at the start of a note turns it back into a step", () => {
    const tree: ProcessOutlineStep[] = [{ text: "step" }, { text: "", kind: "note" }];
    const { container, calls } = renderLive(tree);
    press(focusLine(container, "1"), "Backspace");

    expect(committed(calls, tree)).toEqual([{ text: "step" }, { text: "" }]);
  });

  it("a second Backspace then deletes the now-plain empty step", () => {
    const tree: ProcessOutlineStep[] = [{ text: "step" }, { text: "", kind: "note" }];
    const { container, calls } = renderLive(tree);
    press(focusLine(container, "1"), "Backspace");
    press(lineAt(container, "1"), "Backspace");

    expect(calls).toHaveLength(2);
    expect(committed(calls, tree)).toEqual([{ text: "step" }]);
  });

  it("converts a non-empty note back with the caret at the start", () => {
    const tree: ProcessOutlineStep[] = [{ text: "step" }, { text: "a note", kind: "note" }];
    const { container, calls } = renderLive(tree);
    const island = focusLine(container, "1");
    placeCaret(island, 0);
    press(island, "Backspace");

    expect(committed(calls, tree)).toEqual([{ text: "step" }, { text: "a note" }]);
  });
});

describe("ProcessOutlineNodeView trace marks", () => {
  it("marks the step and strips the marker when `=> ` is typed at the start", () => {
    const { container, calls } = renderLive();
    const island = focusLine(container, "1");
    typeInto(island, "=> Second root");

    expect(calls).toHaveLength(1);
    expect(committed(calls)[1]).toEqual({ text: "Second root", trace: true });
    // The marker is notation, so it must not survive in the island either.
    expect(lineAt(container, "1").textContent).toBe("Second root");
    expect(container.querySelectorAll("[data-process-outline-trace='true']")).toHaveLength(1);
  });

  it("marks a step that owns children — unlike the note conversion", () => {
    const { container, calls } = renderLive();
    const island = focusLine(container, "0.0");
    typeInto(island, "=> Phase A");

    const steps = committed(calls);
    expect(steps[0].steps?.[0].trace).toBe(true);
    expect(steps[0].steps?.[0].steps).toHaveLength(2);
  });

  it("Backspace at the start of a marked step clears the mark", () => {
    const tree: ProcessOutlineStep[] = [{ text: "Run", trace: true }];
    const { container, calls } = renderLive(tree);
    const island = focusLine(container, "0");
    placeCaret(island, 0);
    press(island, "Backspace");

    expect(committed(calls, tree)).toEqual([{ text: "Run" }]);
    expect(container.querySelector("[data-process-outline-trace='true']")).toBeNull();
  });

  it("refuses to mark a note and leaves the marker as literal text", async () => {
    const { container, calls } = renderLive();
    const island = focusLine(container, "0.0.1");
    typeInto(island, "=> a clarification");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    const note = committed(calls)[0].steps?.[0].steps?.[1];
    expect(note).toEqual({ text: "=> a clarification", kind: "note" });
  });

  it("`> ` still makes a note — `=>` must not swallow the note marker", () => {
    const { container, calls } = renderLive();
    typeInto(focusLine(container, "0.1"), "> Phase B");
    expect(committed(calls)[0].steps?.[1]).toEqual({ text: "Phase B", kind: "note" });
  });

  it("keeps the mark through a rename and through an indent", () => {
    const tree: ProcessOutlineStep[] = [{ text: "Run" }, { text: "Drain", trace: true }];
    const { container, calls } = renderLive(tree);
    const island = focusLine(container, "1");
    typeInto(island, "Drain again");
    press(island, "Tab");

    expect(committed(calls, tree)).toEqual([
      { text: "Run", steps: [{ text: "Drain again", trace: true }] },
    ]);
  });
});

describe("ProcessOutlineNodeView empty outline", () => {
  it("seeds the first step from the placeholder", () => {
    const { container, calls } = renderLive([]);
    const placeholder = container.querySelector<HTMLElement>("[data-process-outline-seed]")!;
    act(() => {
      fireEvent.mouseDown(placeholder);
    });

    expect(committed(calls, [])).toEqual([{ text: "" }]);
    expect(lineAt(container, "0").getAttribute("data-process-outline-step-editing")).toBe("true");
  });

  it("keeps the read-only placeholder inert", () => {
    const { props } = nodeViewProps([], false);
    const { container } = render(<ProcessOutlineNodeView {...props} />);
    expect(container.querySelector("[data-process-outline-seed]")).toBeNull();
    expect(container.querySelector("[data-process-outline-empty]")?.textContent).toBe(
      "empty process outline — no steps yet",
    );
  });
});

/**
 * POINTING. The block is a ProseMirror atom, so any click inside it that does
 * not land a caret is a click ProseMirror answers by selecting the WHOLE
 * outline — which is what the block-selection wash then paints. The rule this
 * suite pins is therefore absolute: every pointer-down inside the outline
 * lands a caret (or a range), on the nearest line, from any pixel.
 */
describe("ProcessOutlineNodeView pointing", () => {
  it("puts the caret on the character that was clicked", () => {
    const { container, calls } = renderLive();
    const restore = stubCaretPoint(lineAt(container, "0.1"), 5);
    const island = focusLine(container, "0.1");
    press(island, "Enter");
    restore();

    expect(committed(calls)[0].steps?.map((step) => step.text)).toEqual([
      "Phase A",
      "Phase",
      " B",
    ]);
  });

  it("clicking the empty space right of a line puts the caret at the end of it", () => {
    const { container, calls } = renderLive();
    stubRect(lineAt(container, "0.1"), { left: 0, right: 100, top: 0, bottom: 20 });
    act(() => {
      fireEvent.mouseDown(rowAt(container, "0.1"), { clientX: 300, clientY: 10 });
    });

    const island = lineAt(container, "0.1");
    expect(island.getAttribute("data-process-outline-step-editing")).toBe("true");
    press(island, "Enter");
    // Caret at the end: the whole line stays put and the new sibling is empty.
    expect(committed(calls)[0].steps?.map((step) => step.text)).toEqual([
      "Phase A",
      "Phase B",
      "",
    ]);
  });

  it("clicking a gap between rows lands on the nearest line, never on the block", () => {
    const { container } = renderLive();
    stackRows(container);
    const wrapper = container.querySelector<HTMLElement>("[data-process-outline-editing]")!;
    // y=27 sits in the gap below row 0 (0-20) and above row 1 (30-50).
    act(() => {
      fireEvent.mouseDown(container.querySelector("[data-process-outline-flow]")!, {
        clientX: 5,
        clientY: 27,
      });
    });

    expect(lineAt(container, "0.0").getAttribute("data-process-outline-step-editing")).toBe("true");
    expect(wrapper.getAttribute("data-process-outline-editing")).toBe("true");
  });

  it("clicking the rail gutter left of a line puts the caret at its start", () => {
    const tree: ProcessOutlineStep[] = [{ text: "Root", steps: [{ text: "Phase" }] }];
    const { container, calls } = renderLive(tree);
    stubRect(lineAt(container, "0.0"), { left: 60, right: 160, top: 0, bottom: 20 });
    act(() => {
      fireEvent.mouseDown(rowAt(container, "0.0"), { clientX: 20, clientY: 10 });
    });
    press(lineAt(container, "0.0"), "Enter");

    // Caret at 0: the split leaves an empty step above the untouched text.
    expect(committed(calls, tree)[0].steps?.map((step) => step.text)).toEqual(["", "Phase"]);
  });

  it("swallows the mousedown so ProseMirror never sees a click on the block", () => {
    const { container } = renderLive();
    const wrapper = container.querySelector<HTMLElement>("[data-process-outline-editing]")!;
    const seen: string[] = [];
    container.addEventListener("mousedown", () => seen.push("outside"));

    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => {
      lineAt(container, "1").dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    // Nothing above the block — ProseMirror's own listener included — is reached.
    expect(seen).toEqual([]);
    expect(wrapper.getAttribute("data-process-outline-editing")).toBe("true");
  });

  it("leaves the focused island's own clicks to the browser", () => {
    const { container } = renderLive();
    focusLine(container, "1");
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => {
      lineAt(container, "1").dispatchEvent(event);
    });
    // Selecting part of the line you are typing in is the browser's job.
    expect(event.defaultPrevented).toBe(false);
  });
});

/**
 * LINE RANGES. The half that makes the block feel like a bullet list rather
 * than an embedded widget: drag across steps and you have selected steps —
 * highlighted one line at a time, copyable as the block's own notation, and
 * deletable through the same typed actions every other edit goes through.
 */
describe("ProcessOutlineNodeView line ranges", () => {
  it("dragging across lines highlights each one and drops the caret", () => {
    const { container } = renderLive();
    dragAcross(container, "0.0", "0.1");

    expect(selectedPaths(container)).toEqual(["0.0", "0.0.0", "0.0.1", "0.1"]);
    expect(container.querySelector('[data-process-outline-step-editing="true"]')).toBeNull();
    expect(
      container
        .querySelector("[data-process-outline-editing]")!
        .getAttribute("data-process-outline-editing"),
    ).toBe("true");
  });

  it("dragging inside ONE line stays a text selection", () => {
    const { container } = renderLive();
    dragAcross(container, "1", "1");
    expect(container.querySelector("[data-process-outline-range]")).toBeNull();
    expect(lineAt(container, "1").getAttribute("data-process-outline-step-editing")).toBe("true");
  });

  it("a selected step takes its subtree with it", () => {
    const { container } = renderLive();
    dragAcross(container, "0", "0.0");
    // Selecting the root implies everything nested under it.
    expect(selectedPaths(container)).toEqual(["0", "0.0", "0.0.0", "0.0.1", "0.1"]);
  });

  it("copies the range as the block's own notation", () => {
    const { container } = renderLive();
    dragAcross(container, "0.0", "0.1");
    const clipboard = fakeClipboard();
    act(() => {
      fireEvent.copy(rangeHolder(container), { clipboardData: clipboard });
    });

    expect(clipboard.getData("text/plain")).toBe(
      ["Phase A", "     -> Deep with a `chip`", "     > a clarification", "Phase B"].join("\n"),
    );
  });

  it("deletes the range through removeStep actions, subtrees and all", () => {
    const { container, calls } = renderLive();
    dragAcross(container, "0.0", "0.1");
    act(() => {
      fireEvent.keyDown(rangeHolder(container), { key: "Backspace" });
    });

    expect(calls).toHaveLength(1);
    // `steps: []` is what `removeStep` leaves behind when a parent loses its
    // last child — the same shape an agent's `outline_remove_step` produces.
    expect(committed(calls)).toEqual([{ text: "Root", steps: [] }, { text: "Second root" }]);
    expect(container.querySelector("[data-process-outline-range]")).toBeNull();
  });

  it("Delete leaves the caret on the line above the range", () => {
    const { container } = renderLive();
    dragAcross(container, "0.0", "0.1");
    act(() => {
      fireEvent.keyDown(rangeHolder(container), { key: "Delete" });
    });
    expect(lineAt(container, "0").getAttribute("data-process-outline-step-editing")).toBe("true");
  });

  it("cut writes the notation AND removes the steps", () => {
    const { container, calls } = renderLive();
    dragAcross(container, "1", "0.1");
    const clipboard = fakeClipboard();
    act(() => {
      fireEvent.cut(rangeHolder(container), { clipboardData: clipboard });
    });

    expect(clipboard.getData("text/plain")).toBe("Phase B\nSecond root");
    expect(committed(calls)).toEqual([
      { text: "Root", steps: [{ text: "Phase A", steps: [{ text: "Deep with a `chip`" }, { text: "a clarification", kind: "note" }] }] },
    ]);
  });

  it("Shift+click extends the range from the caret", () => {
    const { container } = renderLive();
    focusLine(container, "0.0");
    act(() => {
      fireEvent.mouseDown(lineAt(container, "0.1"), { shiftKey: true });
    });
    expect(selectedPaths(container)).toEqual(["0.0", "0.0.0", "0.0.1", "0.1"]);
  });

  it("Shift+Down grows a range out of the caret, line by line", () => {
    const { container } = renderLive();
    press(focusLine(container, "0.0.0"), "ArrowDown", { shiftKey: true });
    expect(selectedPaths(container)).toEqual(["0.0.0", "0.0.1"]);

    act(() => {
      fireEvent.keyDown(rangeHolder(container), { key: "ArrowDown", shiftKey: true });
    });
    expect(selectedPaths(container)).toEqual(["0.0.0", "0.0.1", "0.1"]);
  });

  it("Shift+Up shrinks the range back", () => {
    const { container } = renderLive();
    press(focusLine(container, "0.0.0"), "ArrowDown", { shiftKey: true });
    act(() => {
      fireEvent.keyDown(rangeHolder(container), { key: "ArrowUp", shiftKey: true });
    });
    expect(selectedPaths(container)).toEqual(["0.0.0"]);
  });

  it("carries the line's pending text into the range it starts", async () => {
    const { container, calls } = renderLive();
    const island = focusLine(container, "0.1");
    typeInto(island, "Phase B typed");
    press(island, "ArrowDown", { shiftKey: true });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(calls).toHaveLength(1);
    expect(committed(calls)[0].steps?.[1].text).toBe("Phase B typed");
  });

  it("Escape clears the range", () => {
    const { container } = renderLive();
    dragAcross(container, "0.0", "0.1");
    act(() => {
      fireEvent.keyDown(rangeHolder(container), { key: "Escape" });
    });
    expect(selectedPaths(container)).toEqual([]);
    expect(
      container
        .querySelector("[data-process-outline-editing]")!
        .getAttribute("data-process-outline-editing"),
    ).toBe("false");
  });

  it("an arrow key collapses the range back to a caret", () => {
    const { container } = renderLive();
    dragAcross(container, "0.0", "0.1");
    act(() => {
      fireEvent.keyDown(rangeHolder(container), { key: "ArrowDown" });
    });
    expect(selectedPaths(container)).toEqual([]);
    expect(lineAt(container, "0.1").getAttribute("data-process-outline-step-editing")).toBe("true");
  });

  it("clicking a line clears the range and puts the caret back", () => {
    const { container } = renderLive();
    dragAcross(container, "0.0", "0.1");
    focusLine(container, "1");
    expect(selectedPaths(container)).toEqual([]);
  });

  it("clicking away clears the range", () => {
    const { container } = renderLive();
    dragAcross(container, "0.0", "0.1");
    act(() => {
      fireEvent.mouseDown(document.body);
    });
    expect(selectedPaths(container)).toEqual([]);
  });

  it("drops a range whose steps an outside edit removed", () => {
    const { container, landExternal } = renderLive();
    dragAcross(container, "0.0", "0.1");
    landExternal([{ text: "Root" }]);
    expect(selectedPaths(container)).toEqual([]);
    expect(container.querySelector("[data-process-outline-range]")).toBeNull();
  });

  it("routes undo out of a range to the outer editor's history", () => {
    const { container, history } = renderLive();
    dragAcross(container, "0.0", "0.1");
    act(() => {
      fireEvent.keyDown(rangeHolder(container), { key: "z", metaKey: true });
    });
    expect(history).toEqual(["undo"]);
    expect(selectedPaths(container)).toEqual([]);
  });
});

/**
 * The wiring the app actually loads: `DocProcessOutlineWithView` is the atom
 * node from node-views.tsx, so this proves the swap from the read-only
 * AtomBlockView landed and that a hand edit reaches the PM document as one
 * attr change on the block's own node (which is what convert.ts diffs into a
 * single `updateBlock` op, and what PM's history records as one undo step).
 */
describe("docProcessOutline inside a real editor", () => {
  const DocNode = Node.create({ name: "doc", topNode: true, content: "block+" });
  const TextNode = Node.create({ name: "text", group: "inline" });

  function MountEditor({ onReady }: { onReady: (editor: Editor) => void }) {
    const editor = useEditor({
      extensions: [DocNode, TextNode, DocProcessOutlineWithView],
      content: {
        type: "doc",
        content: [
          {
            type: "docProcessOutline",
            attrs: { blockId: "po-1", blockProps: { steps: TREE } },
          },
        ],
      },
      immediatelyRender: true,
    });
    useEffect(() => {
      if (editor) onReady(editor);
    }, [editor, onReady]);
    return <EditorContent editor={editor} />;
  }

  it("renders the editable rail and commits a keystroke as one attr update", async () => {
    let instance: Editor | null = null;
    const { container } = render(<MountEditor onReady={(editor) => (instance = editor)} />);

    await waitFor(() => {
      expect(container.querySelector("[data-process-outline-flow]")).toBeTruthy();
    });
    expect(container.querySelectorAll("[data-process-outline-step]").length).toBe(6);

    press(focusLine(container as HTMLElement, "1"), "Enter");

    await waitFor(() => {
      const attrs = (instance as unknown as Editor).state.doc.firstChild?.attrs ?? {};
      const steps = readStepsFromProps(attrs.blockProps as Record<string, unknown>);
      expect(steps.map((step) => step.text)).toEqual(["Root", "Second root", ""]);
    });
  });

  /**
   * Clicking a step line puts a NodeSelection on this ATOM as well as the caret
   * in the line, and the editor's generic block-selection wash would then hold
   * the whole outline light blue for the entire edit. The node view flags the
   * difference between "the user is inside this block" and "the user is holding
   * this block", and index.css suppresses the wash on the first.
   */
  it("flags in-place editing so the block-selection wash never washes the outline", async () => {
    const { container } = render(<MountEditor onReady={() => {}} />);
    await waitFor(() => {
      expect(container.querySelector("[data-process-outline-flow]")).toBeTruthy();
    });

    const wrapper = container.querySelector<HTMLElement>("[data-process-outline-editing]")!;
    expect(wrapper.getAttribute("data-process-outline-editing")).toBe("false");
    // Same element ProseMirror puts .ProseMirror-selectednode on.
    expect(wrapper.getAttribute("data-doc-block-type")).toBe("process-outline");

    const island = focusLine(container as HTMLElement, "1");
    expect(wrapper.getAttribute("data-process-outline-editing")).toBe("true");
    // Nothing in the block paints a background on the container in edit mode.
    expect(wrapper.style.backgroundColor).toBe("");
    expect(
      container.querySelector<HTMLElement>('[data-docs-block-type="process-outline"]')!.style
        .backgroundColor,
    ).toBe("");

    act(() => {
      fireEvent.blur(island);
    });
    expect(wrapper.getAttribute("data-process-outline-editing")).toBe("false");
  });

  /**
   * The ROOT of the wash Ford kept seeing. Tiptap's default `stopEvent` hands
   * ProseMirror every mousedown on a selectable atom, and ProseMirror answers
   * a click on an atom by selecting the whole node. That is fine for the
   * pixels a click can only mean "this block" — but inside the outline, most
   * pixels are not on a step's glyphs (the space right of the text, the rail,
   * the gaps), so those clicks left the caret nowhere, the flag "false", and
   * the entire outline washed blue. Now no click inside the block reaches
   * ProseMirror at all.
   */
  it("never lets a click inside the outline reach ProseMirror", async () => {
    let instance: Editor | null = null;
    const { container } = render(<MountEditor onReady={(editor) => (instance = editor)} />);
    await waitFor(() => {
      expect(container.querySelector("[data-process-outline-flow]")).toBeTruthy();
    });

    const editor = instance as unknown as Editor;
    const seen: string[] = [];
    editor.view.dom.addEventListener("mousedown", () => seen.push("prosemirror"));
    const wrapper = container.querySelector<HTMLElement>("[data-process-outline-editing]")!;

    for (const target of [
      lineAt(container as HTMLElement, "1"),
      container.querySelector<HTMLElement>("[data-process-outline-flow]")!,
      container.querySelector<HTMLElement>(".docs-process-outline__children")!,
    ]) {
      act(() => {
        fireEvent.mouseDown(target);
      });
      expect(seen).toEqual([]);
      // Whatever ProseMirror's selection was, the click did not turn it into a
      // block selection over the outline, and the flag that suppresses the
      // wash is up for every one of these pixels.
      expect(wrapper.getAttribute("data-process-outline-editing")).toBe("true");
      const selected = container.querySelector<HTMLElement>(".ProseMirror-selectednode");
      if (selected) {
        expect(selected.querySelector(':scope > [data-process-outline-editing="true"]')).toBe(
          wrapper,
        );
      }
    }
  });

  /**
   * A doc whose only node is an atom has NO text position to put a caret in,
   * so ProseMirror's own start-of-doc selection is a NodeSelection on the
   * block — the outline arrives node-selected without anybody clicking
   * anything. Nothing to fix in the node view (an image-first doc does the
   * same); it is here because it is the other way `.ProseMirror-selectednode`
   * shows up with the flag down, and because clicking in has to clear it.
   */
  it("suppresses the wash on ProseMirror's own start-of-doc node selection", async () => {
    const { container } = render(<MountEditor onReady={() => {}} />);
    await waitFor(() => {
      expect(container.querySelector("[data-process-outline-flow]")).toBeTruthy();
    });

    const wrapper = container.querySelector<HTMLElement>("[data-process-outline-editing]")!;
    const selected = await waitFor(() => {
      const element = container.querySelector<HTMLElement>(".ProseMirror-selectednode");
      expect(element).toBeTruthy();
      return element!;
    });
    expect(wrapper.getAttribute("data-process-outline-editing")).toBe("false");

    focusLine(container as HTMLElement, "1");
    expect(selected.querySelector(':scope > [data-process-outline-editing="true"]')).toBe(wrapper);
  });

  it("keeps the wash off a line range too — a range selects steps, not the block", async () => {
    const { container } = render(<MountEditor onReady={() => {}} />);
    await waitFor(() => {
      expect(container.querySelector("[data-process-outline-flow]")).toBeTruthy();
    });

    dragAcross(container as HTMLElement, "0.0", "0.1");
    const wrapper = container.querySelector<HTMLElement>("[data-process-outline-editing]")!;
    expect(selectedPaths(container as HTMLElement)).toEqual(["0.0", "0.0.0", "0.0.1", "0.1"]);
    expect(wrapper.getAttribute("data-process-outline-editing")).toBe("true");
  });

  /**
   * The other half of the rule: a block you GRABBED is a block you selected,
   * and that still washes. The grip lands the NodeSelection itself, so this is
   * the one path where `.ProseMirror-selectednode` meets a "false" flag.
   */
  it("still washes when the block itself is selected", async () => {
    let instance: Editor | null = null;
    const { container } = render(<MountEditor onReady={(editor) => (instance = editor)} />);
    await waitFor(() => {
      expect(container.querySelector("[data-process-outline-flow]")).toBeTruthy();
    });

    const editor = instance as unknown as Editor;
    act(() => {
      editor.commands.setNodeSelection(0);
    });

    const wrapper = container.querySelector<HTMLElement>("[data-process-outline-editing]")!;
    // Tiptap applies the class in an animation frame, not with the transaction.
    await waitFor(() => {
      expect(container.querySelector(".ProseMirror-selectednode")).toBeTruthy();
    });
    expect(wrapper.getAttribute("data-process-outline-editing")).toBe("false");

    // Clicking into a line while the block is selected suppresses the wash
    // again, without waiting for ProseMirror to drop the selection.
    focusLine(container as HTMLElement, "1");
    expect(wrapper.getAttribute("data-process-outline-editing")).toBe("true");
  });

  /**
   * The DOM shape the suppression rule is written against, pinned so the two
   * cannot drift apart again. ProseMirror marks a React node view on tiptap's
   * `.react-renderer` wrapper — the PARENT of the element the node view itself
   * renders — so a rule keyed on `.ProseMirror-selectednode[data-...]` matches
   * nothing, which is exactly why the outline kept washing blue after the flag
   * was already being raised correctly. index.css matches
   * `.ProseMirror-selectednode:has(> [data-process-outline-editing])`.
   */
  it("puts the selected-node class on the PARENT of the flagged element", async () => {
    let instance: Editor | null = null;
    const { container } = render(<MountEditor onReady={(editor) => (instance = editor)} />);
    await waitFor(() => {
      expect(container.querySelector("[data-process-outline-flow]")).toBeTruthy();
    });

    act(() => {
      (instance as unknown as Editor).commands.setNodeSelection(0);
    });
    const selected = await waitFor(() => {
      const element = container.querySelector<HTMLElement>(".ProseMirror-selectednode");
      expect(element).toBeTruthy();
      return element!;
    });

    const flagged = container.querySelector<HTMLElement>("[data-process-outline-editing]")!;
    expect(selected).not.toBe(flagged);
    expect(flagged.parentElement).toBe(selected);
    expect(
      selected.querySelector(':scope > [data-process-outline-editing="true"]'),
    ).toBeNull();

    focusLine(container as HTMLElement, "1");
    // With the caret in a line the child selector the stylesheet uses now hits.
    expect(
      selected.querySelector(':scope > [data-process-outline-editing="true"]'),
    ).toBe(flagged);
  });
});
