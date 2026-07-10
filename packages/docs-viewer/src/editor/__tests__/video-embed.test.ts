import { afterEach, describe, expect, it } from "bun:test";
import { Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { ATOM_BLOCK_NODES, TEXT_BLOCK_NODES } from "../core/schema";
import { DocKeymap } from "../input/keymap";
import { LinkEditor, linkEditorPluginKey } from "../menus/link-editor";
import {
  VideoDropHandler,
  isVideoFile,
  videoDropPluginKey,
  type UploadVideoAsset,
} from "../input/video-embed";

/**
 * Paste/drop-a-video authoring (input/video-embed.ts): a single known
 * provider URL (YouTube/Vimeo/Loom) pasted at a collapsed cursor becomes a
 * docVideo block — replacing an empty paragraph, inserted after a non-empty
 * one — while link-editor's Notion paste semantics stay intact (URL over a
 * selection → link mark; non-provider URL at a collapsed cursor → plain
 * text). Dropping a provider URL or a video file (through the host-provided
 * `uploadAsset` slot) inserts the same atom at the drop position.
 *
 * Editor plumbing follows link-editor.test.tsx (real schema, synthetic
 * paste/drop driven through the plugins' own props — the exact props the
 * real view dispatches into). The atom nodes are registered WITHOUT their
 * React NodeViews: these tests assert doc structure, not rendering.
 */

const YT_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const YT_EMBEDDABLE = { url: YT_URL };

const editors: Editor[] = [];
const hosts: HTMLElement[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  for (const host of hosts.splice(0)) host.remove();
});

function createEditor(
  content: JSONContent[],
  uploadAsset?: UploadVideoAsset,
): Editor {
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
      ...ATOM_BLOCK_NODES,
      // Real DocEditor order: LinkEditor (whose handlePaste hosts the video
      // paste path) ahead of the drop handler and DocKeymap.
      LinkEditor,
      VideoDropHandler.configure({ getUploadAsset: () => uploadAsset }),
      DocKeymap,
    ],
    content: { type: "doc", content },
    injectCSS: false,
  });
  editors.push(editor);
  return editor;
}

// ---- content builders (link-editor.test.tsx conventions) -------------------

function wrapper(inline: JSONContent[]): JSONContent {
  return { type: "docBlockText", content: inline };
}

function paragraph(inline: JSONContent[], attrs: Record<string, unknown> = {}): JSONContent {
  return { type: "docParagraph", attrs, content: [wrapper(inline)] };
}

function text(value: string): JSONContent {
  return { type: "text", text: value };
}

function codeBlock(value: string, attrs: Record<string, unknown> = {}): JSONContent {
  return { type: "docCodeBlock", attrs, content: [{ type: "text", text: value }] };
}

// ---- helpers ----------------------------------------------------------------

/** Feeds a synthetic plain-text paste through link-editor's handlePaste (the plugin hosting the video paste path) — link-editor.test.tsx convention. */
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

/**
 * Feeds a synthetic drop through the video plugin's handleDrop. happy-dom
 * can't compute PM coords, so video-embed.ts's posAtCoords fallback (the
 * current selection) provides the drop position — tests set the selection to
 * the intended drop point first.
 */
function drop(
  editor: Editor,
  dataTransfer: { files?: File[]; data?: Record<string, string> },
): boolean {
  const plugin = videoDropPluginKey.get(editor.state);
  const handleDrop = plugin?.props.handleDrop;
  if (!plugin || !handleDrop) throw new Error("video drop plugin not found");
  const event = {
    clientX: 0,
    clientY: 0,
    preventDefault() {},
    dataTransfer: {
      files: dataTransfer.files ?? [],
      getData: (type: string) => dataTransfer.data?.[type] ?? "",
    },
  } as unknown as DragEvent;
  const emptySlice = editor.state.doc.slice(0, 0);
  return handleDrop.call(plugin, editor.view, event, emptySlice, false) === true;
}

/** Top-level block list from getJSON, as [type, attrs] pairs for shape asserts. */
function topBlocks(editor: Editor): Array<{ type: string; blockProps: unknown }> {
  return ((editor.getJSON() as JSONContent).content ?? []).map((node) => ({
    type: node.type ?? "",
    blockProps: node.attrs?.blockProps,
  }));
}

function videoNodes(editor: Editor): Array<Record<string, unknown>> {
  return topBlocks(editor)
    .filter((block) => block.type === "docVideo")
    .map((block) => block.blockProps as Record<string, unknown>);
}

