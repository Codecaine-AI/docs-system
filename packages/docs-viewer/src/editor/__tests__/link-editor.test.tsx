import { afterEach, describe, expect, it } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { TEXT_BLOCK_NODES } from "../core/schema";
import { DocKeymap } from "../input/keymap";
import { pmToDoc, type PMNode } from "../core/convert";
import {
  LinkEditor,
  LinkEditorPopover,
  isPlausibleUrl,
  linkEditorPluginKey,
  type LinkEditorState,
} from "../menus/link-editor";

/**
 * Notion-style link authoring (link-editor.tsx): Mod-K popover (open only on
 * a non-empty selection, prefill from an existing link, Enter applies /
 * empty-Enter and Remove strip, Escape closes without changes) and the
 * paste-URL-over-selection plugin (wrap, never replace — and ONLY for a
 * single plausible http(s) URL over a single-block selection).
 *
 * Editor + key plumbing follow keymap.test.tsx (real schema, keys through
 * the view's someProp handleKeyDown chain); popover interaction follows
 * SlashMenu.test.tsx (@testing-library render + act-flushed floating-ui).
 */

const editors: Editor[] = [];
const hosts: HTMLElement[] = [];

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
  for (const host of hosts.splice(0)) host.remove();
});

function createEditor(content: JSONContent[]): Editor {
  const host = document.createElement("div");
  document.body.appendChild(host);
  hosts.push(host);
  const editor = new Editor({
    element: host,
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
        link: { openOnClick: false, autolink: false, linkOnPaste: false },
      }),
      ...TEXT_BLOCK_NODES,
      // Real DocEditor order: the link extension's keymap ahead of DocKeymap.
      LinkEditor,
      DocKeymap,
    ],
    content: { type: "doc", content },
    injectCSS: false,
  });
  editors.push(editor);
  return editor;
}

// ---- content builders (real schema shape, as in keymap.test.tsx) ----------

function wrapper(inline: JSONContent[]): JSONContent {
  return { type: "docBlockText", content: inline };
}

function paragraph(inline: JSONContent[], attrs: Record<string, unknown> = {}): JSONContent {
  return { type: "docParagraph", attrs, content: [wrapper(inline)] };
}

function text(value: string, marks?: JSONContent["marks"]): JSONContent {
  return { type: "text", text: value, ...(marks ? { marks } : {}) };
}

function codeBlock(value: string, attrs: Record<string, unknown> = {}): JSONContent {
  return { type: "docCodeBlock", attrs, content: [{ type: "text", text: value }] };
}

// ---- helpers ----------------------------------------------------------------

const IS_MAC =
  typeof navigator !== "undefined" ? /Mac|iP(hone|[oa]d)/.test(navigator.platform) : false;

/** Drives a key through the view's full handleKeyDown chain (every keymap plugin, ours first) — keymap.test.tsx convention. */
function pressKey(editor: Editor, key: string, modifiers: { mod?: boolean } = {}): boolean {
  const event = new KeyboardEvent("keydown", {
    key,
    metaKey: (modifiers.mod ?? false) && IS_MAC,
    ctrlKey: (modifiers.mod ?? false) && !IS_MAC,
  });
  let handled = false;
  editor.view.someProp("handleKeyDown", (handler) => {
    handled = handler(editor.view, event) === true;
    return handled;
  });
  return handled;
}

function linkState(editor: Editor): LinkEditorState {
  const state = linkEditorPluginKey.getState(editor.state);
  if (!state) throw new Error("link editor plugin state missing");
  return state;
}

/** Feeds a synthetic paste (plain-text clipboard) to the link plugin's handlePaste — the exact prop the real view dispatches into. Returns handled. */
function pasteText(editor: Editor, clipboardText: string): boolean {
  const plugin = linkEditorPluginKey.get(editor.state);
  const handlePaste = plugin?.props.handlePaste;
  if (!plugin || !handlePaste) throw new Error("link editor plugin not found");
  const event = {
    clipboardData: { getData: (type: string) => (type === "text/plain" ? clipboardText : "") },
  } as unknown as ClipboardEvent;
  const emptySlice = editor.state.doc.slice(0, 0);
  return handlePaste.call(plugin, editor.view, event, emptySlice) === true;
}

/** First block's wrapper inline content from getJSON. */
function inlineJSON(editor: Editor): JSONContent[] {
  return (editor.getJSON() as JSONContent).content![0].content![0].content ?? [];
}

/** Flushes floating-ui's promise-scheduled position updates inside `act` (SlashMenu.test.tsx convention). */
async function flushFloating() {
  await act(async () => {});
}

/** Renders the popover, selects [from,to] and opens it via Mod-K; returns the mounted container. */
async function openPopover(editor: Editor, from: number, to: number): Promise<HTMLElement> {
  const { container } = render(<LinkEditorPopover editor={editor} />);
  await act(async () => {
    editor.commands.setTextSelection({ from, to });
    expect(pressKey(editor, "k", { mod: true })).toBe(true);
  });
  await flushFloating();
  return container;
}

