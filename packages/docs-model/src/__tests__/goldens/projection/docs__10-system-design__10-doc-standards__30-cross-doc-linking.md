Docs link to docs with typed reference spans — tracked by the backlinks index, held at zero stale, rewritten when targets move — never with raw paths in prose. 

This page states the reference object, which directions links run, and the restraint rules against overlinking.

## Structure

```json
{
  "insert": "structure",
  "attributes": {
    "reference": {
      "kind": "doc",
      "path": "10-system-design/10-doc-standards/10-structure"
    }
  }
}
```
> **L2 (The doc's name):** The span text inlines the target's name — it is the display on both surfaces; the object carries no label.
> **L6 (The lookup key):** The docs path the backlinks index tracks; moving the target rewrites it here.

- **The object is the path**

  - `kind`: `"doc"` plus the target's docs path — nothing else.

  - The backlinks index tracks every reference; `docs links check` holds them at zero stale; moving a doc rewrites its inbound paths.

- **The text is the doc's name**

  - The span text inlines the target's name, so a reference reads as prose on both surfaces.

## The Rule

- **Reference spans, never raw paths**

  - A plain path in prose is invisible to the system and is not a link.

- **One canonical home**

  - Link to the concept's home doc, never into another section's internals.

  - What crosses a boundary is referenced at the boundary.

- **No ancestor links**

  - The tree already provides them: parent docs link down, children do not link up.

- **A link is a claim**

  - It says the reader may need the target for the task at hand.

  - Link the first mention in a doc, not every mention.

  - Decorative links are cut.

- **No mutual deferral**

  - Two docs each pointing at the other for the full explanation means neither owns it.

  - One doc owns the substance; the other references it.

## Why

- **Tracked links cannot rot**

  - A link the system tracks is held at zero stale, so a reader can trust every one they follow.

- **The name is the prose**

  - A reference reads as the target's name mid-sentence — no bracket noise on either surface.

- **A tree for navigation, a web for substance**

  - Parent docs stay the one place navigation happens, so moving through the docs feels the same everywhere.

- **Restraint keeps links meaningful**

  - When every link is a claim of need, a reader can afford to follow them.

  - Docs that link everything rank nothing.

- **One home per concept**

  - Every link points at the concept's one home.