/** Awaits the sequential upload+insert microtask chain kicked off by a file drop. */
async function flushUploads(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------

describe("provider-URL paste at a collapsed cursor", () => {
  it("replaces an EMPTY paragraph with a docVideo carrying the url", () => {
    const editor = createEditor([paragraph([], { blockId: "p1" })]);
    editor.commands.setTextSelection(2); // inside the empty wrapper

    expect(pasteText(editor, YT_URL)).toBe(true);

    expect(topBlocks(editor)).toEqual([{ type: "docVideo", blockProps: YT_EMBEDDABLE }]);
    // Fresh insertion follows the slash-menu id convention: blockId is null
    // until the save path mints one.
    expect((editor.getJSON() as JSONContent).content?.[0]?.attrs?.blockId ?? null).toBeNull();
  });

  it("inserts the docVideo AFTER a non-empty paragraph, leaving its text intact", () => {
    const editor = createEditor([
      paragraph([text("Hello world")], { blockId: "p1" }),
      paragraph([text("Below")], { blockId: "p2" }),
    ]);
    editor.commands.setTextSelection(4); // collapsed, mid-"Hello"

    expect(pasteText(editor, YT_URL)).toBe(true);

    const blocks = topBlocks(editor);
    expect(blocks.map((block) => block.type)).toEqual([
      "docParagraph",
      "docVideo",
      "docParagraph",
    ]);
    expect(blocks[1].blockProps).toEqual(YT_EMBEDDABLE);
    const json = editor.getJSON() as JSONContent;
    expect(json.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe("Hello world");
  });

  it("recognizes youtu.be / Vimeo / Loom forms too", () => {
    for (const url of [
      "https://youtu.be/dQw4w9WgXcQ",
      "https://vimeo.com/76979871",
      "https://www.loom.com/share/abc123DEF456",
    ]) {
      const editor = createEditor([paragraph([], { blockId: "p1" })]);
      editor.commands.setTextSelection(2);
      expect(pasteText(editor, url)).toBe(true);
      expect(videoNodes(editor)).toEqual([{ url }]);
    }
  });

  it("keeps a provider URL pasted OVER a non-empty selection as a link mark (never a video)", () => {
    const editor = createEditor([paragraph([text("Hello world")], { blockId: "p1" })]);
    editor.commands.setTextSelection({ from: 2, to: 7 }); // "Hello"

    expect(pasteText(editor, YT_URL)).toBe(true);

    expect(videoNodes(editor)).toEqual([]);
    const json = editor.getJSON() as JSONContent;
    const inline = json.content?.[0]?.content?.[0]?.content ?? [];
    expect(inline[0]).toEqual({
      type: "text",
      text: "Hello",
      marks: [{ type: "link", attrs: expect.objectContaining({ href: YT_URL }) }],
    });
  });

  it("keeps a NON-provider URL at a collapsed cursor as plain unlinked text", () => {
    const editor = createEditor([paragraph([text("Hello world")], { blockId: "p1" })]);
    editor.commands.setTextSelection(4);

    expect(pasteText(editor, "https://example.com/watch?v=nope")).toBe(true);

    expect(videoNodes(editor)).toEqual([]);
    const json = editor.getJSON() as JSONContent;
    expect(json.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe(
      "Hehttps://example.com/watch?v=nopello world",
    );
    expect(json.content?.[0]?.content?.[0]?.content?.[0]?.marks).toBeUndefined();
  });

  it("keeps a provider URL pasted inside a code block as plain text (no video block)", () => {
    const editor = createEditor([codeBlock("const a = 1;", { blockId: "c1" })]);
    editor.commands.setTextSelection(3);

    expect(pasteText(editor, YT_URL)).toBe(true);

    expect(videoNodes(editor)).toEqual([]);
    const json = editor.getJSON() as JSONContent;
    expect(json.content?.[0]?.type).toBe("docCodeBlock");
    expect(json.content?.[0]?.content?.[0]?.text).toContain(YT_URL);
  });
});

describe("provider-URL drop", () => {
  it("inserts a docVideo at the drop position from a text/uri-list dataTransfer", () => {
    const editor = createEditor([paragraph([text("Hello world")], { blockId: "p1" })]);
    editor.commands.setTextSelection(4); // posAtCoords fallback = drop point

    expect(drop(editor, { data: { "text/uri-list": `# comment\r\n${YT_URL}\r\n` } })).toBe(true);

    expect(topBlocks(editor).map((block) => block.type)).toEqual(["docParagraph", "docVideo"]);
    expect(videoNodes(editor)).toEqual([YT_EMBEDDABLE]);
  });

  it("inserts from a single-URL text/plain dataTransfer, and declines non-provider drops", () => {
    const editor = createEditor([paragraph([text("Hello")], { blockId: "p1" })]);
    editor.commands.setTextSelection(3);

    expect(drop(editor, { data: { "text/plain": "https://example.com/no" } })).toBe(false);
    expect(drop(editor, { data: { "text/plain": `see ${YT_URL} now` } })).toBe(false);
    expect(videoNodes(editor)).toEqual([]);

    expect(drop(editor, { data: { "text/plain": YT_URL } })).toBe(true);
    expect(videoNodes(editor)).toEqual([YT_EMBEDDABLE]);
  });
});

describe("video-file drop (host uploadAsset slot)", () => {
  const mp4 = () => new File([new Uint8Array([1, 2, 3, 4])], "clip.mp4", { type: "video/mp4" });

  it("classifies droppable video files by MIME or extension", () => {
    expect(isVideoFile(mp4())).toBe(true);
    expect(isVideoFile(new File([], "movie.MOV", { type: "" }))).toBe(true);
    expect(isVideoFile(new File([], "notes.txt", { type: "text/plain" }))).toBe(false);
    expect(isVideoFile(new File([], "photo.png", { type: "image/png" }))).toBe(false);
  });

  it("uploads the dropped file and inserts a docVideo carrying the resolved src", async () => {
    const uploaded: string[] = [];
    const uploadAsset: UploadVideoAsset = async (file) => {
      uploaded.push(file.name);
      return { src: "./assets/videos/clip.mp4" };
    };
    const editor = createEditor([paragraph([text("Hello")], { blockId: "p1" })], uploadAsset);
    editor.commands.setTextSelection(3);

    expect(drop(editor, { files: [mp4()] })).toBe(true);
    await flushUploads();

    expect(uploaded).toEqual(["clip.mp4"]);
    expect(videoNodes(editor)).toEqual([{ src: "./assets/videos/clip.mp4" }]);
  });

  it("inserts one docVideo per file for a multi-file drop, in order", async () => {
    let counter = 0;
    const uploadAsset: UploadVideoAsset = async () => ({
      src: `./assets/videos/clip-${(counter += 1)}.mp4`,
    });
    const editor = createEditor([paragraph([], { blockId: "p1" })], uploadAsset);
    editor.commands.setTextSelection(2);

    expect(drop(editor, { files: [mp4(), mp4()] })).toBe(true);
    await flushUploads();

    expect(videoNodes(editor)).toEqual([
      { src: "./assets/videos/clip-1.mp4" },
      { src: "./assets/videos/clip-2.mp4" },
    ]);
  });

  it("a rejected upload inserts nothing and does not throw (console.error only)", async () => {
    const uploadAsset: UploadVideoAsset = async () => {
      throw new Error("disk full");
    };
    const editor = createEditor([paragraph([text("Hello")], { blockId: "p1" })], uploadAsset);
    editor.commands.setTextSelection(3);

    const originalError = console.error;
    const errors: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      expect(drop(editor, { files: [mp4()] })).toBe(true);
      await flushUploads();
    } finally {
      console.error = originalError;
    }

    expect(videoNodes(editor)).toEqual([]);
    expect(errors.length).toBe(1);
    // Doc untouched.
    const json = editor.getJSON() as JSONContent;
    expect(json.content?.map((node) => node.type)).toEqual(["docParagraph"]);
  });

  it("is NOT handled without a host uploadAsset (default drop behavior runs)", () => {
    const editor = createEditor([paragraph([text("Hello")], { blockId: "p1" })]);
    editor.commands.setTextSelection(3);

    expect(drop(editor, { files: [mp4()] })).toBe(false);
    expect(videoNodes(editor)).toEqual([]);
  });

  it("non-video files are not handled even with an uploader", () => {
    const uploadAsset: UploadVideoAsset = async () => ({ src: "./assets/videos/never.mp4" });
    const editor = createEditor([paragraph([text("Hello")], { blockId: "p1" })], uploadAsset);
    editor.commands.setTextSelection(3);

    expect(drop(editor, { files: [new File([], "notes.txt", { type: "text/plain" })] })).toBe(
      false,
    );
    expect(videoNodes(editor)).toEqual([]);
  });
});