function inputOf(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>("[data-doc-link-input]");
  if (!input) throw new Error("link input not rendered");
  return input;
}

// ---------------------------------------------------------------------------

describe("isPlausibleUrl", () => {
  it("accepts a single http(s) URL and nothing else", () => {
    expect(isPlausibleUrl("https://example.com/a?b=1#c")).toBe(true);
    expect(isPlausibleUrl("http://example.com")).toBe(true);
    expect(isPlausibleUrl("example.com")).toBe(false); // no scheme — not unambiguously a URL
    expect(isPlausibleUrl("javascript:alert(1)")).toBe(false);
    expect(isPlausibleUrl("see https://example.com today")).toBe(false); // prose containing a URL
    expect(isPlausibleUrl("https://a.com https://b.com")).toBe(false); // two URLs
    expect(isPlausibleUrl("")).toBe(false);
  });
});

describe("Mod-K open/no-op", () => {
  it("opens the popover state for a non-empty selection (no existing link → empty href)", () => {
    const editor = createEditor([paragraph([text("Hello world")], { blockId: "p1" })]);
    editor.commands.setTextSelection({ from: 2, to: 7 }); // "Hello"

    expect(pressKey(editor, "k", { mod: true })).toBe(true);

    expect(linkState(editor)).toMatchObject({ open: true, from: 2, to: 7, href: "" });
  });

  it("is a no-op (not handled, stays closed) with a collapsed cursor", () => {
    const editor = createEditor([paragraph([text("Hello world")], { blockId: "p1" })]);
    editor.commands.setTextSelection(4);

    expect(pressKey(editor, "k", { mod: true })).toBe(false);

    expect(linkState(editor).open).toBe(false);
  });

  it("is a no-op inside a code block (marks disallowed there)", () => {
    const editor = createEditor([codeBlock("const a = 1;", { blockId: "c1" })]);
    editor.commands.setTextSelection({ from: 1, to: 6 });

    expect(pressKey(editor, "k", { mod: true })).toBe(false);
    expect(linkState(editor).open).toBe(false);
  });

  it("prefills href when the selection already carries a link", () => {
    const editor = createEditor([
      paragraph(
        [text("visit "), text("here", [{ type: "link", attrs: { href: "https://old.example" } }])],
        { blockId: "p1" },
      ),
    ]);
    editor.commands.setTextSelection({ from: 8, to: 12 }); // "here"

    expect(pressKey(editor, "k", { mod: true })).toBe(true);

    expect(linkState(editor)).toMatchObject({ open: true, href: "https://old.example" });
  });
});

