import { afterEach, describe, expect, it } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { getSchema } from "@tiptap/core";
import { Node } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import {
  EditorContent,
  ReactNodeViewRenderer,
  useEditor,
  type Editor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { useEffect } from "react";
import {
  annotationLineRuns,
  lineRangeSpan,
  parseCodeAnnotations,
} from "../components/code/annotations";
import {
  CODE_ANNOTATION_ROW_LIT_CLASSES,
  CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES,
  CODE_NOTE_LIT_CLASSES,
} from "../components/code/classes";
import { buildDecorations } from "../components/code/editor-highlight";
import { DocCodeBlock } from "../components/code/editor-nodes";
import { CodeBlockNodeView } from "../components/code/editor-node-view";
import { HIGHLIGHT_LANGUAGES } from "../components/code/highlight";
import { RANGE_CHIP_LIT_CLASSES } from "../components/linked-panels";

afterEach(() => {
  cleanup();
});

/** True when the element carries EVERY utility of a state class constant. */
function hasClasses(element: Element, classes: string): boolean {
  return classes.split(" ").every((token) => element.classList.contains(token));
}

/** The resting gutter mark: the annotation accent at 65%, drawn as an ::after bar. */
const RESTING_MARK = "after:bg-[var(--docs-code-annotation-accent,#0b6e99)]/65";

describe("parseCodeAnnotations", () => {
  it("accepts well-formed entries and preserves optional labels", () => {
    expect(
      parseCodeAnnotations([
        { lines: "1-2", label: "Setup", note: "Declares the inputs." },
        { lines: "4", note: "Prints the result." },
      ]),
    ).toEqual([
      { lines: "1-2", note: "Declares the inputs.", label: "Setup" },
      { lines: "4", note: "Prints the result." },
    ]);
  });

  it("drops malformed entries and returns null when nothing survives", () => {
    expect(
      parseCodeAnnotations([
        "not-an-object",
        { lines: "", note: "empty lines" },
        { lines: "3", note: "   " },
        { lines: 4, note: "numeric lines" },
        { note: "missing lines" },
      ]),
    ).toBeNull();
    expect(parseCodeAnnotations([])).toBeNull();
    expect(parseCodeAnnotations(undefined)).toBeNull();
    expect(parseCodeAnnotations("junk")).toBeNull();
  });

  it("keeps valid entries when mixed with junk", () => {
    expect(
      parseCodeAnnotations([{ lines: "2", note: "kept" }, { lines: 9, note: "dropped" }]),
    ).toEqual([{ lines: "2", note: "kept" }]);
  });
});

describe("lineRangeSpan", () => {
  it("returns the full min–max span of single lines, ranges, and multi-segment keys", () => {
    expect(lineRangeSpan("4")).toEqual({ start: 4, end: 4 });
    expect(lineRangeSpan("4-9")).toEqual({ start: 4, end: 9 });
    expect(lineRangeSpan("1,4-6")).toEqual({ start: 1, end: 6 });
    expect(lineRangeSpan("6,1-2")).toEqual({ start: 1, end: 6 });
    // Reversed and en-dash parts normalize like expandLineRange.
    expect(lineRangeSpan("9-4")).toEqual({ start: 4, end: 9 });
    expect(lineRangeSpan("2–5")).toEqual({ start: 2, end: 5 });
  });

  it("skips unparseable parts and returns null when nothing parses", () => {
    expect(lineRangeSpan("junk,3-4")).toEqual({ start: 3, end: 4 });
    expect(lineRangeSpan("not-a-range")).toBeNull();
    expect(lineRangeSpan("")).toBeNull();
  });
});

describe("annotationLineRuns", () => {
  it("merges contiguous covered lines into one run per owning note", () => {
    expect(annotationLineRuns(6, [{ lines: "2-4", note: "n" }])).toEqual([
      { start: 2, length: 3, annotationIndex: 0 },
    ]);
    expect(annotationLineRuns(6, [{ lines: "1,3,4", note: "n" }])).toEqual([
      { start: 1, length: 1, annotationIndex: 0 },
      { start: 3, length: 2, annotationIndex: 0 },
    ]);
  });

  it("breaks runs where ownership changes, resolving overlaps to the earliest note", () => {
    expect(
      annotationLineRuns(6, [
        { lines: "1-2", note: "first" },
        { lines: "2-4", note: "second" },
      ]),
    ).toEqual([
      { start: 1, length: 2, annotationIndex: 0 },
      { start: 3, length: 2, annotationIndex: 1 },
    ]);
    // Adjacent-but-distinct notes stay separate runs even with no gap.
    expect(
      annotationLineRuns(6, [
        { lines: "1", note: "a" },
        { lines: "2", note: "b" },
      ]),
    ).toEqual([
      { start: 1, length: 1, annotationIndex: 0 },
      { start: 2, length: 1, annotationIndex: 1 },
    ]);
  });

  it("clamps out-of-range parts and ignores unparseable ranges", () => {
    expect(annotationLineRuns(3, [{ lines: "2-99", note: "n" }])).toEqual([
      { start: 2, length: 2, annotationIndex: 0 },
    ]);
    expect(annotationLineRuns(3, [{ lines: "50-60", note: "n" }])).toEqual([]);
    expect(annotationLineRuns(3, [{ lines: "junk", note: "n" }])).toEqual([]);
    expect(annotationLineRuns(0, [{ lines: "1", note: "n" }])).toEqual([]);
  });
});

/** Same mocked-props pattern as structured-table-editor-view.test.tsx —
 * NodeViewWrapper/NodeViewContent render standalone via their default
 * context, so the node view mounts without a live editor. */
function nodeViewProps(
  blockProps: Record<string, unknown>,
  options?: { text?: string; language?: string | null },
): { props: ReactNodeViewProps; updates: Array<Record<string, unknown>> } {
  const updates: Array<Record<string, unknown>> = [];
  const props = {
    node: {
      attrs: { blockId: "code-1", blockProps, language: options?.language ?? null },
      type: { name: "docCodeBlock" },
      textContent: options?.text ?? "const a = 1;\nconst b = 2;\nconst c = a + b;",
    },
    editor: { isEditable: true },
    updateAttributes: (attrs: Record<string, unknown>) => updates.push(attrs),
  } as unknown as ReactNodeViewProps;
  return { props, updates };
}

function mockClipboard(): { written: string[]; restore: () => void } {
  const written: string[] = [];
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: (text: string) => {
        written.push(text);
        return Promise.resolve();
      },
    },
  });
  return {
    written,
    restore: () => {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else delete (navigator as unknown as Record<string, unknown>).clipboard;
    },
  };
}

