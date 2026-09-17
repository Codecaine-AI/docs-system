# The Save Pipeline: Keystroke to Disk

The full path from a keystroke to bytes on disk — worth knowing when
debugging save failures, and a good map of how docs-viewer, docs-workbench,
and docs-server cooperate.

This page is the wiring view. For the stored `doc.json` shape, see the data model — doc.json shapes; for the op semantics, inverses, and undo contract, see the mutation model — ops, inverses, undo.

## 1. Editing (docs-viewer)

`DocEditor` in `packages/docs-viewer/src/editor/DocEditor.tsx` hosts a TipTap/ProseMirror editor whose node schema in `packages/docs-viewer/src/editor/core/schema.ts` mirrors the doc.json block types one-to-one. Every ProseMirror node carries the block's stable id in its attrs, so a block edited in place keeps its identity — that is what lets the diff below emit a single `updateBlock` instead of a delete + insert pair.

## 2. Diff to Ops (docs-viewer → docs-model)

On save (debounce fire, `Cmd+S`, blur, or unmount), the editor calls `pmToDoc`/`diffToOps` in `packages/docs-viewer/src/editor/core/convert.ts`: the current ProseMirror JSON becomes a `DocDocument` and is diffed against `baseDocRef.current` into a `DocOp[]` batch. The diff is a small batch of the model's six generic structural/text ops; the vocabulary's seventh op, `componentAction`, is the typed-action bridge for agents and lives in the mutation model — ops, inverses, undo; the editor's diff never emits it. A no-op edit diffs to zero ops and no request is sent.

The workbench surfaces the loop as a header indicator in `packages/docs-workbench/web/src/pages/DocPage.tsx`: `DocEditor` reports through `onSaveStateChange`, `DocPage` writes `data-docs-save-state`, and the rendered buckets are idle (`Not saved` while work is dirty), saving (`Saving...`), saved (`Saved`), and error (`Not saved` with the conflict message nearby).

## 3. POST /api/ops (docs-workbench → docs-server)

The op batch is posted by `handleApplyOps` in `DocPage` through `applyDocOps` in `packages/docs-workbench/web/src/data/api.ts` to `/api/ops` in `packages/docs-server/src/routes.ts` with two guards:

- `expected_hash` — the content hash of the doc the diff was computed

  against. `applyDocOpsToBundle` in `packages/docs-server/src/doc-ops.ts` returns `409` on mismatch, and nothing is written.

- `session_id` — the tab's identity from `getSessionId`, checked against the draft lock and

  used to filter self-echoes out of the SSE stream.

From the client side, `409` and `423` pause the save instead of clobbering: `DocPage.handleApplyOps` returns an error result, `DocEditor` leaves the ProseMirror draft intact, and debounce/unmount flushes hold while the stale hash or foreign draft lock is known. The client policy follows the mutation model — ops, inverses, undo.

On success the server applies the ops atomically (`applyDocOpsToBundle`: per-path mutex, temp-then-rename), stores the inverse ops in the undo ledger under a `patch_id`, broadcasts an SSE change event with the changed block ids, and returns the new doc + hash.

## 4. Reconciliation (Back in the Editor)

The editor adopts the server's returned doc as the next diff baseline. The host feeds that same object back down as the `document` prop, and the editor recognizes the identity and *skips* re-seeding its content — this is why a save never resets your cursor. If keystrokes landed while the save was in flight, the doc simply stays dirty and the next debounce saves the remainder against the new baseline.

## Change Flashes and ProseMirror Ownership

When an SSE event flashes changed blocks, the read surfaces get a `data-docs-changed` attribute set on the block's wrapper element. Inside the editor that approach cannot work: ProseMirror owns the contenteditable DOM and strips foreign attribute mutations as drift. The editor therefore renders the flash as a ProseMirror **node decoration** from `packages/docs-viewer/src/editor/decorations/changed-flash.ts` driven by the same highlighted-id set — same CSS animation, different mechanism.

## Upload Route: Video Assets

One upload route sits beside `/api/ops`: dropping a video file in the editor calls `handleUploadAsset` in `DocPage`, then `uploadVideoAsset` POSTs it (multipart) to `POST /api/assets/video` — a strict route backed by `uploadDocVideoAsset` with a 64 MB cap, an extension/MIME allowlist (`mp4`/`webm`/`mov`/`m4v`, `video/*`), and collision-suffixed filenames under the bundle's `assets/videos/` — and only inserts the video block (whose `props.src` points at the stored file) once the upload resolves. A failed upload inserts nothing.
