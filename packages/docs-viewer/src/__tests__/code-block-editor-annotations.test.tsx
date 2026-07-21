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
import { buildDecorations } from "../components/code/editor-highlight";
import { DocCodeBlock } from "../components/code/editor-nodes";
import { CodeBlockNodeView } from "../components/code/editor-node-view";
import { HIGHLIGHT_LANGUAGES } from "../components/code/highlight";

afterEach(() => {
  cleanup();
});

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

    const select = getByLabelText("Code block language") as HTMLSelectElement;
    expect(select.className).toContain("appearance-none");
    expect(select.className).toContain("uppercase");
    // Quiet look: muted text on a transparent bg, no pill tint; the
    // --docs-code-lang-fg token is the block-hover affordance color.
    expect(select.className).toContain("text-muted-foreground");
    expect(select.className).toContain("bg-transparent");
    expect(select.className).not.toContain("color-mix");
    expect(select.className).toContain(
      "group-hover/code:text-[color:var(--docs-code-lang-fg",
    );
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

  it("renders annotation overlay rows behind the text with 20px line geometry", () => {
    const { props } = nodeViewProps(
      { annotations: [{ lines: "2-3", note: "The math." }] },
      { text: "a\nb\nc\nd" },
    );
    const { container } = render(<CodeBlockNodeView {...props} />);

    const rows = container.querySelectorAll<HTMLElement>("[data-code-annotation-row]");
    expect(rows.length).toBe(1);
    expect(rows[0]?.style.top).toBe("20px");
    expect(rows[0]?.style.height).toBe("40px");
    expect(rows[0]?.className).toContain("pointer-events-none");
    // At rest the overlay is geometry only — no tint until the pair is lit.
    expect(rows[0]?.className).not.toContain("bg-");
    expect(rows[0]?.getAttribute("contenteditable")).toBe("false");
    // Matching gutter lines restyle; others do not. At rest that restyle is
    // the accent bar + accent number ONLY — no bg fill.
    const gutterLine2 = container.querySelector('[data-code-gutter-line="2"]')!;
    expect(gutterLine2.className).toContain("border-[color:var(--docs-code-annotation-accent");
    expect(gutterLine2.className).not.toContain("bg-");
    expect(
      container.querySelector('[data-code-gutter-line="2"]')?.hasAttribute("data-annotated"),
    ).toBe(true);
    expect(
      container.querySelector('[data-code-gutter-line="3"]')?.hasAttribute("data-annotated"),
    ).toBe(true);
    expect(
      container.querySelector('[data-code-gutter-line="1"]')?.hasAttribute("data-annotated"),
    ).toBe(false);
  });

  it("renders a bare single-column code block without annotations or when all entries are malformed", () => {
    for (const blockProps of [{}, { annotations: [] }, { annotations: [{ lines: 4 }] }]) {
      const { props } = nodeViewProps(blockProps);
      const { container, unmount } = render(<CodeBlockNodeView {...props} />);
      // No notes column, no notes header, no vertical divider — just the code block.
      expect(container.querySelector("[data-code-notes]")).toBeNull();
      expect(container.querySelector("[data-code-notes-header]")).toBeNull();
      expect(container.querySelector("[data-code-annotation-row]")).toBeNull();
      const frame = container.firstElementChild!;
      expect(frame.className).not.toContain("lg:grid-cols-[minmax(0,1fr)_320px]");
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

  it("renders the notes in a non-editable aside as plain uncarded buttons", () => {
    const { props } = nodeViewProps({ annotations: ANNOTATIONS });
    const { container, getByText } = render(<CodeBlockNodeView {...props} />);

    const aside = container.querySelector("[data-code-notes]");
    expect(aside).toBeTruthy();
    expect(aside?.getAttribute("contenteditable")).toBe("false");
    expect(container.querySelectorAll("[data-annotation-note]").length).toBe(2);
    // Notes are plain text at rest: no card border/background/ring on the
    // first note; later notes carry ONLY the between-items hairline rule.
    const note = container.querySelector('[data-annotation-note="0"]')!;
    expect(note.className).not.toContain("border");
    expect(note.className).not.toContain("bg-");
    expect(note.className).not.toContain("ring");
    const second = container.querySelector('[data-annotation-note="1"]')!;
    expect(second.className).toContain("border-t-[length:var(--docs-code-rule-width,1px)]");
    expect(second.className).not.toContain("bg-");
    expect(second.className).not.toContain("ring");
    // Aligned header cells: the notes column opens with its own h-7 header
    // cell carrying the same bottom rule as the code header, with the NOTES
    // label styled exactly like the language label.
    const notesHeader = container.querySelector("[data-code-notes-header]")!;
    const codeHeader = container.querySelector("[data-code-header]")!;
    for (const cell of [codeHeader, notesHeader]) {
      expect(cell.className).toContain("h-7");
      expect(cell.className).toContain("border-b-[length:var(--docs-code-rule-width,1px)]");
      expect(cell.className).toContain("var(--docs-code-rule,var(--border))");
      expect(cell.className).toContain("--docs-code-rule-opacity");
    }
    const select = container.querySelector("select")!;
    const notesLabel = notesHeader.querySelector("span")!;
    // The label classes are the select's quiet base (minus its picker affordance classes).
    for (const token of notesLabel.className.split(" ")) {
      expect(select.className).toContain(token);
    }
    // Chipless notes: the raw lines key rides in the note button's title.
    expect(container.querySelector("[data-range-chip]")).toBeNull();
    expect(
      container.querySelector('[data-annotation-note="0"]')?.getAttribute("title"),
    ).toBe("1-2");
    expect(getByText("Setup")).toBeTruthy();
    expect(getByText("Declares the inputs.")).toBeTruthy();
    expect(getByText("The sum.")).toBeTruthy();
    // Annotated frame becomes the two-column grid at lg (aside on the right).
    const frame = container.firstElementChild!;
    expect(frame.className).toContain("lg:grid-cols-[minmax(0,1fr)_320px]");
  });

  it("note clicks toggle the active pair, restyle overlays + gutter, and scroll the range into view", async () => {
    const { props } = nodeViewProps(
      { annotations: [{ lines: "5-6", note: "Deep note." }] },
      { text: "1\n2\n3\n4\n5\n6\n7" },
    );
    const { container } = render(<CodeBlockNodeView {...props} />);

    const note = container.querySelector('[data-annotation-note="0"]')!;
    const row = () => container.querySelector('[data-code-annotation-row="0"]')!;
    const scroll = container.querySelector<HTMLElement>("[data-code-scroll]")!;

    fireEvent.click(note);
    expect(note.hasAttribute("data-active")).toBe(true);
    expect(row().hasAttribute("data-active")).toBe(true);
    expect(row().className).toContain("ring-inset");
    await waitFor(() => {
      // First covered line is 5: (5-1)*20 - 8 = 72.
      expect(scroll.scrollTop).toBe(72);
    });

    // Clicking the active note again clears the pair.
    fireEvent.click(note);
    expect(note.hasAttribute("data-active")).toBe(false);
    expect(row().hasAttribute("data-active")).toBe(false);
  });

  it("hovering a note lights its overlay transiently; mouse-leave unlights unless sticky-clicked", () => {
    const { props } = nodeViewProps(
      { annotations: [{ lines: "2-3", note: "The math." }] },
      { text: "a\nb\nc\nd" },
    );
    const { container } = render(<CodeBlockNodeView {...props} />);

    const note = container.querySelector('[data-annotation-note="0"]')!;
    const row = () => container.querySelector('[data-code-annotation-row="0"]')!;
    const gutterLine2 = () => container.querySelector('[data-code-gutter-line="2"]')!;

    // Rest: no tint on the overlay or the annotated gutter line.
    expect(row().className).not.toContain("bg-");
    expect(gutterLine2().className).not.toContain("bg-");

    // Hover lights the pair (tint appears) without sticky activation.
    fireEvent.mouseEnter(note);
    expect(row().hasAttribute("data-lit")).toBe(true);
    expect(row().hasAttribute("data-active")).toBe(false);
    expect(row().className).toContain("bg-[color:color-mix(in_srgb,var(--docs-code-annotation-accent");
    expect(gutterLine2().className).toContain("bg-[color:color-mix(in_srgb,var(--docs-code-annotation-accent");
    expect(note.className).toContain("bg-[color:color-mix");

    // Mouse-leave unlights when nothing is sticky.
    fireEvent.mouseLeave(note);
    expect(row().hasAttribute("data-lit")).toBe(false);
    expect(row().className).not.toContain("bg-");

    // Sticky click keeps it lit after the pointer leaves.
    fireEvent.click(note);
    fireEvent.mouseLeave(note);
    expect(row().hasAttribute("data-lit")).toBe(true);
    expect(row().hasAttribute("data-active")).toBe(true);
    expect(row().className).toContain("bg-[color:color-mix");
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