describe("CodeBlockNodeView header band", () => {
  it("renders the quiet-label language picker as non-editable furniture", () => {
    const { props } = nodeViewProps({});
    const { container, getByLabelText } = render(<CodeBlockNodeView {...props} />);

    const header = container.querySelector("[data-code-header]");
    expect(header).toBeTruthy();
    expect(header?.getAttribute("contenteditable")).toBe("false");
    expect(header?.querySelector("[data-code-tile]")?.getAttribute("data-code-tile")).toBe("code");

    const select = getByLabelText("Code block language") as HTMLSelectElement;
    expect(select.className).toContain("appearance-none");
    // Lowercase mono as authored, never the old caps.
    expect(select.className).toContain("font-mono");
    expect(select.className).not.toContain("uppercase");
    // Quiet look: muted text on a transparent bg, no pill tint; the
    // --docs-code-lang-fg token is the block-hover affordance color.
    expect(select.className).toContain("text-[color:var(--docs-code-header-fg,var(--muted-foreground))]");
    expect(select.className).toContain("bg-transparent");
    expect(select.className).not.toContain("color-mix");
    expect(select.className).toContain(
      "group-hover/code:text-[color:var(--docs-code-lang-fg",
    );
    // Keyboard focus draws the shared ring.
    expect(select.className).toContain("focus-visible:outline-[color:var(--docs-focus-ring,");
    // The hover hook lives on the panel frame.
    expect(select.closest("[data-code-surface]")?.classList.contains("group/code")).toBe(true);
    const options = Array.from(select.options).map((option) => option.value);
    expect(options).toEqual(["", ...HIGHLIGHT_LANGUAGES]);
    expect(select.options[0]?.textContent).toBe("auto");
  });

  it("shows the sniffed language on the auto option and writes picks through updateAttributes", () => {
    const { props, updates } = nodeViewProps({}, { text: '{"a": 1}' });
    const { getByLabelText } = render(<CodeBlockNodeView {...props} />);

    const select = getByLabelText("Code block language") as HTMLSelectElement;
    // Auto-resolved JSON shows as the badge text.
    expect(select.options[0]?.textContent).toBe("json");

    fireEvent.change(select, { target: { value: "rust" } });
    expect(updates).toEqual([{ language: "rust" }]);
    fireEvent.change(select, { target: { value: "" } });
    expect(updates).toEqual([{ language: "rust" }, { language: null }]);
  });

  it("copies the raw stored text (node.textContent) and confirms with Copied", async () => {
    const clipboard = mockClipboard();
    try {
      const { props } = nodeViewProps({});
      const { container, findByText } = render(<CodeBlockNodeView {...props} />);

      const button = container.querySelector("[data-code-copy]")!;
      fireEvent.click(button);
      expect(clipboard.written).toEqual(["const a = 1;\nconst b = 2;\nconst c = a + b;"]);
      expect(await findByText("Copied")).toBeTruthy();
    } finally {
      clipboard.restore();
    }
  });

  it("is a no-op without a Clipboard API instead of crashing", () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    try {
      const { props } = nodeViewProps({});
      const { container } = render(<CodeBlockNodeView {...props} />);
      fireEvent.click(container.querySelector("[data-code-copy]")!);
      expect(container.querySelector("[data-code-copy]")?.textContent).toBe("");
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else delete (navigator as unknown as Record<string, unknown>).clipboard;
    }
  });
});

