The reading surface is a single document column with stable page furniture and navigation that keeps context visible. This page defines its measure and spacing, derived title, numbered sidebar, reference peek, and backlinks footer. Per-block presentation remains in Block vocabulary.

## Structure

The living Default in `themes/default/theme.json` defines the document frame below. `packages/docs-workbench/web/src/shell/StyleRail.tsx` exposes the values as CSS variables consumed by `packages/docs-workbench/web/src/pages/DocPage.tsx`.

| Control | Living Default | Effect |
| --- | --- | --- |
| `--style-content-width` | `88ch` | Maximum document-column measure |
| `--style-content-margin` | `0px` | Horizontal content padding |
| `--style-content-top` | `88px` | Top offset before the page title |
| `--style-title-padding` | `50px` | Gap from the page title to the first block |
| `--style-content-bottom` | `300px` | Bottom run-out after the document |

## The Rule

- **One document column**

  - Blocks flow through one centered column capped by `--style-content-width`.

  - Secondary panes are layout siblings. Opening one pushes and reflows the document; it never covers content.

- **Page title**

  - The title is navigation furniture derived from the bundle name: the numeric prefix is removed, hyphens become spaces, Title Case is applied, and domain acronyms are uppercased.

  - It sits one visual step above a block H1.

  - Clicking the title edits the bundle name in place. A committed rename preserves the numeric prefix, runs the move path, rewrites inbound references, follows the new path, and refreshes the sidebar.

- **Numbered navigation**

  - The sidebar walks the numbered bundle tree in the reading order defined by Numbering.

- **Reference peek**

  - A plain doc-reference click opens a right-docked, read-only view of the target.

  - The next reference click, including one inside the peek, replaces the target. Escape closes the peek.

  - Cmd/Ctrl-click and every source reference navigate fully.

  - The peek is a secondary document with the same typography and vertical rhythm as the main page, plus narrower horizontal padding.

- **Backlinks**

  - A plain “Referenced by” footer after the document lists the unique source paths that reference it.

## Why

- **One reading rhythm**

  - The document keeps one measure and typography across its main modes, so changing modes does not redefine the reading surface.

  - The peek reuses that rhythm because it is a secondary document, not a different class of content.

- **Context stays visible**

  - A pushed layout keeps the document visible while a secondary pane is open.

  - A reference peek lets the reader inspect a target without abandoning the source; explicit gestures still choose full navigation.

- **Navigation identity stays synchronized**

  - The page title and sidebar derive from the same bundle name, so there is no separate display label to drift.

  - The move-based rename keeps the displayed identity, storage path, inbound references, and sidebar entry aligned.

The division between tree navigation and substantive reference links is governed by Cross-doc linking.

The plain “Referenced by” footer and its source-path-only presentation have no recorded rationale.
