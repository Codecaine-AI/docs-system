Documentation does not stop at the doc tree. 

Below the doc tree it continues into the source in three units

- File headers

- Function docstrings

- Inline comments 

Finishing the descent the depth ladder starts: section, doc, file, function, code.

## Structure

```typescript
// packages/docs-viewer/src/render/doc-title.ts
/**
 * The fixed page title shown above every doc: derived from the SAME name
 * the sidebar shows — the bundle folder's last segment — so the page and
 * the tree read as one thing. Pure string logic, no React.
 */

/** Words that stay lowercase mid-title (first and last word always cap). */
const MINOR_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", …]);
```
> **L2-6 (L4 — the file's contract):** What the file owns and why it lives here, before any code scrolls past.
> **L8 (L5 — the function's contract):** A docstring on everything non-obvious: purpose, inputs, outputs, side effects, errors.

No unit carries doc links: code linking is one-way, and the source stays ignorant of the docs.

## The Rule

- **File header**

  - The top of a source file states the file's contract: responsibilities, dependencies, invariants. 

  - A reader knows what the file holds before any code scrolls past. 

  - Kept under 50 lines.

- **Function docstrings**

  - A non-obvious function states its contract: purpose, inputs, outputs, side effects, errors.

- **Inline comments**

  - Explain the why of a non-obvious move as the code goes, never restating what the line already says.

- Each unit answers the question a parent doc answers one level up — is the thing I need below this point?

  - The header rules the file in or out.

  - Docstrings rule the function in or out.

  - Comments carry the reader through what remains.

## Why

- **Files churn too fast for doc bundles**

  - The doc tree stops at L3, one doc per concept. 

  - The lower rungs live in the source, so they move, diff, and review with the code they describe.

- **The flow pays off at the file**

  - A reader leaves the docs with the question framed; the first screenful confirms or rules the file out. 

  - Code is read last, and only where the task lives.
