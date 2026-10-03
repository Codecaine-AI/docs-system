import { afterEach, describe, expect, it } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { Editor, EditorContent } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TEXT_BLOCK_NODES } from "../core/schema";
import { DocKeymap } from "../input/keymap";

/**
 * Keys inside a callout's nested children must behave exactly like the same
 * keys on top-level blocks (dogfood report: empty bullets inside a callout
 * could not be deleted, typing "just broke").
 *
 * Unlike keymap.test.tsx, the callout's React node view is MOUNTED here and
 * keys are dispatched as real DOM keydown events on the cursor's EDITING
 * HOST — the element a browser targets with keydown (the focused
 * contenteditable). That is what caught the bug: the node view's
 * contentEditable={true} island inside a contentEditable={false} frame was
 * its own editing host, and TipTap's NodeView.stopEvent dropped every
 * keydown aimed at it, so DocKeymap never ran inside callouts.
 */

let editor: Editor | undefined;

afterEach(() => {
  cleanup();
  editor?.destroy();
  editor = undefined;
});

function wrapper(text?: string): JSONContent {
  return { type: "docBlockText", content: text ? [{ type: "text", text }] : [] };
}

function paragraph(text?: string): JSONContent {
  return { type: "docParagraph", attrs: {}, content: [wrapper(text)] };
}

function listItem(text?: string, children: JSONContent[] = []): JSONContent {
  return { type: "docListItem", attrs: {}, content: [wrapper(text), ...children] };
}

function callout(children: JSONContent[]): JSONContent {
  return {
    type: "docCallout",
    attrs: { blockId: "co1", blockProps: { tone: "info" } },
    content: [wrapper(), ...children],
  };
}

async function mount(content: JSONContent[]): Promise<Editor> {
  const mounted = new Editor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        paragraph: false,
        trailingNode: false,
        undoRedo: false,
      }),
      ...TEXT_BLOCK_NODES,
      DocKeymap,
    ],
    content: { type: "doc", content },
    injectCSS: false,
  });
  editor = mounted;
  const { container } = render(<EditorContent editor={mounted} />);
  // React node views mount their contentDOM on a later render pass.
  await waitFor(() =>
    expect(container.querySelector("[data-callout-body] [data-doc-node]")).not.toBeNull(),
  );
  return mounted;
}

/** Puts the cursor in the LAST block whose own text is `text`, at `offset` (default: end). */
function cursorInText(target: Editor, text: string, offset = text.length): void {
  let found = -1;
  target.state.doc.descendants((node, pos) => {
    if (node.type.name === "docBlockText" && node.textContent === text) found = pos + 1;
    return true;
  });
  if (found < 0) throw new Error(`no block with text "${text}"`);
  act(() => {
    target.commands.setTextSelection(found + offset);
  });
}

/** The contenteditable element a browser would target with keydown at the cursor. */
function editingHost(target: Editor): HTMLElement {
  const { node } = target.view.domAtPos(target.state.selection.from);
  const element = node instanceof HTMLElement ? node : node.parentElement;
  const host = element?.closest<HTMLElement>('[contenteditable="true"]');
  if (!host) throw new Error("cursor has no editing host");
  return host;
}

function press(target: Editor, key: string, shift = false): void {
  act(() => {
    editingHost(target).dispatchEvent(
      new KeyboardEvent("keydown", { key, shiftKey: shift, bubbles: true, cancelable: true }),
    );
  });
}

/** Compact outline of a block subtree: `type(text children…)`. */
function outline(node: JSONContent): string {
  const own = node.content?.[0]?.content?.[0]?.text ?? "";
  const kids = (node.content ?? []).slice(1).map(outline);
  return `${node.type!.replace(/^doc/, "")}(${[own, ...kids].filter(Boolean).join(" ")})`;
}

function calloutOutline(target: Editor): string {
  const json = target.getJSON() as JSONContent;
  return outline(json.content!.find((node) => node.type === "docCallout")!);
}

describe("callout children keep top-level key behavior", () => {
  it("the cursor's editing host inside a callout is the editor itself", async () => {
    const mounted = await mount([callout([listItem("one"), listItem()])]);
    cursorInText(mounted, "one");

    expect(editingHost(mounted)).toBe(mounted.view.dom);
    const head = mounted.view.dom.querySelector("[data-callout-head]");
    expect(head?.getAttribute("contenteditable")).toBe("false");
  });

  it("Backspace in an empty list item converts it to a paragraph, then merges it upward", async () => {
    const mounted = await mount([callout([paragraph("Intro"), listItem("one"), listItem()])]);
    cursorInText(mounted, "");
    expect(mounted.state.selection.$from.node(-1).type.name).toBe("docListItem");

    press(mounted, "Backspace");
    expect(calloutOutline(mounted)).toBe("Callout(Paragraph(Intro) ListItem(one) Paragraph())");

    press(mounted, "Backspace");
    expect(calloutOutline(mounted)).toBe("Callout(Paragraph(Intro) ListItem(one))");
    expect(mounted.state.selection.$from.parent.textContent).toBe("one");
  });

  it("Backspace in an empty NESTED item outdents it a level", async () => {
    const mounted = await mount([callout([listItem("two", [listItem("sub"), listItem()])])]);
    cursorInText(mounted, "");
    expect(mounted.state.selection.$from.node(-2).type.name).toBe("docListItem");

    press(mounted, "Backspace");
    expect(calloutOutline(mounted)).toBe("Callout(ListItem(two ListItem(sub)) ListItem())");
  });

  it("Enter at the end of an item adds a sibling item inside the callout, and typing fills it", async () => {
    const mounted = await mount([callout([listItem("one")]), paragraph("After")]);
    cursorInText(mounted, "one");

    press(mounted, "Enter");
    act(() => {
      mounted.commands.insertContent("two");
    });
    expect(calloutOutline(mounted)).toBe("Callout(ListItem(one) ListItem(two))");
    expect(outline((mounted.getJSON() as JSONContent).content![1]!)).toBe("Paragraph(After)");
  });

  it("Tab nests an item under its previous sibling; Shift-Tab brings it back", async () => {
    const mounted = await mount([callout([listItem("one"), listItem("two")])]);
    cursorInText(mounted, "two", 0);

    press(mounted, "Tab");
    expect(calloutOutline(mounted)).toBe("Callout(ListItem(one ListItem(two)))");

    press(mounted, "Tab", true);
    expect(calloutOutline(mounted)).toBe("Callout(ListItem(one) ListItem(two))");
  });
});
