Every type ships the component a human reads and edits. This page states what the doc renderer owes: schema state in, a rich, themable, defensive component out.

## Structure

```typescript
// trimmed from packages/docs-viewer/src/components/structured-table/descriptor.tsx
function structuredTableData(block: DocBlock): StructuredTableData | null {
  const { columns, rows } = block.props;
  if (!Array.isArray(columns) || columns.length === 0) return null;
  if (!columns.every((col): col is string => typeof col === "string")) return null;
  if (!Array.isArray(rows)) return null;
  // ...null means: render invalidBlockPlaceholder instead
}
```
> **L4-7 (Defensive by contract):** The renderer re-checks its data; anything malformed renders the invalid-block placeholder — never a crash, never a guess.

## The rule

- **Schema state only**

  - Nothing renders that the state schema does not declare; the renderer adds no state of its own.

- **Read and edit**

  - A read rendering for every surface, and — where the type edits in place — a node view with the type's own interactions.

  - Structural behavior (drag, select, delete) comes from the editor for free; the renderer supplies only what is specific to the type.

- **Themed through tokens**

  - Looks come from the component's theme knobs, resolved per theme — see theming.

## Why

- **The human surface is components, not text**

  - Rich rendering is the human half of the translation layer — the reason a table is a table and not a wall of pipes.

- **A bad block never takes the page down**

  - Defensive rendering isolates damage to one placeholder block; the document around it stays readable and editable.
