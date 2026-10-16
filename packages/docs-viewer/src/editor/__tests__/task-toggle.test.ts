import { afterEach, describe, expect, it } from "bun:test";
import { Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { TEXT_BLOCK_NODES } from "../core/schema";
import { DocKeymap } from "../input/keymap";
import { diffToOps, docToPM, pmToDoc, type PMNode } from "../core/convert";

/**
 * Task-item checkbox toggling in the editor: a click on the marker span (the
 * DocTaskToggle plugin on DocListItem) flips `checked`, and the autosave
 * path (pmToDoc → diffToOps) turns that into ONE props-only updateBlock with
 * the block id unchanged. A read-only editor never toggles.
 */

let editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors) {
    editor.view.dom.parentElement?.remove();
    editor.destroy();
  }
  editors = [];
});

const BASE: DocDocument = {
  id: "doc",
  version: 1,
  title: "Tasks",
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["t-open", "t-done", "plain"] },
    "t-open": { id: "t-open", type: "list-item", props: { checked: false }, text: [{ insert: "Open" }], children: [] },
    "t-done": {
      id: "t-done",
      type: "list-item",
      props: { checked: true, ordered: true },
      text: [{ insert: "Done" }],
      children: ["t-child"],
    },
    "t-child": { id: "t-child", type: "list-item", props: { checked: false }, text: [{ insert: "Child" }], children: [] },
    plain: { id: "plain", type: "list-item", props: {}, text: [{ insert: "Plain" }], children: [] },
  },
} as unknown as DocDocument;

function createEditor(): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
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
    content: docToPM(BASE) as JSONContent,
    injectCSS: false,
  });
  editors.push(editor);
  return editor;
}

function marker(editor: Editor, blockId: string): HTMLElement {
  const item = editor.view.dom.querySelector(`li[data-block-id="${blockId}"]`);
  const box = item?.querySelector<HTMLElement>(":scope > [data-doc-list-marker]");
  if (!box) throw new Error(`no marker for ${blockId}`);
  return box;
}

function mouseDown(target: HTMLElement): boolean {
  // dispatchEvent returns false when a handler called preventDefault().
  return target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
}

function saved(editor: Editor): DocDocument {
  let n = 0;
  return pmToDoc(editor.getJSON() as PMNode, BASE, () => `fresh-${(n += 1)}`);
}

describe("task item checkbox in the editor", () => {
  it("renders the marker as an operable checkbox on the task item", () => {
    const editor = createEditor();
    const box = marker(editor, "t-open");
    expect(box.getAttribute("role")).toBe("checkbox");
    expect(box.getAttribute("aria-checked")).toBe("false");
    expect(box.hasAttribute("aria-disabled")).toBe(false);
    expect(box.getAttribute("contenteditable")).toBe("false");
    expect(marker(editor, "plain").getAttribute("aria-hidden")).toBe("true");
  });

  it("a click on the box toggles checked and saves as one props-only updateBlock", () => {
    const editor = createEditor();
    expect(diffToOps(BASE, saved(editor))).toEqual([]);

    expect(mouseDown(marker(editor, "t-open"))).toBe(false); // claimed
    expect(marker(editor, "t-open").getAttribute("aria-checked")).toBe("true");
    expect(diffToOps(BASE, saved(editor))).toEqual([
      { type: "updateBlock", blockId: "t-open", props: { checked: true } },
    ]);

    mouseDown(marker(editor, "t-open"));
    expect(diffToOps(BASE, saved(editor))).toEqual([]);
  });

  it("toggles the exact item clicked, including a nested one, and keeps ordered", () => {
    const editor = createEditor();
    mouseDown(marker(editor, "t-child"));
    mouseDown(marker(editor, "t-done"));
    const doc = saved(editor);
    expect(doc.blocks["t-child"]?.props).toEqual({ checked: true });
    expect(doc.blocks["t-done"]?.props).toEqual({ checked: false, ordered: true });
    expect(doc.blocks["t-done"]?.children).toEqual(["t-child"]);
    expect(doc.blocks["t-open"]?.props).toEqual({ checked: false });
  });

  it("ignores clicks on a plain item's marker and on the item's text", () => {
    const editor = createEditor();
    mouseDown(marker(editor, "plain"));
    const text = editor.view.dom.querySelector<HTMLElement>('li[data-block-id="t-open"] [data-doc-list-content]')!;
    mouseDown(text);
    expect(diffToOps(BASE, saved(editor))).toEqual([]);
  });

  it("never toggles in a read-only editor", () => {
    const editor = createEditor();
    editor.setEditable(false);
    mouseDown(marker(editor, "t-open"));
    expect(marker(editor, "t-open").getAttribute("aria-checked")).toBe("false");
    expect(diffToOps(BASE, saved(editor))).toEqual([]);
  });
});
