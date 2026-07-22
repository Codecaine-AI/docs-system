# Using the Workbench

`docs serve` opens the workbench: a two-mode surface over one docs tree.

## Edit Mode (Default)

The page *is* the editor — Notion-style. There is no read mode and no Save
button:

- **Auto-save.** Edits save on a ~1s idle debounce (with a 5s max-wait so

  continuous typing still persists). `Cmd/Ctrl+S` forces an immediate
  flush. Drafts also flush when the window blurs, the tab hides, you switch
  modes, or you navigate to another doc.

- **The header indicator** shows `Saved` / `Saving…` / `Not saved` at all

  times.

- **Undo last save** in the header reverts the most recent saved patch

  (single-use; powered by the server's inverse-op ledger).

- **Live changes.** If another actor (a teammate, an agent) edits the doc

  while your editor is clean, the change applies silently and the affected
  blocks flash. While you have unsaved edits, remote refreshes are
  suppressed — conflicts are handled at save time instead (below).

- **Links.** `Cmd/Ctrl+K` with text selected opens a Notion-style link popover
  (Enter applies, an empty input or the Remove button clears). Pasting a URL
  over selected text wraps the selection in a link instead of replacing it.

- **Video.** Paste or drop a YouTube/Vimeo/Loom URL on an empty line to embed
  it as a video block (there is deliberately no slash-menu entry — video
  blocks come from content). Dropping a video file from disk (`mp4`/`webm`/`mov`/`m4v`, up to 64 MB) uploads it into the bundle's `assets/videos/` and inserts
  the block once the upload lands.

### Conflicts

Two layers, both server-enforced:

- **Stale hash (409).** Every save carries the doc hash it was based on. If

  the doc changed underneath you, the save is rejected, your draft is kept
  in the editor, a banner offers "Reload doc", and auto-save pauses until
  you reload.

- **Draft lock (423).** Going dirty acquires a best-effort TTL lock

  (heartbeat-renewed). If another session already holds it, a banner says
  so and saving pauses until the lock frees (the heartbeat notices
  automatically).

## Annotate Mode

For pointing at things and leaving structured feedback — the mode an agent
conversation lives in ("do this, do this, do this"):

- hover any block for an outline + block-type chip; click to select it;

- canvas objects inside embedded canvases are selectable the same way;

- compose an annotation (with an intent) in the side pane; resolve from the

  list; dangling targets (block deleted since) are detected and labeled.

Annotations live in the bundle's `annotations.json` sidecar with the same
hash-precondition write path as doc edits.

## Block Catalog

The block catalog lives in the corpus, not the workbench: the per-type reference pages under block vocabulary cover every block type, each with live examples and its doc.json shape.

## Static Export

`docs export` produces the same UI with everything mutable removed: no mode
switcher, no editor, no annotations pane, no SSE — a plain read-only site that
works from any static host or subpath.
