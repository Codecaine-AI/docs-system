Every block type declares a closed schema over its `props` — the type's whole state, and the only state it may hold. This page states what a schema owes and what a good one looks like.

## Structure

```typescript
export const StructuredTableState = Type.Object(
  {
    title: Type.Optional(Type.String()),
    columns: Type.Array(Type.String()),
    rows: Type.Array(Type.Array(Type.String())),
    density: Type.Optional(
      Type.Union([
        Type.Literal("compact"),
        Type.Literal("normal"),
        Type.Literal("relaxed"),
      ]),
    ),
  },
  { additionalProperties: false },
);

export const structuredTableState: BlockStateDefinition = {
  schema: StructuredTableState,
  carriesText: false,
};
```
> **L14 (Closed):** Unknown keys are a validation error — a block cannot hold state its type did not declare.
> **L19 (Per-type fact):** carriesText declares whether the type uses the block's delta text field.

## The Rule

- **Closed over props**

  - `additionalProperties: false` — wrong shapes and unknown keys are rejected at validation, not discovered at render.

- **Optional means additive**

  - New capabilities land as optional fields with safe defaults; documents written before the field existed keep validating unchanged.

- **One schema, three jobs**

  - Validation — every load, save, and action patch checks against it.

  - Discovery — `GET /api/blocks` serves it verbatim as JSON Schema.

  - Editing — the doc renderer trusts it: what validates is exactly what can render.

## Why

- **Corruption is refused at the door**

  - Every write path converges on the same validator, so a malformed block can never reach disk.

- **Agents read schemas, not code**

  - An agent learns exactly what state is legal from discovery — no source archaeology, no guessing.
