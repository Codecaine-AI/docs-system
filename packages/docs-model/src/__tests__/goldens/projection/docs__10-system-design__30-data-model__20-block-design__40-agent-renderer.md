Every type ships the markdown view an agent reads: the same state, rendered to stable text. This page states the agent renderer's obligations.

## Structure

```typescript
// trimmed from packages/docs-model/src/components/structured-table/agent-view.ts
function projectStructuredTable(block: DocBlock): string {
  const columns = readStringArray(block.props.columns);
  const rows = readRows(block.props.rows);
  // emits a GitHub markdown table: header, separator, one line per row
}
```
> **L2 (State in, string out):** A pure function of the block — no I/O, no surface knowledge.
> **L5 (Degrade, never throw):** Malformed props render best-effort text; the agent surface never crashes on a bad block.

## The rule

- **Pure and stable**

  - Same block, same bytes — every type's render is pinned byte-for-byte by golden tests.

  - Purity is what makes the pin possible: nothing environmental leaks into the output.

- **Greppable output**

  - Structure survives as plain text — headers, labels, and values an agent can find with `docs grep`, no parsing required.

## Why

- **The render is a contract**

  - An agent scripts against the render; a golden diff — not a surprised agent — is where a change shows up first.

- **Text is the agent's native medium**

  - The agent half of the translation layer: the best representation for the reader, not a compromise shared with humans.
