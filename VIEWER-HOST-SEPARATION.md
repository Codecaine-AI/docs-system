# Viewer / Host Separation

**Status:** Decided architecture, not a proposal. This is the boundary between
`packages/docs-viewer` (the embeddable product) and `packages/docs-workbench`
(one host of it). A feature nearly landed in the wrong package because this
boundary was only implicit; this doc makes it explicit.

## The rule

> **If a website embedding the viewer would still want it, it goes in
> `docs-viewer`. If it's about where the app runs or where data comes from,
> it goes in the host.**

Apply this before writing code. Doc-viewing and doc-editing UX — rendering,
the editor, inline references, panels that preview or navigate docs — is the
product, and the product is `docs-viewer`. The workbench is *one* way to run
that product; a website or another app embedding the viewer must get the same
UX without reimplementing any of it.

## Responsibilities

| Package | Owns | Never owns |
|---|---|---|
| [`packages/docs-model`](packages/docs-model) | The `doc.json` schema, block vocabulary, mutation ops, Markdown projection. Pure TypeScript. | React, DOM, I/O of any kind. |
| [`packages/docs-viewer`](packages/docs-viewer) | **All** doc-viewing/editing UX: `DocBlockRenderer` and the block renderers (`src/render`), the TipTap editor (`src/editor`), inline reference chips, the side-peek panel (`src/peek`), annotation/targeting (`src/annotate`), the block library. | HTTP, URLs, routing, persistence. It never knows *where* data comes from or *where* navigation goes. |
| [`packages/docs-workbench`](packages/docs-workbench) | Being a host: the `docs serve`/`docs export` server (`src/`), the `DocsClient` implementation over its API (`web/src/data/client.ts`), URL/hash routing (`web/src/shell/App.tsx`), the app shell — sidebar and StyleRail (`web/src/shell/`), theming dev tools (`web/src/theme`), the save loop, Electron packaging (`electron/`). | Doc-viewing/editing UX. If a feature is about viewing or editing docs, it defaults into `docs-viewer`. |

The workbench should stay **thin**. When a feature lands there, the
host-specific parts should be expressible as `DocsClient` methods or
callbacks/props — everything else belongs in the viewer.

## The seam: `DocsClient`

`docs-viewer` is host-neutral: it performs no HTTP and knows nothing about
routing. Logic crosses the boundary through two channels, both defined in
[`packages/docs-viewer/src/client.tsx`](packages/docs-viewer/src/client.tsx);
appearance crosses as CSS tokens (third heading below):

**Data in — the `DocsClient` interface**, injected via `DocsClientProvider`:

- `getDocsTree(projectId)` — the project docs tree (feeds the `@`-mention /
  reference picker). Every client provides it.
- `acquireDraftLock` / `heartbeatDraftLock` / `releaseDraftLock` — optional;
  read-only clients omit them and the editor skips lock management.
- `getDocBundle(projectId, path)` — optional; resolves a bundle path to
  `{ doc, documentPath? }`, or `null` when no such doc exists. This is what
  lets viewer features load *other* docs (the side-peek panel below) without
  the viewer knowing about any API; the viewer validates the payload before
  rendering. When a client omits it, peek intents downgrade to full
  navigation — reference chips keep working in hosts that never opted in.

**Actions out — callbacks/props.** Anything whose meaning depends on the host
leaves the viewer as a callback. Example: the peek panel's `onNavigate(ref)` —
the workbench answers with a hash change, a website answers with a route push.
The viewer only says "the user asked to go here"; the host decides what that
means.

The same pattern covers canvas: the viewer exposes a `CanvasEmbedComponent`
slot rather than importing a canvas renderer.

**Appearance — CSS custom properties.** Viewer surfaces read theme tokens
with baked-in fallbacks (e.g. `var(--docs-peek-width, min(48rem,45vw))`), so
the viewer looks right with zero host CSS, and a host restyles it by defining
tokens — no props, no imports, no reverse dependency. The workbench does this
for the nine peek/reference tokens (see the worked example below).

A host adopts the viewer by implementing `DocsClient` over whatever data layer
it has. The workbench's implementation lives at
[`packages/docs-workbench/web/src/data/client.ts`](packages/docs-workbench/web/src/data/client.ts)
(over its server/static API); a website could implement the same interface
over static JSON.

## Dependency direction and enforcement

```
docs-workbench  →  docs-viewer  →  docs-model
     (host)          (product)       (pure data)
```

Arrows never reverse. `docs-viewer` must not import from `docs-workbench` —
that would bake one host's choices into the product every other host embeds.
`docs-model` stays React-free so non-UI consumers (CLI, server, agents) can
depend on it.

Enforced by [`import-boundaries.test.ts`](import-boundaries.test.ts) at the
repo root: framework packages never import host-app code, `docs-viewer` never
imports `docs-workbench`, and `docs-model` imports no React/DOM libraries.
`bun run test` runs it; a violation fails CI, not code review.

## Worked example: the side-peek panel

Shipped: click an inline doc reference and a push drawer slides out with that
doc rendered read-only; `Escape` closes; opening while open replaces the
peeked doc; `Cmd/Ctrl`-click requests full navigation instead. Its file
layout is the template for placing future features.

