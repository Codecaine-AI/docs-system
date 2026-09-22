The reading surface is a left-justified full-width page where each top-level block claims its own layout lane, with stable page furniture and navigation that keeps context visible. This page defines its lane measures and spacing, derived title, numbered sidebar, reference peek, and backlinks footer. Per-block presentation remains in Block vocabulary.

## Structure

The living Default theme defines the document frame below.

| Control | Living Default | Effect |
| --- | --- | --- |
| `--style-content-width` | `88ch` | Maximum text-lane measure |
| `--style-content-margin` | `0px` | Horizontal content padding |
| `--style-content-top` | `88px` | Top offset before the page title |
| `--style-title-padding` | `50px` | Gap from the page title to the first block |
| `--style-content-bottom` | `300px` | Bottom run-out after the document |

## The Rule

- **Per-block layout lanes**

  - Each top-level block claims a `text`, `wide`, or `full` lane. The default is the text lane, and every lane is left-justified on the shared content rail unless a per-block theme override explicitly centers it.

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

## PDF Export

The live workbench exposes Export beside the sidebar title. The dialog starts with the current page selected and ZIP of PDFs as the format. Page checkboxes select individual docs. Folder checkboxes select descendants, and Select section includes a parent page with all its descendants.

- Export reads saved pages in sidebar order. A docs page may produce several A4 PDF sheets. The dialog allows 1 to 100 selected docs pages.

- One combined PDF starts each docs page on a new sheet and numbers the whole file continuously. Separate files use a sequence number and the page's final path segment to avoid duplicate download names.

- ZIP entries use the docs-root-relative page path with a .pdf extension. A parent page exports beside the directory containing its children, preserving numbered folder names.

- Print output omits editor controls and uses light colors. Canvas and Sequence sidecars render as static diagrams. Code annotations become text notes. Native disclosures open, and videos become a note referring to the live page.

- Embedded HTML prints without scripts. Images must be available as data or same-origin Docs assets. Missing sidecars, failed resources, oversized requests, and HTML taller than one printable sheet report errors instead of a completed batch.

The dialog shows progress and offers download links after completion. Cancel stops the client batch. A render already accepted by the server can finish before the printer becomes available again. Static website exports do not expose PDF export.

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
