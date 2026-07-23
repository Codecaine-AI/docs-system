Canvas and media define how visual artifacts sit in the document's reading flow. A canvas is inert and image-like inline, then expands into an in-app viewer when a reader chooses to explore; video and image keep medium-specific behavior. Their block-vocabulary pages own state schemas, actions, and agent renderers; this page owns the surrounding presentation and interaction contract.

## Structure

One board file stays authoritative across three rendered surfaces:

- **Canonical board file**

  - A bundle-local canvas sidecar in the docs repo remains the source of truth for reading and editing.

- **Inline preview**

  - The selected view renders as a static figure in the document flow; clicking it requests exploration.

- **Full-Screen Viewer**

  - A same-window dialog opens the same board and view as an explorable pan-and-zoom surface.

- **Canvas Studio**

  - The authoring handoff opens the same sidecar in a new Studio tab.

Images and videos stay in the document instead of passing through the canvas viewer:

- **Video**

  - Known providers supply their player, local files use native playback, and other URLs remain links.

- **Image**

  - One picture and its optional caption render as a simple figure.

## The Rule

- **Canvas stays image-like inline**

  - The inline rendered diagram is inert. It does not expose object focus or capture object clicks, drag, pan, or zoom; the whole surface opens the viewer.

  - The selected view determines the natural aspect ratio, clamped from 6:16 portrait through 4:1 wide, with a 200px minimum height. A forced letterbox is not part of the surface.

  - The inline diagram has no header, badge, board id, card, or wrapper title chip. The document host supplies one border around the bare diagram.

  - Annotation targeting is the one inline-interactivity exception. Object clicks remain live only while the reader is choosing a canvas target; the separate maximize action stays available.

- **Expanded canvas is an in-app exploration surface**

  - The initial viewport fits the same named view crop the reader opened inline.

  - Plain drag and wheel pan. Pinch or a modified wheel gesture zooms. Zoom-out, zoom-level-to-100%, and zoom-in controls remain over the diagram.

  - The dialog owns the only header; the viewer remains a bare diagram surface. Canvas preview and exploration never nest Studio or another canvas application in an iframe.

  - Escape or the close action returns to the same place in the document.

- **The docs repo owns the board file**

  - The canvas block references a bundle-local sidecar. Studio reads and writes that same file; it does not copy the board into local draft storage.

  - In doc edit mode, Edit in Canvas opens Studio in a new browser tab, deep-linked to the sidecar.

  - Studio saves with the content hash it loaded. A stale hash refuses the write and asks the author to reload.

- **Video follows the source**

  - YouTube, Vimeo, and Loom URLs use their provider players. A bundle-local file uses native playback controls.

  - An unrecognized URL renders as a link card instead of embedding an arbitrary origin.

  - A provider URL pasted at a collapsed cursor replaces an empty text block or inserts a true sibling after non-empty text. Pasting over selected text keeps ordinary link behavior.

- **Image stays a simple atom**

  - The atom carries `src` plus optional `alt` and `caption`. It renders the image and caption without a media viewer.

  - The editor treats the block as an atom and provides no in-place props surface.

> **Open call: Fullscreen Image Viewing** — The canvas viewer contract does not imply a general image lightbox. Click-to-fullscreen image viewing has no settled interaction design.

## Why

- **Reading stays reading**

  - An inline canvas supports recognition and explanation without placing a nested application in the reading surface.

- **Exploration is an explicit transition**

  - A same-window viewer preserves scroll position for inspection. Studio opens separately because editing is a longer-lived task and the document remains useful for comparison.

- **Hosts own framing**

  - A framing-free diagram viewer serves inline reading, full-screen exploration, and annotation targeting without carrying context-specific furniture into every host.

- **One canonical file prevents drift**

  - Docs and Studio read the same sidecar, while the hash precondition refuses an edit based on stale bytes.

- **Media keeps its native affordances**

  - Provider players, native local playback, safe link fallback, and a simple image figure match the source instead of forcing every visual artifact through canvas.
