How an agent edits a type when it processes an annotation. 

The adapter is the execute step of the annotations lifecycle: annotate mode's processing reaches each type through it.

## The Design

- **Default: generic ops**

  - Most types need nothing declared: the agent reads the doc render and edits through the generic ops and the type's actions.

- **Complex types bring their own agent**

  - Canvas and sequence declare a processing agent of their own.

  - A context loader assembles what that agent needs — the canvas file, the sequence source — instead of the doc render alone.

  - Writeback goes through the type's own actions, so validation and undo hold no matter who edits.

- **Discovery advertises the adapter**

  - The annotation router learns from the registry which agent handles which type — routing is data, not hardcoded knowledge.

## Why

- **Each type knows how it changes**

  - Editing a sequence diagram and editing a paragraph are different crafts; the contract makes that a per-type declaration instead of a special case.

- **One queue, many specialists**

  - The annotations queue stays uniform while execution specializes — one lifecycle, per-type hands.
