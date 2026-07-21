A block type is a component with a closed contract: it owns its state schema, its update logic, its renderer on each surface, and its theme. This page states that contract and the path for adding a new block type. What each type is for — with an example — is the block vocabulary's story.

## Structure

```
packages/
├── docs-model/
│   └── src/
│       └── components/
│           └── structured-table/
│               ├── actions/  # typed actions — the update logic, as data
│               ├── agent-view.ts  # the agent renderer — state → markdown
│               └── state.ts  # the state schema — closed TypeBox props
└── docs-viewer/
    └── src/
        └── components/
            └── structured-table/
                └── descriptor.tsx  # the doc renderer — state → the editor component
themes/
└── default/
    └── components/
        └── structured-table.json  # the theme — the component's style knobs
```

## The contract

- State schema

  - A closed TypeBox schema over `props` — unknown keys and wrong shapes are rejected at validation, not discovered at render.

  - The schema is the block's whole state; nothing renders that the schema does not declare.

  - Text is no exception: delta spans are the rich text family's state, held in the block's dedicated text field.

- Typed actions

  - The update logic: every state change is an action — data, not code calls — keyed `<type>.<verb>` so any surface can list and invoke them.

  - An action returns a props patch, which is what makes inverses — and undo — free.

- Doc renderer

  - The Notion-style component a human reads and edits — including the in-place editing node view where the type supports it.

- Agent renderer

  - The markdown view an agent reads — the same state rendered to stable, greppable text.

- Theming

  - The component ships its style capabilities as theme knobs, resolvable per theme — never hardcoded looks.

- Agent adapter

  - How an agent edits the type when it processes an annotation. The default is generic: typed ops over the doc render — most types need nothing more.

  - Complex types — canvas, sequence — declare their own agent: a context loader that assembles what that agent needs, and writeback through the type's own actions.

  - Target design: the adapter lands with annotate mode. The rest of the contract exists today.

The contract is generic; the instances are not. Each block family defines how every element works for it in its block vocabulary doc — inline where short, subpages where a family needs depth.

## Adding a block type

1. Define the state schema and its typed actions.

2. Write the agent renderer: state to markdown.

3. Write the doc renderer, with a node view when the block edits in place.

4. Ship the component's theme file.

5. Register the bundle; discovery (`GET /api/blocks`) serves the new type's schema and actions to every surface.

The set stays closed. Both surfaces know every block they will ever meet, and discovery exists so an agent learns the roster — schemas and actions included — without reading code.

## Why

- **A block is a component, not a snippet**

  - State, logic, renderers, and theme travel together; adding a type touches one bundle per home, not scattered files.

- **Closed schemas keep the tree safe**

  - A block cannot hold state its type did not declare; corruption is refused at the door.

- **Two renderers by design**

  - Every type answers both readers from one state — the translation layer's promise, kept per block.
