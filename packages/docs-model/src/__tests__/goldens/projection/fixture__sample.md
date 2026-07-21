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

> **Decision: Heads up** — Annotations live in annotations.json, never in doc.json.

**Structured table sample**

| Name | Value |
| --- | --- |
| answer | 42 |
| question | unknown |

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
  path: string  # /-separated path
file-tree.updateEntry(path: string, newPath?: string) -> props patch  # Patch note/change/from, or rename via newPath
file-tree.removeEntry(path: string)
```

**InteractionSurfaceOperation** — packages/docs-model/src/components/interaction-surface/state.ts#InteractionSurfaceOperation

```
name: string  # Operation signature name, e.g. "file-tree.addEntry"
description?: string
params?: Field[]  # Signature params, one recursive field node each
  name: string
  required?: boolean  # false marks the param optional
returns?: string
kind?: "action" | "query" | "event"
```

```json
{
  "name": "file-tree.addEntry",
  "description": "Append a path entry to the tree",
  "params": [
    {
      "name": "path"
    },
    {
      "name": "note",
      "required": false
    }
  ],
  "returns": "props patch",
  "kind": "action"
}
```

> **Mermaid: Mermaid sample** — flowchart LR
>   A[Doc] --> B[Render]

<!-- canvas: ./assets/canvases/sample.canvas.json view=container-architecture title="Architecture overview" -->

<!-- sequence: ./assets/sequences/sample.sequence.json title="Login flow" -->

![Sample image](./assets/images/sample.png)
*A bundled asset image (D30).*

> **Video: Docs walkthrough** — https://www.youtube.com/watch?v=dQw4w9WgXcQ — An external video (YouTube).
