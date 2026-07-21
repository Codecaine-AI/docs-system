The spatial-canvas block of the block vocabulary. The block itself is only a reference — the canvas document, its objects, and its schema live in the external canvas system (`external/canvas`, the vendored sibling project); the doc block points at one and optionally crops it to a named view.

## State

| prop | type | required | notes |
| --- | --- | --- | --- |
| canvasId | string (min length 1) | no | Canvas identity in the canvas system. |
| src | string (min length 1) | no | Legacy reference form; still accepted and used by the markdown render. |
| view | string | no | Named view crop within the canvas. |
| title | string | no | Display title. |

No text (`carriesText: false`).

## Markdown render

An HTML-comment reference line — `<!-- canvas: <src-or-canvasId> [view=<view>] [title="<title>"] -->`, or `<!-- canvas: (missing source) -->` when no source is set. Chosen over a markdown image because a canvas is not an image asset; the comment form greps cleanly on `<!-- canvas:` without being misread as a broken image link.

## Typed actions (forwarded)

Five actions are lifted at module load from `CANVAS_AGENT_PATCH_OPERATIONS` in `@codecaine-ai/canvas/agent-schema` — schema truth stays in the canvas package. They carry `forward: { authority: "canvas" }` instead of a local `apply`: the dispatcher validates params against the lifted TypeBox schema, then the server forwards the operation to the canvas authority rather than patching doc props.

**canvas — forwarded patch operations**

```
canvas.addObject(object: CanvasObject) -> forwarded to the canvas authority  # Add a fully specified canvas object at its provided geometry; a section requires a nonblank title and known tint.
canvas.updateObject(objectId: string, patch: object) -> forwarded to the canvas authority  # Update an existing canvas object by ID, shallow-merging fields and deep-merging style fields; a resulting section requires a nonblank title and known tint.
canvas.addConnection(connection: CanvasConnection) -> forwarded to the canvas authority  # Add a canvas connection with explicit endpoint object IDs and optional routing metadata.
canvas.addAnnotation(annotation: CanvasAnnotation) -> forwarded to the canvas authority  # Add an annotation targeting a canvas object, connection, or region.
canvas.fitContainerToChildren(containerId: string, padding?: number) -> forwarded to the canvas authority  # Resize a container to enclose its current child objects with optional padding.
```

## In the editor

Slash menu: **Canvas** (aliases: diagram, drawing). The block stays a non-editable atom leaf in ProseMirror. Its inline surface is a static section preview, and doc edit mode may add an Edit in Canvas Studio action that opens the dedicated canvas editor rather than making the doc block itself mutable.

## Host rendering contract

- Inline preview. The normal doc layout renders a deterministic SVG from the canvas preview endpoint. `view` maps to the stable canvas section id, so the card shows that section as its main render. The inline surface does not capture drag, pan, or wheel zoom.

- Expanded viewer. A top-right full-screen action opens a same-window overlay containing the dedicated read-only embed route. Pan, wheel zoom, Fit, and +/− belong here; canvas mutation does not. Escape or the close action restores the surrounding document at the same place.

- Editor handoff. The Edit in Canvas Studio affordance appears only in an authoring context. It opens separately—a new browser tab, or the system browser from Electron—so changing the canvas does not discard the reader's document position or unsaved doc state.

- Portable host seam. `docs-viewer` supplies the canvas block slot; the host supplies its presentation. The workbench implementation pairs `/api/canvases/:id/preview.svg?section=<view>` inline with `/embed/:id?view=<view>` after expansion. Other React or webpage hosts can reproduce that same progression without importing the docs workbench.

## Agent notes

- Doc-side props (`canvasId`, `view`, `title`) patch via `updateBlock`; canvas content changes go through the forwarded `canvas.*` actions.

- The canvas component is the only bundle using the `forward` action shape — `"canvas"` is the single entry in the model's known-authorities list.

## Theming

This block's theme file is `components/canvas.json` in a theme folder (`themes/<id>/`; see 20-implementation/40-theming). Every value is one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY`.

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-canvas-border | Embed container border |
