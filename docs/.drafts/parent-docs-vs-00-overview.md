# Parent docs vs. `00-overview`: two shapes for a section with an intro

Status: proposal draft, 2026-07-20. Motivating case: the canvas repo's
`docs/30-agent-layout/` (three sections, each an intro plus 7–11 piece docs).

## The two shapes

The tree walker (`packages/docs-server/src/docs-tree.ts`) supports both today.

**Shape A — folder + `00-overview` (the current convention).** A plain
directory holds a `00-overview/doc.json` and sibling piece bundles:

```
10-language/            kind: dir      ← not clickable, just a label
  00-overview/          kind: bundle   ← the intro lives here
  10-row-and-col/       kind: bundle
  20-section/           kind: bundle
```

This is what every existing section does (`10-system-design/00-overview`,
etc.). The folder node in the nav is inert: expanding it is the only thing
it can do, and the intro is one more click down, wearing a name
(`00-overview`) that exists only to sort first.

**Shape B — the parent document IS the folder.** The directory itself is a
bundle whose subdirectories are child bundles ("a bundle can nest other
docs" — an explicit walker capability):

```
10-language/            kind: bundle   ← clickable; the intro IS this doc
  doc.json                             ← the intro content
  10-row-and-col/       kind: bundle
  20-section/           kind: bundle
```

One node in the nav, carrying both the content and the children. Click the
section, read the section.

## Why prefer B

- **Fewer clicks, no filler node.** The `00-overview` entry is pure
  ceremony: a doc named after its position, present only because folders
  can't hold content. In B, the thing you click is the thing you read.
- **Cleaner link API.** "Link to the language section" is
  `30-agent-layout/10-language` — the folder path — instead of
  `30-agent-layout/10-language/00-overview`. Doc-links, backlinks, and the
  hash route all use one canonical path per section.
- **The nav can render it honestly.** A parent doc can show a doc icon (or
  folder-with-page icon) and its real title, instead of a mute folder label
  plus an `00-overview` child.
- **It already works.** The walker, `/api/bundle`, sidecar confinement
  (`assets/canvases/` inside the bundle folder), and validation all handle
  nested bundles today — the canvas repo shipped this shape briefly by
  accident and everything rendered.

## What retiring `00-overview` means

- **Blessing one shape.** Shape B becomes the convention; a directory with
  both a `doc.json` and a `00-overview/` child would be a lint error rather
  than a judgment call.
- **Migration is mechanical.** For each existing section:
  `<section>/00-overview/doc.json` → `<section>/doc.json` (assets move with
  it), doc id drops the `-00-overview` suffix, and doc-links targeting
  `<section>/00-overview` retarget to `<section>`. The canvas repo's
  `30-agent-layout` did this move in the other direction in minutes; back is
  the same cost.
- **Compat window.** `kind:"doc"` references and `#/` routes for
  `<section>/00-overview` paths should resolve to `<section>` during the
  transition so old links don't break.
- **Root case.** A docs root usually has a true top-level overview; that can
  stay a normal bundle (`00-foundation/00-overview` style) or the root
  itself could carry a `doc.json` — same rule applied one level up. Needs a
  decision.

## Open questions

- Does the sidebar render a parent doc as expandable-plus-clickable
  (disclosure chevron separate from the label hit-target)? That's the one
  real UI change: today `bundle` nodes are leaves in practice.
- Do empty sections (folder, no intro yet) stay legal? Presumably yes —
  they're just `kind: dir` until someone writes the parent doc.
- Should `docs-cli` grow a migration/lint command (`docs lint --shape` or
  similar) so the convention is enforced rather than remembered?