describe("CodeBlockNodeView shell geometry", () => {
  it("renders one gutter line per text line plus the zebra layer, all non-editable", () => {
    const { props } = nodeViewProps({}, { text: "a\nb\nc\nd" });
    const { container } = render(<CodeBlockNodeView {...props} />);

    const gutter = container.querySelector("[data-code-gutter]");
    expect(gutter).toBeTruthy();
    expect(gutter?.getAttribute("contenteditable")).toBe("false");
    expect(container.querySelectorAll("[data-code-gutter-line]").length).toBe(4);
    expect(
      container.querySelector('[data-code-gutter-line="4"]')?.textContent,
    ).toBe("4");
    const zebra = container.querySelector("[data-code-zebra]");
    expect(zebra).toBeTruthy();
    expect(zebra?.getAttribute("contenteditable")).toBe("false");
    expect(zebra?.className).toContain("pointer-events-none");
    // The word "sky" never appears — the accent rides --docs-code-annotation-accent.
    expect(container.innerHTML).not.toContain("sky-");
  });

  it("is a page lane the style rail's per-type layout overrides can target", () => {
    const { props } = nodeViewProps({});
    const { container } = render(<CodeBlockNodeView {...props} />);
    const lane = container.firstElementChild!;
    // blockLayoutOverrideCss keys its rules on this attribute pair.
    expect(lane.getAttribute("data-doc-block-type")).toBe("code");
    expect(lane.getAttribute("data-doc-lane")).toBe("code-left");
    expect(lane.className).toContain("max-w-[var(--style-code-width,88ch)]");
    // The lane wears no code typography, so its `ch` width resolves at body size.
    expect(lane.className).not.toContain("--docs-code-text-size");
  });

  it("reads the same code tokens as the read surfaces (frame, typography, gutter, padding, header)", () => {
    const { props } = nodeViewProps(
      { annotations: [{ lines: "2", note: "Note." }] },
      { text: "a\nb\nc\nd" },
    );
    const { container } = render(<CodeBlockNodeView {...props} />);
    const cls = (selector: string) => container.querySelector(selector)!.className;

    // The panel frame (inside the notes layout); cn() must keep width,
    // color and radius.
    const frame = cls("[data-code-surface]");
    expect(frame).toContain("border-[length:var(--docs-code-border-width,1px)]");
    expect(frame).toContain("border-[color:var(--docs-code-block-border,var(--border))]");
    expect(frame).toContain("rounded-[var(--docs-code-radius,var(--radius,2px))]");
    expect(frame).toContain("text-[length:var(--docs-code-text-size,13px)]");
    expect(frame).toContain("leading-[var(--docs-code-line-height,21px)]");

    const content = cls("[data-code-content]");
    expect(content).toContain("text-[length:var(--docs-code-text-size,13px)]");
    expect(content).toContain("leading-[var(--docs-code-line-height,21px)]");
    expect(content).toContain("grid-cols-[var(--docs-code-gutter-width,40px)_1fr]");

    const gutterLine = cls('[data-code-gutter-line="1"]');
    expect(gutterLine).toContain("h-[var(--docs-code-line-height,21px)]");
    expect(gutterLine).toContain("text-[length:var(--docs-code-gutter-text-size,12px)]");
    expect(gutterLine).toContain("pr-[var(--docs-code-gutter-pad-x,12px)]");
    expect(gutterLine).toContain("text-[color:var(--docs-code-gutter-fg,#888784)]");
    // Annotated gutter line at rest: the quiet mark; size and number color stay.
    const annotated = cls('[data-code-gutter-line="2"]');
    expect(annotated).toContain("text-[length:var(--docs-code-gutter-text-size,12px)]");
    expect(annotated).toContain("text-[color:var(--docs-code-gutter-fg,#888784)]");
    expect(annotated).toContain(RESTING_MARK);

    expect(cls("[data-code-zebra]")).toContain("left-[var(--docs-code-gutter-width,40px)]");
    expect(cls("[data-code-zebra]")).toContain("var(--docs-code-zebra,var(--docs-zebra,transparent))");
    expect(cls("[data-code-annotation-row]")).toContain(
      "left-[var(--docs-code-gutter-width,40px)]",
    );
    const scroll = cls("[data-code-scroll]");
    expect(scroll).toContain("pt-[var(--docs-code-pad-top,12px)]");
    expect(scroll).toContain("pb-[var(--docs-code-pad-bottom,12px)]");
    expect(cls("pre")).toContain("px-[var(--docs-code-pad-x,12px)]");

    // Header: the picker carries the label's size / weight / color tokens.
    expect(cls("[data-code-header]")).toContain("h-[var(--docs-code-header-height,32px)]");
    expect(cls("[data-code-header]")).toContain("bg-[color:var(--docs-code-header-bg,");
    const select = cls("select");
    expect(select).toContain("text-[length:var(--docs-code-header-text-size,12px)]");
    expect(select).toContain("font-[var(--docs-code-header-weight,400)]");
    expect(select).toContain("text-[color:var(--docs-code-header-fg,var(--muted-foreground))]");

    expect(cls('[data-annotation-note="0"] [data-note-body]')).toContain(
      "text-[length:var(--docs-code-note-text-size,13px)]",
    );

    for (const literal of ["h-5", "h-7", "3rem", "text-xs", "leading-[20px]", "pb-2", "rounded-md"]) {
      expect(container.innerHTML).not.toContain(literal);
    }
  });

  it("renders annotation overlay rows behind the text on the line-height token's geometry", () => {
    const { props } = nodeViewProps(
      { annotations: [{ lines: "2-3", note: "The math." }] },
      { text: "a\nb\nc\nd" },
    );
    const { container } = render(<CodeBlockNodeView {...props} />);

    const rows = container.querySelectorAll<HTMLElement>("[data-code-annotation-row]");
    expect(rows.length).toBe(1);
    // The run rides two unitless vars (0-based start, line count); the row
    // classes multiply them by the line-height token — 21px by default, so
    // this run paints at top 21px / height 42px.
    expect(rows[0]?.style.getPropertyValue("--docs-code-row-start")).toBe("1");
    expect(rows[0]?.style.getPropertyValue("--docs-code-row-span")).toBe("2");
    expect(rows[0]?.className).toContain(
      "top-[calc(var(--docs-code-line-height,21px)*var(--docs-code-row-start,0))]",
    );
    expect(rows[0]?.className).toContain(
      "h-[calc(var(--docs-code-line-height,21px)*var(--docs-code-row-span,1))]",
    );
    expect(rows[0]?.className).toContain("pointer-events-none");
    // At rest the overlay is geometry only — no tint until the pair is lit.
    expect(rows[0]?.className).not.toContain("bg-");
    expect(rows[0]?.getAttribute("contenteditable")).toBe("false");
    // Matching gutter lines carry the quiet mark (positioned by `relative`);
    // no tint, no accent number yet.
    const gutterLine2 = container.querySelector('[data-code-gutter-line="2"]')!;
    expect(gutterLine2.classList.contains("relative")).toBe(true);
    expect(gutterLine2.classList.contains(RESTING_MARK)).toBe(true);
    expect(gutterLine2.className).not.toContain("bg-linear-to-b");
    expect(gutterLine2.className).not.toContain("font-semibold");
    expect(
      container.querySelector('[data-code-gutter-line="2"]')?.hasAttribute("data-annotated"),
    ).toBe(true);
    expect(
      container.querySelector('[data-code-gutter-line="3"]')?.hasAttribute("data-annotated"),
    ).toBe(true);
    expect(
      container.querySelector('[data-code-gutter-line="1"]')?.hasAttribute("data-annotated"),
    ).toBe(false);
    expect(container.querySelector('[data-code-gutter-line="1"]')!.className).not.toContain("after:");
  });

  it("renders a bare single-column code block without annotations or when all entries are malformed", () => {
    for (const blockProps of [{}, { annotations: [] }, { annotations: [{ lines: 4 }] }]) {
      const { props } = nodeViewProps(blockProps);
      const { container, unmount } = render(<CodeBlockNodeView {...props} />);
      // No notes layout, no notes column, no overlays — just the panel,
      // directly inside the lane.
      expect(container.querySelector("[data-code-layout]")).toBeNull();
      expect(container.querySelector("[data-code-notes]")).toBeNull();
      expect(container.querySelector("[data-code-notes-header]")).toBeNull();
      expect(container.querySelector("[data-code-annotation-row]")).toBeNull();
      const frame = container.querySelector("[data-doc-lane]")!.firstElementChild!;
      expect(frame.getAttribute("data-code-surface")).toBe("true");
      expect(frame.className).not.toContain("--docs-code-notes-width");
      // The header keeps its subtle bottom rule even on plain blocks.
      const header = container.querySelector("[data-code-header]")!;
      expect(header.className).toContain("border-b-[length:var(--docs-code-rule-width,1px)]");
      unmount();
    }
  });

});

