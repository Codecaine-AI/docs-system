# docs-viewer — rendering and editing

@codecaine-ai/docs-viewer is the browser-only React layer for rendering, editing, and precisely targeting doc.json bundles. It turns docs-model data into interactive UI while leaving storage, transport, and application composition to the host.

## What it owns

- Read-only projection. `DocBlockRenderer` in `packages/docs-viewer/src/render/DocBlockRenderer.tsx` walks a bundle from its root and delegates every block to `packages/docs-viewer/src/render/block-registry.ts`. The registry maps exactly the fourteen canonical types to one descriptor each; those types are defined by the block vocabulary.

- Component adapters. The seven folders under `packages/docs-viewer/src/components/<name>/` are `rich-text`, `code`, `structured-table`, `file-tree`, `interaction-surface`, `mermaid`, and `canvas`. Each supplies a descriptor module and `editor-nodes.ts`, mirroring docs-model's component bundles one-to-one. `packages/docs-viewer/src/__tests__/component-mirror.test.ts` enforces that the model bundles and viewer folders stay in lockstep.

- Block editing. The TipTap-based `DocEditor` lives at `packages/docs-viewer/src/editor/DocEditor.tsx`. It composes the slash menu, Markdown input rules, reference chips, link authoring in `packages/docs-viewer/src/editor/menus/link-editor.tsx`, video paste/drop in `packages/docs-viewer/src/editor/input/video-embed.ts`, and opt-in Notion-style auto-save. Video files upload through the host's `uploadAsset` slot.

- Precise targeting and comments. `DocTargetingLayer` in `packages/docs-viewer/src/annotate/doc-targeting-layer.tsx` provides the hover outline, block-type chip, and pinpoint click used by humans and agents to identify one block specifically. `packages/docs-viewer/src/annotate/Plannotator.tsx` provides Plannotator-style comment composition while leaving persistence callbacks to the host.

- Host integration. `DocsClientProvider` in `packages/docs-viewer/src/client.tsx` is the seam for injecting the host's API client and canvas-embed component. Viewer components never talk to a server directly.

## Why it is its own package

> **Forcing constraint: Browser purity in both directions** — docs-model must stay React-free, so the React renderer and editor cannot live there; `import-boundaries.test.ts` enforces that side. docs-viewer depends on the model but not on SQLite, `fs`, Elysia, or any server or storage package, so it remains liftable into any host React app. This boundary is forced, not a judgment call.

The split protects both reuse targets at once: the model package stays free of browser code, and the viewer stays free of persistence and server code. The package overview shows this boundary in the seven-package split.

## Dependencies

- Workspace upstream: `@codecaine-ai/docs-model` is the only workspace package dependency. There is no dependency on `@codecaine-ai/docs-index`, `@codecaine-ai/docs-server`, or `@codecaine-ai/docs-workbench`.

- Browser ecosystem: React and React DOM are peer dependencies. Rendering and editing use `@tiptap/*`, `radix-ui`, `mermaid`, `highlight.js`, `@floating-ui/react`, `lucide-react`, `react-markdown`, `remark-gfm`, `rehype-highlight`, `clsx`, `class-variance-authority`, and `tailwind-merge`.

- Workspace downstream: docs-workbench depends on docs-viewer and wraps it in the SPA.

## Using it alone

In another React application, wrap the viewer surfaces with `DocsClientProvider` and supply that host's API client plus a canvas-embed component when the document needs one. Pass a bundle to `DocBlockRenderer` for read-only rendering.

Mount `DocEditor` when the host needs editing. The host supplies the apply/save callback and, for local video files, the `uploadAsset` function; docs-viewer owns the editing interaction but not the endpoint or storage implementation.

This embeds bundle rendering and editing without adopting docs-server or the workbench implementation. The host remains responsible for its own API and application shell.