describe("LinkEditorPopover", () => {
  it("Enter in the input applies the link mark to the selection and closes", async () => {
    const editor = createEditor([paragraph([text("Hello world")], { blockId: "p1" })]);
    const container = await openPopover(editor, 2, 7); // "Hello"

    const input = inputOf(container);
    await act(async () => {
      fireEvent.change(input, { target: { value: "https://example.com" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(linkState(editor).open).toBe(false);
    expect(inlineJSON(editor)).toEqual([
      { type: "text", text: "Hello", marks: [{ type: "link", attrs: expect.objectContaining({ href: "https://example.com" }) }] },
      { type: "text", text: " world" },
    ]);
    // Cursor collapsed to the end of the linked range, back in the editor.
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(7);

    // Round trip through the save-path conversion: the mark persists as the
    // DeltaSpan `attributes.link` the read surfaces render.
    const baseDoc: DocDocument = {
      schemaVersion: 1,
      id: "doc-1",
      root: "root",
      blocks: { root: { id: "root", type: "paragraph", props: {}, children: ["p1"] } },
    };
    let n = 0;
    const doc = pmToDoc(editor.getJSON() as PMNode, baseDoc, () => `fresh-${(n += 1)}`);
    expect(doc.blocks["p1"].text).toEqual([
      { insert: "Hello", attributes: { link: "https://example.com" } },
      { insert: " world" },
    ]);
  });

  it("prefills an existing link; Remove strips the mark and closes", async () => {
    const editor = createEditor([
      paragraph([text("here", [{ type: "link", attrs: { href: "https://old.example" } }])], {
        blockId: "p1",
      }),
    ]);
    const container = await openPopover(editor, 2, 6); // "here"

    expect(inputOf(container).value).toBe("https://old.example");
    const remove = container.querySelector("[data-doc-link-remove]");
    expect(remove).not.toBeNull();

    await act(async () => {
      fireEvent.mouseDown(remove!);
    });

    expect(linkState(editor).open).toBe(false);
    expect(inlineJSON(editor)).toEqual([{ type: "text", text: "here" }]);
  });

  it("clearing the input + Enter also removes the link", async () => {
    const editor = createEditor([
      paragraph([text("here", [{ type: "link", attrs: { href: "https://old.example" } }])], {
        blockId: "p1",
      }),
    ]);
    const container = await openPopover(editor, 2, 6);

    const input = inputOf(container);
    await act(async () => {
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(linkState(editor).open).toBe(false);
    expect(inlineJSON(editor)).toEqual([{ type: "text", text: "here" }]);
  });

  it("Escape closes without changes; no Remove button when the selection has no link", async () => {
    const editor = createEditor([paragraph([text("Hello world")], { blockId: "p1" })]);
    const container = await openPopover(editor, 2, 7);

    expect(container.querySelector("[data-doc-link-remove]")).toBeNull();

    const input = inputOf(container);
    await act(async () => {
      fireEvent.change(input, { target: { value: "https://typed.example" } });
      fireEvent.keyDown(input, { key: "Escape" });
    });

    expect(linkState(editor).open).toBe(false);
    // Doc untouched — the typed-but-not-committed URL never landed.
    expect(inlineJSON(editor)).toEqual([{ type: "text", text: "Hello world" }]);
    // The original selection is restored in the editor.
    expect(editor.state.selection.from).toBe(2);
    expect(editor.state.selection.to).toBe(7);
  });

  it("clicking outside closes without changes", async () => {
    const editor = createEditor([paragraph([text("Hello world")], { blockId: "p1" })]);
    await openPopover(editor, 2, 7);
    expect(linkState(editor).open).toBe(true);

    await act(async () => {
      fireEvent.mouseDown(document.body);
    });

    expect(linkState(editor).open).toBe(false);
    expect(inlineJSON(editor)).toEqual([{ type: "text", text: "Hello world" }]);
  });

  it("Escape from the editor keymap (focus back in the doc) also closes", async () => {
    const editor = createEditor([paragraph([text("Hello world")], { blockId: "p1" })]);
    await openPopover(editor, 2, 7);
    expect(linkState(editor).open).toBe(true);

    await act(async () => {
      expect(pressKey(editor, "Escape")).toBe(true);
    });

    expect(linkState(editor).open).toBe(false);
  });
});

describe("paste-URL-over-selection", () => {
  it("wraps a non-empty single-block selection in a link instead of replacing the text", () => {
    const editor = createEditor([paragraph([text("Hello world")], { blockId: "p1" })]);
    editor.commands.setTextSelection({ from: 2, to: 7 }); // "Hello"

    expect(pasteText(editor, "https://example.com")).toBe(true);

    expect(inlineJSON(editor)).toEqual([
      { type: "text", text: "Hello", marks: [{ type: "link", attrs: expect.objectContaining({ href: "https://example.com" }) }] },
      { type: "text", text: " world" },
    ]);
  });

  it("replaces an existing link's href when pasted over it", () => {
    const editor = createEditor([
      paragraph([text("here", [{ type: "link", attrs: { href: "https://old.example" } }])], {
        blockId: "p1",
      }),
    ]);
    editor.commands.setTextSelection({ from: 2, to: 6 });

    expect(pasteText(editor, "https://new.example")).toBe(true);

    expect(inlineJSON(editor)[0].marks).toEqual([
      { type: "link", attrs: expect.objectContaining({ href: "https://new.example" }) },
    ]);
    expect(inlineJSON(editor)[0].text).toBe("here");
  });

  it("inserts a URL pasted at a collapsed cursor as PLAIN unlinked text (TipTap's link paste rule must not fire)", () => {
    const editor = createEditor([paragraph([text("Hello world")], { blockId: "p1" })]);
    editor.commands.setTextSelection(4);

    expect(pasteText(editor, "https://example.com")).toBe(true);
    // The URL landed as literal text at the cursor, carrying NO link mark.
    expect(inlineJSON(editor)).toEqual([{ type: "text", text: "Hehttps://example.comllo world" }]);
  });

  it("does NOT handle non-URL clipboard text over a selection (default paste replaces)", () => {
    const editor = createEditor([paragraph([text("Hello world")], { blockId: "p1" })]);
    editor.commands.setTextSelection({ from: 2, to: 7 });

    expect(pasteText(editor, "not a url")).toBe(false);
    expect(pasteText(editor, "see https://example.com today")).toBe(false);
    expect(inlineJSON(editor)).toEqual([{ type: "text", text: "Hello world" }]);
  });

  it("does NOT handle a selection spanning two blocks", () => {
    const editor = createEditor([
      paragraph([text("Alpha")], { blockId: "p1" }),
      paragraph([text("Bravo")], { blockId: "p2" }),
    ]);
    editor.commands.setTextSelection({ from: 4, to: 12 }); // crosses the block boundary

    expect(pasteText(editor, "https://example.com")).toBe(false);
  });

  it("does NOT handle a selection inside a code block (marks disallowed)", () => {
    const editor = createEditor([codeBlock("const a = 1;", { blockId: "c1" })]);
    editor.commands.setTextSelection({ from: 1, to: 6 });

    expect(pasteText(editor, "https://example.com")).toBe(false);
  });
});
