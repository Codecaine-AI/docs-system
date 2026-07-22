The spatial-canvas family of the Block vocabulary. It owns one type, `canvas`. The block itself is only a reference — the canvas document, its objects, and its schema live in the external canvas system (`external/canvas`, the vendored sibling project); the doc block points at one canvas and optionally crops it to a named view.

The family is the vocabulary's flagship non-default Agent adapter case: the canvas project is the authority, schema truth stays in the canvas package, and every content action forwards there instead of patching doc props.

## State Schema

The props (`state.ts`) are a closed schema — `additionalProperties: false`, every prop optional:

| prop | type | required | notes |
| --- | --- | --- | --- |
| canvasId | string (min length 1) | no | Central canvas identity in the canvas system; the docs server cannot route it, so embeds render an unavailable card. |
| src | string (min length 1) | no | Sidecar path — a .canvas.json in the docs tree, resolved relative to the doc bundle; the form the server loads and edits. |
| view | string | no | Named container or section to crop the viewer to. |
| title | string | no | Display title; overrides the canvas document's own title in the embed. |

No text (`carriesText: false`); all state lives in the four props. A block with neither source prop is valid — the doc renderer shows a missing-source placeholder.

The corpus's one live embed, on Translation layer, carries:

```json
{
  "src": "./assets/canvases/interaction-surfaces.canvas.json",
  "view": "one-state-two-readers",
  "title": "One state, two readers"
}
```
> **L2 (Sidecar reference):** Bundle-relative path; the renderer canonicalizes it against the bundle's own assets copy before loading.
> **L3 (View crop):** Stable id of the section the inline viewer fits to.
> **L4 (Title override):** Replaces the canvas document's own title in the embed.

## Typed Actions

The family's five actions are lifted at module load from `CANVAS_AGENT_PATCH_OPERATIONS` in `@codecaine-ai/canvas/agent-schema` — docs-model reuses the canvas package's schemas and descriptions, and never redefines them.

- `lift.ts`

  - Maps each descriptor to a `canvas.<type>` action on the `canvas` block type.

  - `Type.Omit(descriptor.params, ["type"])` strips only the wire envelope's discriminant; every param schema is otherwise the canvas package's own.

  - Attaches `forward: { authority: "canvas" }` in place of a local `apply`.

- No local apply

  - The dispatcher validates params against the lifted TypeBox schema, then refuses to run the action as a doc op — it is handled by the canvas authority (`doc-ops.ts`). Doc props never change.

**canvas — forwarded patch operations**

```
canvas.addObject(object: CanvasObject) -> forwarded to the canvas authority  # Add a fully specified canvas object at its provided geometry; a section requires a nonblank title and known tint.
canvas.updateObject(objectId: string, patch: object) -> forwarded to the canvas authority  # Update an existing canvas object by ID, shallow-merging fields and deep-merging style fields; a resulting section requires a nonblank title and known tint.
canvas.addConnection(connection: CanvasConnection) -> forwarded to the canvas authority  # Add a canvas connection with explicit endpoint object IDs and optional routing metadata.
canvas.addAnnotation(annotation: CanvasAnnotation) -> forwarded to the canvas authority  # Add an annotation targeting a canvas object, connection, or region.
canvas.fitContainerToChildren(containerId: string, padding?: number) -> forwarded to the canvas authority  # Resize a container to enclose its current child objects with optional padding.
```

## Doc Renderer

docs-viewer owns the descriptor (`descriptor.tsx`) but not the pixels: the render calls the host-injected canvas slot — DocsClientProvider's `canvasEmbed` component — with `{ id, canvasId, src, view, title }`. A host with no canvas renderer gets the neutral Canvas embed unavailable card, so the seam ports to any React host.

The workbench wires `StandaloneCanvasEmbed` (`CanvasEmbed.tsx`) into the slot — a read-only embed:

- Inline surface

  - An inert `InteractiveCanvasViewer` renders the real canvas; drag, pan, and wheel zoom are not captured.

  - `view` fits the viewport to the named container or section's bounds; an unknown id shows a View not found notice.

  - A host that passes `onObjectSelect` keeps the inline viewer interactive instead, so canvas objects stay selectable for annotation targeting.

