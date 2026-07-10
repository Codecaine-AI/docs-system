# Docs Model Sample

This paragraph mixes **bold**, *italic*, ~~struck~~, `inline code`, a [link](https://example.com), and a reference to doc-schema.ts.

---

## Structure

- First item

  - Nested item under the first

- Second item

```typescript
export const answer = 42;
export const double = () =>
  answer * 2;
```
> **L1 (Export):** The canonical answer constant.
> **L2-3:** Helper that doubles the answer.

> Stable ids are a system invariant.

> **Decision: Heads up** — Comments live in comments.json, never in doc.json.

**Structured table sample**

| Name | Value |
| --- | --- |
| answer | 42 |
| question | unknown |

**Module layout**

```
  src/
  ├── components/
  │   └── docs/
> │       └── src/components/docs/BlockRenderer.tsx -> DocBlockRenderer.tsx
  └── lib/
      ├── docs-model/
~     │   ├── doc-ops.ts  # typed ops + inverses
+     │   └── doc-schema.ts  # types + validation
-     └── legacy/  # dead code purge
  README.md
```

**File-tree block surface**

```
file-tree.addEntry(path: string, note?: string, change?: string) -> props patch  # Append a path entry to the tree
file-tree.updateEntry(path: string, newPath?: string) -> props patch  # Patch note/change/from, or rename via newPath
file-tree.removeEntry(path: string)
```

> **Mermaid: Mermaid sample** — flowchart LR
>   A[Doc] --> B[Render]

<!-- canvas: ./assets/canvases/sample.canvas.json view=container-architecture title="Architecture overview" -->

![Sample image](./assets/images/sample.png)
*A bundled asset image (D30).*

> **Video: Docs walkthrough** — https://www.youtube.com/watch?v=dQw4w9WgXcQ — An external video (YouTube).
