Every custom state change to a block is a typed action: data, not a method call. This page states the action shape and its obligations.

## Structure

```typescript
// trimmed from packages/docs-model/src/components/file-tree/actions/add-entry.ts
export const addEntry = defineComponentAction({
  action: "file-tree.addEntry",
  blockType: "file-tree",
  description: "Append a path entry to the file tree.",
  params: Type.Object({
    path: Type.String({ minLength: 1 }),
    note: Type.Optional(Type.String()),
  }),
  apply: (block, params) => ({ entries: [...readFileTreeEntries(block), toEntry(params)] }),
});
```
> **L3 (The key):** <type>.<verb> — any surface can list and resolve actions without inspecting code.
> **L6-9 (Params are schema):** TypeBox, served verbatim by discovery and validated at apply time.
> **L10 (A patch, not a mutation):** apply returns a shallow-merge props patch — which is what makes the inverse, and undo, free.

## The rule

- **Keyed and discoverable**

  - The `<type>.<verb>` key plus a params schema is the whole public surface; discovery lists both.

- **Apply is pure**

  - Block in, props patch out — no I/O, no side effects.

  - The patch validates against the state schema before anything persists.

- **The only custom write path**

  - Beyond the generic ops, a block's state changes only through its actions — there is no third path.

## Why

- **Data can travel**

  - An action invocation serializes: the editor, the CLI, an agent, and a test all speak the same shape.

- **Undo is free**

  - A patch plus the prior props is an exact inverse; the mutation model turns that into undo units.
