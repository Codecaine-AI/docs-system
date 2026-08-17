Editor design is the contract for the workbench's designed human surface: what any implementation must present and how it must feel to use. It owns the reading frame and the system UI around and between blocks; each block family's own appearance and editing behavior remains in Block vocabulary. The contract covers reading, editing, styling, shared visuals, and canvas and media behavior.

## The Surface Contracts

- Reading Surface

  - The document column, page title, numbered navigation, reference peek, and backlinks footer.

- Editing Interactions

  - The always-editable feel across typing, insertion, selection, movement, and in-place editing.

- Style Rail

  - The two-pane styling surface, its content-type groups, override attribution, scoped resets, and registry-driven controls.

- Visual System

  - The token, typography, font, and theme decisions shared across the designed surface.

- Canvas and Media

  - The inline and expanded viewing behavior for canvas, image, and video content.

## Capability Degradation

The designed surface degrades by capability, not by error. Every host-dependent power — persistence, annotation writes, live change events, theme writes, asset upload — is a supplied capability, and an absent capability removes its affordances instead of failing. A static export is the limit case: the same surface with no write capabilities renders the same documents read-only, with editing, annotation composing, live updates, and theme authoring simply absent rather than broken.
