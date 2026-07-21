The sequence-diagram block of the block vocabulary: UML-style sequence diagrams rendered from a structured `SequenceDocument`. The JSON document is the source of truth; a compact text program is the agent-facing projection — agents rewrite the whole program, and the language carries no styling, no coordinates, and no ids. The engine lives in the standalone sequence repo (`github.com/Codecaine-AI/sequence`, a sibling checkout today, a future submodule at `external/sequence`); the docs-system block integration is upcoming.

> **INFO: Replaces mermaid** — This block replaces the retired mermaid block. Sequence diagrams use this system; every other diagram type belongs to the canvas block.

```
participant 1 text=user kind=actor
participant 2 text=login label="Login page"
participant 3 text=db label="Database server" stereotype=servlet

seq
  1 > 2 text="input(username, password)"
  2 > 3 text="fetch(username, password)"
  alt guard=fetching
    3 --> 2 text="end fetching"
    2 > 1 text=success
  else
    2 --> 1 text="incorrect input"
  opt guard="needs confirmation"
    2 -> 3 text=confirm
  note over=2 text="validates first"
```

<!-- sequence: assets/sequences/login-flow.sequence.json title="Login flow" -->

Language essentials: numbers are participant identity, `text=` is a display name. Arrows are `>` sync, `->` async, `-->` return. `alt`/`opt`/`loop` fragments take `guard=` and nest by indentation alone — there is no `end` keyword. `note` attaches `over`/`left`/`right` of a participant; activations are derived automatically. Styling lives in the document's separate style section, *never* in the program.

```
title "Order distribution"
participant 1 text=order label=Order
participant 2 text=careful label="Careful distributor"
participant 3 text=regular label="Regular distributor"
participant 4 text=messenger label=Messenger

seq
  loop guard="for each line item"
    alt guard="value > $15,000"
      1 > 2 text=dispatch
    else
      1 > 3 text=dispatch
  opt guard="needs confirmation"
    1 -> 4 text=confirm
```

Testing today happens in the sequence studio: run `bun run dev:studio` in the sequence repo and open `http://localhost:3998`.