describe("CodeBlockNodeView notes aside", () => {
  const ANNOTATIONS = [
    { lines: "1-2", label: "Setup", note: "Declares the inputs." },
    { lines: "3", note: "The sum." },
  ];

  it("renders the notes as a non-editable column inside the panel, beside the code", () => {
    const { props } = nodeViewProps({ annotations: ANNOTATIONS });
    const { container, getByText, queryByText } = render(<CodeBlockNodeView {...props} />);

    const aside = container.querySelector("[data-code-notes]")!;
    expect(aside).toBeTruthy();
    expect(aside.tagName).toBe("ASIDE");
    expect(aside.getAttribute("aria-label")).toBe("Code notes");
    expect(aside.getAttribute("contenteditable")).toBe("false");
    expect(container.querySelectorAll("[data-annotation-note]").length).toBe(2);

    // Layout: lane > size-container layout > panel > [header, body grid];
    // the body grid holds [code scroll body, notes] — the notes sit INSIDE
    // the dark panel.
    const layout = container.querySelector("[data-doc-lane]")!.firstElementChild!;
    expect(layout.hasAttribute("data-code-layout")).toBe(true);
    expect(layout.className).toContain("@container");
    const frame = layout.firstElementChild!;
    expect(frame.getAttribute("data-code-surface")).toBe("true");
    const grid = frame.querySelector(":scope > [data-code-body]")!;
    expect(grid.className).toContain(
      "@min-[760px]:grid-cols-[minmax(0,1fr)_var(--docs-code-notes-width,280px)]",
    );
    const [code, notes] = Array.from(grid.children);
    expect(code?.hasAttribute("data-code-scroll")).toBe(true);
    expect(notes).toBe(aside);
    expect(aside.closest("[data-code-surface]")).toBe(frame);

    // Plain buttons at rest: no card border/background/ring and no dividers.
    for (const i of [0, 1]) {
      const note = container.querySelector(`[data-annotation-note="${i}"]`)!;
      expect(note.tagName).toBe("BUTTON");
      expect(note.className).not.toContain("border");
      expect(note.className).not.toContain("bg-");
      expect(note.className).not.toMatch(/(^| )ring-/);
    }
    // No notes header, no "Notes" label.
    expect(container.querySelector("[data-code-notes-header]")).toBeNull();
    expect(queryByText("Notes")).toBeNull();

    // Each note's head row opens with its range chip; the authored key rides in the title.
    const note0 = container.querySelector('[data-annotation-note="0"]')!;
    expect(note0.querySelector(":scope > [data-note-head]")?.firstElementChild?.getAttribute("data-range-chip")).toBe("true");
    expect(note0.querySelector("[data-range-chip]")?.textContent).toBe("L1–2");
    expect(
      container.querySelector('[data-annotation-note="1"] [data-range-chip]')?.textContent,
    ).toBe("L3");
    expect(note0.getAttribute("title")).toBe("Lines 1-2");
    expect(getByText("Setup")).toBeTruthy();
    expect(getByText("Declares the inputs.")).toBeTruthy();
    expect(getByText("The sum.")).toBeTruthy();
  });

  it("note clicks toggle the active pair, restyle overlays + gutter, and scroll the range into view", async () => {
    const { props } = nodeViewProps(
      { annotations: [{ lines: "5-6", note: "Deep note." }] },
      { text: "1\n2\n3\n4\n5\n6\n7" },
    );
    const { container } = render(<CodeBlockNodeView {...props} />);

    const note = container.querySelector('[data-annotation-note="0"]')!;
    const row = () => container.querySelector('[data-code-annotation-row="0"]')!;
    const gutterLine = (n: number) => container.querySelector(`[data-code-gutter-line="${n}"]`)!;
    const scroll = container.querySelector<HTMLElement>("[data-code-scroll]")!;

    fireEvent.click(note);
    expect(note.hasAttribute("data-active")).toBe(true);
    expect(row().hasAttribute("data-active")).toBe(true);
    // The active pair is lit: accent tint on the overlay (no ring), accent
    // numbers on its gutter lines only.
    expect(hasClasses(row(), CODE_ANNOTATION_ROW_LIT_CLASSES)).toBe(true);
    expect(row().className).not.toContain("ring");
    expect(hasClasses(gutterLine(5), CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES)).toBe(true);
    expect(hasClasses(gutterLine(6), CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES)).toBe(true);
    expect(hasClasses(gutterLine(4), CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES)).toBe(false);
    await waitFor(() => {
      // First covered line is 5 at the 21px default: (5-1)*21 - 8 = 76.
      expect(scroll.scrollTop).toBe(76);
    });

    // Clicking the active note again clears the pair.
    fireEvent.click(note);
    expect(note.hasAttribute("data-active")).toBe(false);
    expect(row().hasAttribute("data-active")).toBe(false);
    expect(hasClasses(row(), CODE_ANNOTATION_ROW_LIT_CLASSES)).toBe(false);
    expect(hasClasses(gutterLine(5), CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES)).toBe(false);
  });

  it("hovering a note lights its overlay transiently; mouse-leave unlights unless sticky-clicked", () => {
    const { props } = nodeViewProps(
      { annotations: [{ lines: "2-3", note: "The math." }] },
      { text: "a\nb\nc\nd" },
    );
    const { container } = render(<CodeBlockNodeView {...props} />);

    const note = container.querySelector('[data-annotation-note="0"]')!;
    const chip = note.querySelector("[data-range-chip]")!;
    const row = () => container.querySelector('[data-code-annotation-row="0"]')!;
    const gutterLine2 = () => container.querySelector('[data-code-gutter-line="2"]')!;

    // Rest: no tint on the overlay or the annotated gutter line.
    expect(row().className).not.toContain("bg-");
    expect(hasClasses(gutterLine2(), CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES)).toBe(false);
    expect(hasClasses(chip, RANGE_CHIP_LIT_CLASSES)).toBe(false);

    // Hover lights the pair without sticky activation: tinted overlay,
    // accent gutter line, page-ink note with a link-color chip.
    fireEvent.mouseEnter(note);
    expect(row().hasAttribute("data-lit")).toBe(true);
    expect(row().hasAttribute("data-active")).toBe(false);
    expect(hasClasses(row(), CODE_ANNOTATION_ROW_LIT_CLASSES)).toBe(true);
    expect(hasClasses(gutterLine2(), CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES)).toBe(true);
    expect(note.getAttribute("data-lit")).toBe("true");
    expect(hasClasses(note, CODE_NOTE_LIT_CLASSES)).toBe(true);
    expect(hasClasses(chip, RANGE_CHIP_LIT_CLASSES)).toBe(true);

    // Mouse-leave unlights when nothing is sticky.
    fireEvent.mouseLeave(note);
    expect(row().hasAttribute("data-lit")).toBe(false);
    expect(row().className).not.toContain("bg-");
    expect(hasClasses(gutterLine2(), CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES)).toBe(false);
    expect(note.hasAttribute("data-lit")).toBe(false);

    // Sticky click keeps it lit after the pointer leaves.
    fireEvent.click(note);
    fireEvent.mouseLeave(note);
    expect(row().hasAttribute("data-lit")).toBe(true);
    expect(row().hasAttribute("data-active")).toBe(true);
    expect(hasClasses(row(), CODE_ANNOTATION_ROW_LIT_CLASSES)).toBe(true);
    expect(hasClasses(chip, RANGE_CHIP_LIT_CLASSES)).toBe(true);
  });

});

