The system is one addressable artifact with a small, closed block vocabulary, rendered for two equal readers and styled through bounded theme controls. Stable identity anchors operations; visual restraint removes competing encodings. This page owns why those constraints are goals; their operational contracts live in system design.

## One Artifact, Two Equal Readers

One canonical document serves humans and agents through separate, equally important reading and editing surfaces.

Translation layer owns how canonical state becomes each reader's interaction surface.

### Why

- Humans and agents consume information differently; each needs a surface optimized for how it reads and edits.

- Neither reader is primary. When their needs diverge, canonical state carries the structure both renderers need so neither surface degrades.

## Blocks Are Closed Contracts

A block type owns its closed state schema, typed actions, human renderer, agent renderer, and theme.

Block design owns this contract and the add-a-type path.

`DOC_BLOCK_TYPES` remains the deliberate central allow-list. Extension is controlled, not plug-in discovery.

### Why

- Closed schemas protect the shared tree: a block cannot hold state its type did not declare, so corruption is refused at the door.

- State, actions, renderers, and theme travel together, so adding a type touches one bundle per home instead of scattered files.

- The boundary stays explicit while remaining bounded enough that a stranger can add a block in an afternoon.

## The Vocabulary Stays Small

The canonical types in `DOC_BLOCK_TYPES` form a deliberately small, curated vocabulary. Database blocks and other attractive general-purpose features stay outside it when they do not serve code documentation.

There is no arbitrary React escape hatch. Unsupported interaction requires a deliberate new type with the full block contract.

### Why

- A small vocabulary keeps the render stable, the editor learnable, and the agent edit surface enumerable.

- Existing types represent the material honestly until a new interaction earns the cost of becoming a first-class type.

## Make It Your Own

Every block type ships its style capabilities as theme knobs; components do not hardcode looks.

The living repo theme auto-saves adjustments. Hand-edited themes use a closed token vocabulary, and unknown keys are ignored.

Customization is bounded: system UI remains fixed so every theme feels like the same tool.

### Why

- The visual controls let an author adjust style “pretty easily based off of visuals and such.”

- Typed knobs make the artifact ownable without letting theme data break the application or replace the tool's identity.

## Restraint Is the Aesthetic

Each surface uses one ink and one accent. Interaction reveals the rest, and boxes appear only when a step needs clarification.

Restraint removes competing encodings such as per-kind colors, icons, badges, and decorative framing; it does not merely mute them.

### Why

- The intended surface is a virtual version of pen-and-paper thinking. Fewer competing colors and markers keep too much from happening at once.

## Stable Identity Is a Contract

A block ID is stable identity, not an implementation detail.

Comments, patches, views, and links anchor to block IDs.

### Why

- The artifact is fully node-based so everything is addressable from a queryable standpoint. Stable addresses let people and agents target the same part without positional guesswork.