- Overlay controls

  - Hover or keyboard focus reveals a full-screen button in the top-right corner.

  - Edit in Canvas appears beside it only when the host passes `showEditAction` — doc edit mode does.

- Full-screen viewer

  - Clicking the inline surface or the button opens a same-window dialog with an interactive viewer; pan and zoom live here, canvas mutation does not.

  - Escape or the close action restores the surrounding document in place; body scroll locks while it is open.

- Editor handoff

  - Edit in Canvas opens Canvas Studio in a new tab, deep-linked to the sidecar (`?src=<sidecar>`), so changing the canvas never discards the reader's document position or unsaved doc state.

- Source resolution

  - `src` loads a `.canvas.json` sidecar through the canvas data layer and validates it with `validateInteractiveCanvasDocument` before rendering.

  - `canvasId: "synthetic"` renders the canvas package's bundled fixture.

  - Any other `canvasId` renders an honest unavailable card with an Open Canvas Studio link — central boards are not stored in the docs repo.

In the editor — slash menu: **Canvas** (aliases: diagram, drawing). The block is a non-editable atom leaf: its node view rebuilds the `DocBlock` and calls the same descriptor render the read surface uses (`node-views.tsx`), so the block looks identical in view and edit mode; edit mode's embed adds the Edit in Canvas action.

## Agent Renderer

The agent view is one HTML-comment reference line — `<!-- canvas: <src-or-canvasId> [view=<view>] [title="<title>"] -->`, or `<!-- canvas: (missing src) -->` when neither source prop is set; `src` wins when both are present (`agent-view.ts`). Chosen over a markdown image because a canvas is not an image asset; the comment form greps cleanly on `<!-- canvas:` without being misread as a broken image link.

## Theme

The theme surface is one registered token: `components/canvas.json` in a theme folder (`themes/<id>/`) may set `border`, as one string for both modes or a `{ light, dark }` pair, validated against `THEME_TOKEN_REGISTRY` (see Theming: overview).

| Key | CSS variable | Styles |
| --- | --- | --- |
| border | --docs-canvas-border | Missing-embed placeholder border |

The token's CSS default is `var(--border)` (`semantic.css`), and its one consumer is the doc renderer's missing-embed placeholder. The embedded canvas surface styles itself — the canvas package owns its own theme — and no built-in theme ships a `components/canvas.json` (`themes/default` carries code, structured-table, and surfaces files only).

## Agent Adapter

How agents edit canvas content — the vocabulary's flagship non-default instance of the Agent adapter contract. The external canvas project is the authority: the docs system forwards actions to it and applies nothing locally. The forwarding path exists end to end:

- One action per request

  - `POST /api/ops` accepts a forwarded action only as a single-op batch; mixing one with doc ops is a 400 (`routes.ts`).

- `forwardCanvasAction`

  - Loads the doc bundle, checks the doc hash, confirms the target block is a `canvas`, and validates params against the lifted schema.

  - Resolves the block's `src` to a sidecar path under the same doc-directory confinement rules as canvas reads.

  - A `canvasId`-only block fails: “Central canvas references are not routable by this server yet; only sidecar canvases are supported.”

- `canvas_apply_patch`

  - The canvas-side counterpart of doc ops with the same mutation contract: hash precondition, draft-lock check, apply, revalidate with `validateInteractiveCanvasDocument`, atomic persist, inverse snapshot for undo.

  - `updateObject` shallow-merges fields and deep-merges `style`, mirroring the canvas client reducer.

- Division of labor

  - Reference props (`canvasId`, `src`, `view`, `title`) patch through the generic `updateBlock`; canvas content only moves through the forwarded `canvas.*` actions.

  - `"canvas"` is one of two entries in the model's `KNOWN_AUTHORITIES` list, beside `"sequence"`.

- Target design

  - Per the contract's settled design, canvas declares an annotation-processing agent of its own, with a context loader that assembles the canvas file and a router that discovers the agent from the registry.

  - That adapter is not wired in this repo; the forwarded action path above is the piece that exists.