describe("CodeBlockNodeView inside a real editor", () => {
  const DocNode = Node.create({ name: "doc", topNode: true, content: "block+" });
  const TextNode = Node.create({ name: "text", group: "inline" });
  const CodeWithView = DocCodeBlock.extend({
    addNodeView() {
      return ReactNodeViewRenderer(CodeBlockNodeView);
    },
  });

  function MountEditor({ onReady }: { onReady: (editor: Editor) => void }) {
    const editor = useEditor({
      extensions: [DocNode, TextNode, CodeWithView],
      content: {
        type: "doc",
        content: [
          {
            type: "docCodeBlock",
            attrs: {
              blockId: "code-1",
              blockProps: { annotations: [{ lines: "2", note: "Second line." }] },
              language: "ts",
            },
            content: [{ type: "text", text: "const a = 1;\nconst b = 2;" }],
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

  it("mounts the shell around the live PM contentDOM and tracks line edits", async () => {
    let editorInstance: Editor | null = null;
    const { container } = render(<MountEditor onReady={(editor) => (editorInstance = editor)} />);

    await waitFor(() => {
      expect(container.querySelector("[data-code-header]")).toBeTruthy();
      expect(container.querySelector("pre code")).toBeTruthy();
    });
    // The editable text lives under pre>code with hard white-space (no soft wrap).
    const code = container.querySelector<HTMLElement>("pre code")!;
    expect(code.style.whiteSpace).toBe("pre");
    expect(code.textContent).toContain("const b = 2;");
    expect(container.querySelectorAll("[data-code-gutter-line]").length).toBe(2);
    expect(
      container.querySelector('[data-code-gutter-line="2"]')?.hasAttribute("data-annotated"),
    ).toBe(true);
    expect(container.querySelectorAll("[data-code-annotation-row]").length).toBe(1);
    expect(container.querySelector("[data-code-notes]")).toBeTruthy();

    // Appending a line re-renders the gutter from the new textContent.
    act(() => {
      const end = editorInstance!.state.doc.content.size - 1;
      editorInstance!.commands.insertContentAt(end, "\nconst c = 3;");
    });
    await waitFor(() => {
      expect(container.querySelectorAll("[data-code-gutter-line]").length).toBe(3);
    });
  });
});

describe("editor decorations", () => {
  const Doc = Node.create({ name: "doc", topNode: true, content: "block+" });
  const Text = Node.create({ name: "text", group: "inline" });
  const schema = getSchema([Doc, Text, DocCodeBlock]);

  function codeBlockState(text: string, blockProps: Record<string, unknown>) {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "docCodeBlock",
          attrs: { blockId: "code-1", blockProps, language: "ts" },
          content: [{ type: "text", text }],
        },
      ],
    });
    return EditorState.create({ schema, doc });
  }

  function decorationClasses(state: EditorState): string[] {
    return buildDecorations(state)
      .find()
      .map(
        (deco) =>
          (deco as unknown as { type: { attrs: { class?: string } } }).type.attrs.class ?? "",
      );
  }

  it("still emits hljs syntax token decorations", () => {
    const classes = decorationClasses(codeBlockState("const a = 1;", {}));
    expect(classes.length).toBeGreaterThan(0);
    expect(classes).toContain("hljs-keyword");
    expect(classes).toContain("hljs-number");
  });

  it("emits NO annotation decorations — annotated tint is the node view's overlay, not PM's", () => {
    const classes = decorationClasses(
      codeBlockState("const a = 1;\nconst b = 2;", {
        annotations: [{ lines: "1-2", note: "n" }],
      }),
    );
    expect(classes.length).toBeGreaterThan(0);
    for (const cls of classes) {
      expect(cls.startsWith("hljs")).toBe(true);
    }
  });
});
