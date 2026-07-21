Documentation defines what a system should do without the code. 

The structure defined in these standards is built for many agents at once. 

- With 10, 20, or 100+ agents working a codebase, every change needs one canonical place to land

## The Three Layers

| Layer | Holds | Changes |
| --- | --- | --- |
| `00-foundation` | Core idea behind the system and why it exists | Rarely |
| `10-system-design` | Behavior, implementation-agnostic | When behavior changes |
| `20-implementation` | Functionality, decisions, etc. of the current code | With the code |

## The "Why" Travels with Every Decision

Every decision in these docs carries its why

- The what can be re-derived from the system; the why cannot

- Recorded, it does two jobs

  - A returning human sees exactly why a choice was made a month ago and easily re-onboard to the project

  - An agent checking its work against the docs cannot overturn deliberate intent by accident

## The shape on disk

```
00-foundation/  # intent — what this is and why; every change is compared against it
10-system-design/  # behavior — implementation-agnostic; what the system does and why
└── 10-doc-standards/  # this section — the structure itself, plus five standards docs
20-implementation/  # the current code — mirrors the source tree, churns with it
```

## The Standards

Five standards, one concern each. Every one shows how things are laid out, states the rule, and defends it.

- Structure

  - The three layers, the depth ladder, folders and parent docs, and when a topic earns a folder.

- Numbering

  - Two-digit prefixes, reading order in the filesystem, gaps, and the one named deviation.

- Cross-doc linking

  - Reference spans, canonical-home targets, and the restraint rules against overlinking.

- Code linking

  - One-way doc-to-code references by full path, updated when code moves.

- In-code docs

  - File headers, docstrings, and inline comments: where documentation continues into the source.
