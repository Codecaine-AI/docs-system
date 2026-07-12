"use client";

import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { parseVideoEmbed } from "../../components/rich-text/VideoDocsBlock";

/**
 * Video blocks appear FROM CONTENT — there is deliberately no slash-menu
 * entry. Two authoring paths, both landing a `docVideo` atom node:
 *
 * 1. Paste/drop a provider URL (YouTube/Vimeo/Loom, per `parseVideoEmbed`):
 *    - paste at a COLLAPSED cursor inside a plain text block: the URL becomes
 *      a video block — replacing the block when the line is empty (Notion's
 *      paste-an-embed on an empty line), inserted as a sibling right after it
 *      otherwise. The paste entry point is link-editor.tsx's handlePaste
 *      (its plugin is the one already positioned ahead of TipTap Link's
 *      unconditional paste rule): its collapsed-cursor branch calls
 *      `handleVideoUrlPaste` FIRST and only falls back to the plain-text
 *      insert when this module declines. A provider URL pasted over a
 *      NON-empty selection never reaches here — link-editor's over-selection
 *      branch wraps it in a link mark, unchanged.
 *    - drop (text/uri-list or single-URL plain text): same insertion at the
 *      drop position, via this module's `handleDrop` plugin.
 *
 * 2. Drop a video FILE from disk (mp4/webm/mov/m4v or `video/*`): uploaded
 *    through the HOST-provided `uploadAsset` slot (threaded from DocEditor's
 *    prop the same way renderCanvas/resolveAssetSrc flow in — except plugins
 *    can't read React context, so the option is a getter closing over a ref),
 *    then a `docVideo` atom with `blockProps.src` is inserted at the drop
 *    position once the upload resolves. Uploads run sequentially; a failed
 *    upload logs and inserts NOTHING (the doc is never corrupted by a
 *    half-finished drop). Without `uploadAsset` the drop is not handled —
 *    default browser/PM behavior runs.
 *
 * Everything here declines gracefully (returns false/null) when the schema
 * has no `docVideo` node, so link-editor stays usable in harnesses that only
 * register the text-block schema.
 */

export type UploadVideoAsset = (file: File) => Promise<{ src: string }>;

export type VideoDropOptions = {
  /**
   * Getter (not a plain value): DocEditor's extension list is built once, but
   * the host's `uploadAsset` prop identity may change per render — the getter
   * reads a ref that always holds the latest.
   */
  getUploadAsset: () => UploadVideoAsset | undefined;
};

export const videoDropPluginKey = new PluginKey("docVideoDrop");

const VIDEO_FILE_EXT = /\.(mp4|webm|mov|m4v)$/i;

/** A droppable video file: `video/*` MIME, or a known video extension when the OS reported no type. */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || VIDEO_FILE_EXT.test(file.name);
}

/**
 * Inserts a `docVideo` atom carrying `blockProps` at `pos`, following the
 * slash menu's insertion semantics (SlashMenu.tsx's `insertBlockOfType`):
 *
 * - `pos` inside an EMPTY text block (empty `docBlockText` wrapper, no nested
 *   children) → the block is REPLACED by the video;
 * - `pos` inside a non-empty text block → the video is inserted as a true
 *   sibling right after that block (never nested into its `block*` slot);
 * - `pos` in any other textblock (code) → after that block;
 * - `pos` between blocks (drop gaps, or right after a just-inserted video) →
 *   inserted at `pos` directly.
 *
 * Id convention: `blockId: null`, exactly like the slash menu's insertions —
 * the save path (`pmToDoc`'s idFactory) mints the persistent block id.
 *
 * Returns the position just after the inserted node (the next insertion point
 * for a multi-file drop), or null when the schema has no `docVideo` or the
 * insert doesn't fit.
 */
export function insertVideoBlockAt(
  view: EditorView,
  blockProps: Record<string, unknown>,
  pos: number,
): number | null {
  const { state } = view;
  const nodeType = state.schema.nodes.docVideo;
  if (!nodeType) return null;
  const node = nodeType.create({ blockId: null, blockProps });
  const $pos = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)));
  const tr = state.tr;
  let insertPos: number;
  try {
    if ($pos.parent.type.name === "docBlockText" && $pos.depth >= 2) {
      const blockDepth = $pos.depth - 1;
      const block = $pos.node(blockDepth);
      const emptied = $pos.parent.content.size === 0 && block.childCount === 1;
      if (emptied) {
        insertPos = $pos.before(blockDepth);
        tr.replaceWith(insertPos, $pos.after(blockDepth), node);
      } else {
        insertPos = $pos.after(blockDepth);
        tr.insert(insertPos, node);
      }
    } else if ($pos.parent.isTextblock && $pos.depth >= 1) {
      // Flat textblock (docCodeBlock): a block node can't go inside `text*`.
      insertPos = $pos.after($pos.depth);
      tr.insert(insertPos, node);
    } else {
      insertPos = $pos.pos;
      tr.insert(insertPos, node);
    }
    // Select the freshly inserted atom (it's `selectable`) — visible feedback
    // that the paste/drop landed, and Backspace immediately removes it.
    tr.setSelection(NodeSelection.create(tr.doc, insertPos));
  } catch {
    // Position didn't admit a block insert — decline, caller falls back.
    return null;
  }
  view.dispatch(tr.scrollIntoView());
  return insertPos + node.nodeSize;
}