**Is it product or host?** A website embedding the viewer would absolutely
want click-a-reference-to-preview, so every UX piece lives in `docs-viewer`:

- *The chip* ([`src/editor/menus/reference-node.tsx`](packages/docs-viewer/src/editor/menus/reference-node.tsx)):
  quiet gray text with a `FileTextIcon`; hover adds an underline, and a compact
  tooltip quickly shows the referenced file path. Text, underline, icon color,
  icon size, icon spacing, and leading/trailing placement are all theme tokens
  with the original look as fallbacks.
- *The panel* ([`src/peek/`](packages/docs-viewer/src/peek):
  `DocPeekPanel.tsx`, effects in `use-doc-peek.ts`, a pure reducer in
  `peek-state.ts`, tests; exported via the `./doc-peek-panel` subpath and the
  root barrel). A width-animated push drawer mounted as a flex *sibling* of
  the content column — `w-0` closed, `--docs-peek-width` open — so content
  reflows beside it.
- *The wiring between them* never touches the host: the chip dispatches the
  `CustomEvent` `"spectre:doc-reference-navigate"` on `document` with
  `{ ref, intent: "peek" | "navigate" }` — plain click on a doc-kind ref is
  `"peek"`; `Cmd/Ctrl`-click and source-kind refs are `"navigate"` — and the
  panel subscribes itself.

**What can't the viewer do alone?** Three things, and each becomes a seam:

1. *Fetch the referenced doc's content.* The viewer has no HTTP, so this is a
   `DocsClient` method: the optional `getDocBundle(projectId, path)`. The
   workbench implements it over its `getBundle` API call in
   [`web/src/data/client.ts`](packages/docs-workbench/web/src/data/client.ts);
   a static site implements it over exported JSON.
2. *Perform full navigation* (`Cmd/Ctrl`-click, or "Open in full" from the
   panel). "Navigate" means different things per host, so it is a callback:
   `onNavigate(ref)`. The workbench changes the hash
   (`web/src/shell/App.tsx`); a website pushes a route.
3. *Turn asset paths into URLs.* `resolveAssetSrc` is a plain
   `(src) => string` (the workbench passes its `assetUrl` helper). The panel
   canonicalizes the peeked doc's bundle-relative `./assets/...` srcs against
   the peeked bundle path *before* calling it, so the host stays
   bundle-unaware.

Feature in the viewer, three host seams — one data method in, two callbacks
out. The shipped workbench diff proves the rule: it gained a `getDocBundle`
method and one `<DocPeekPanel projectId onNavigate resolveAssetSrc>` mount in
`App.tsx`. No UX code.

**Theming rode the appearance channel.** The panel and chip read nine tokens
(`--docs-peek-width/-duration/-padding`,
`--docs-peek-divider-color/-width/-style`, the three `--docs-ref-*` colors).
The workbench defines all nine in
[`web/src/theme/semantic.css`](packages/docs-workbench/web/src/theme/semantic.css)
(light and dark blocks) and tunes them from StyleRail — "Side peek" on the
Layout tab, "References" on the Theme tab — persisting to
`themes/default/theme.json` `railDefaults` (`peek`/`reference` groups) like
every neighboring knob. Other hosts get the default look from the fallbacks.

## Parity across surfaces

The peek added a second doc surface beside the workbench `DocPage`, and "two
surfaces must look identical" is itself a boundary problem: the shared look
must live viewer-side, or every host re-derives it. The mechanisms:

- **Typography:** `DOC_SURFACE_TYPOGRAPHY_CLASSES`
  ([`src/render/block-classes.ts`](packages/docs-viewer/src/render/block-classes.ts),
  re-exported by the `./doc-block-renderer` entry) is the wrapper class
  string a surface puts around rendered blocks; the workbench `DocPage` (all
  three modes) and `DocPeekPanel` both consume it.
- **Vertical rhythm:** the peek column reuses the host's
  `--style-content-top`/`--style-content-bottom` spacing vars. Horizontal
  padding (`--docs-peek-padding` in place of DocPage's
  `--style-content-margin`) is the single deliberate divergence.
- **Page title:** the pure `docTitleFromPath`/`docSegmentFromTitle` helpers
  moved into the viewer
  ([`src/render/doc-title.ts`](packages/docs-viewer/src/render/doc-title.ts),
  re-exported through the frozen `./bundle-src` entry); the workbench's
  `web/src/lib/doc-title.ts` is now a delegating re-export. `DocPeekPanel`
  renders a read-only `h1.docs-page-title` first in the spacing column — the
  same furniture, from the same derivation, as the full page.

The corollary: when host and viewer must agree on presentation, promote the
shared constant or helper into `docs-viewer` and have the host delegate —
never copy.

## When something genuinely belongs in the workbench

The workbench rightfully owns things no embedding website would want:
loopback serving and static export, hash-based routing itself, the sidebar
and StyleRail app shell, theme dev tools, Electron packaging, and the
auto-save loop wiring. Those are "where the app runs / where data comes
from" — the second half of the rule.
