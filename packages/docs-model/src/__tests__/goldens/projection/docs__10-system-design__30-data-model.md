The docs system has one on-disk content format

- `doc.json`

  - a normalized block tree

- `annotations.json` 

  - sidecar per bundle 

Four shapes describe the state; one behavior model describes every change. 

This section describes shapes and invariants, not transport wiring. 

Everything here is defined in packages/docs-model

## The four shapes

- The document & block tree

  - The envelope, the flat id-keyed blocks map, ordered children arrays, stable anchor ids, and the graph invariants.

- Block design

  - The block contract: every type owns its state schema, typed actions, doc renderer, agent renderer, and theme — and the path for adding a custom component.

- Annotations

  - The annotations.json sidecar: the human-to-agent request channel — anchors, intents, agent-run receipts, dangling-target detection.

- Serialization

  - How a document is said: the deterministic serializer, the markdown render map, and the content hashes that make write preconditions possible.

## The behavior model

- The mutation model

  - How the shapes change: the seven-op algebra, inverses, undo and redo, copy and paste, and what a refused write looks like.

## Neighbors

The roster of block types — what each is for, with an example — is the block vocabulary's subject; type counts live there. How bytes reach disk is the save pipeline's.