/**
 * Collapsed-cursor paste of a single provider URL → video block. Called from
 * link-editor.tsx's handlePaste BEFORE its plain-text fallback. Returns false
 * (caller inserts plain text) unless the schema has `docVideo`, the URL is a
 * known provider's, and the cursor sits in a wrapped text block.
 */
export function handleVideoUrlPaste(view: EditorView, url: string): boolean {
  const { state } = view;
  if (!state.schema.nodes.docVideo) return false;
  const { selection } = state;
  if (!selection.empty || !(selection instanceof TextSelection)) return false;
  if (selection.$from.parent.type.name !== "docBlockText") return false;
  if (!parseVideoEmbed(url)) return false;
  return insertVideoBlockAt(view, { url }, selection.from) !== null;
}

/**
 * The single URL a drop's dataTransfer carries, or null. `text/uri-list`
 * (comment lines stripped) wins over plain text; multiple URLs or prose
 * containing a URL never match.
 */
function singleUrlFromDataTransfer(dataTransfer: DataTransfer): string | null {
  const uriList = dataTransfer.getData("text/uri-list");
  if (uriList) {
    const lines = uriList
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
    return lines.length === 1 ? lines[0] : null;
  }
  const text = dataTransfer.getData("text/plain")?.trim() ?? "";
  return text.length > 0 && !/\s/.test(text) ? text : null;
}

/** Doc position for a drop event — posAtCoords when the view can compute it (real browsers), else the current selection (happy-dom tests). */
function dropPosition(view: EditorView, event: DragEvent): number {
  try {
    const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (coords) return coords.pos;
  } catch {
    // happy-dom can't compute PM coords — fall through.
  }
  return view.state.selection.from;
}

/**
 * Sequential upload+insert for a multi-file drop. Per file: upload, then
 * insert at the tracked position (clamped to the live doc — edits may land
 * while an upload is in flight). A rejected upload logs and skips its insert;
 * later files still proceed.
 */
async function uploadAndInsertVideos(
  view: EditorView,
  files: File[],
  pos: number,
  uploadAsset: UploadVideoAsset,
): Promise<void> {
  let insertAt = pos;
  for (const file of files) {
    try {
      const { src } = await uploadAsset(file);
      if (view.isDestroyed) return;
      const end = insertVideoBlockAt(view, { src }, insertAt);
      if (end !== null) insertAt = end;
    } catch (error) {
      console.error(`Video upload failed for ${file.name}; nothing was inserted:`, error);
    }
  }
}

/**
 * Editor drop handling for both video paths (see module doc). Registered by
 * DocEditor with a `getUploadAsset` reading the host's `uploadAsset` prop.
 */
export const VideoDropHandler = Extension.create<VideoDropOptions>({
  name: "docVideoDrop",

  addOptions() {
    return { getUploadAsset: () => undefined };
  },

  addProseMirrorPlugins() {
    const getUploadAsset = this.options.getUploadAsset;
    return [
      new Plugin({
        key: videoDropPluginKey,
        props: {
          handleDrop(view, event, _slice, moved) {
            // Internal drags (moving an existing node) keep PM's default.
            if (moved) return false;
            const dataTransfer = event.dataTransfer;
            if (!dataTransfer || !view.state.schema.nodes.docVideo) return false;

            const files = Array.from(dataTransfer.files ?? []).filter(isVideoFile);
            if (files.length > 0) {
              const uploadAsset = getUploadAsset();
              // No host uploader → not ours to handle (default drop runs).
              if (!uploadAsset) return false;
              event.preventDefault();
              const pos = dropPosition(view, event);
              void uploadAndInsertVideos(view, files, pos, uploadAsset);
              return true;
            }

            const url = singleUrlFromDataTransfer(dataTransfer);
            if (!url || !parseVideoEmbed(url)) return false;
            const pos = dropPosition(view, event);
            if (insertVideoBlockAt(view, { url }, pos) === null) return false;
            event.preventDefault();
            return true;
          },
        },
      }),
    ];
  },
});
