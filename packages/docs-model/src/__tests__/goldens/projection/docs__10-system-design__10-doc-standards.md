Documentation defines what a system should do without the code. 

The structure defined in these standards is built for many agents at once. 

- With 10, 20, or 100+ agents working a codebase, every change needs one canonical place to land

## The Four Layers

| Layer | Holds | Changes |
| --- | --- | --- |
| `00-foundation` | Core idea behind the system and why it exists | Rarely |
| `10-system-design` | Behavior, implementation-agnostic | When behavior changes |
| `20-agents` | Participating agents, their definitions, context, tools, outputs, and responsibilities | When agent contracts change |
| `30-implementation` | How the current code realizes the system design, including its organization and the reasons for key implementation choices | With the code |

A repo may declare additional numbered root tiers (40 and above, below 99) for procedural guide content the four layers cannot hold. The structure standard owns the rule.

## The "Why" Travels With Every Decision

Every decision in these docs carries its why

- The what can be re-derived from the system, but the why cannot

- Recorded, it does two jobs

  - A returning human sees exactly why a choice was made a month ago and easily re-onboard to the project

  - An agent checking its work against the docs cannot overturn deliberate intent by accident

## The Shape on Disk

```
00-foundation/  # intent: what this is and why, the reference every change is compared against
10-system-design/  # behavior: what the system does and why, implementation-agnostic
└── 10-doc-standards/  # this section: the structure itself, plus its standards docs
20-agents/  # the agents involved: definitions, context, tools, outputs, and responsibilities
30-implementation/  # the current code: mirrors the source tree, churns with it
```

## The Standards

Each standard owns one concern. Every one shows how things are laid out, states the rule, and defends it.

- **Layout and Linking**

  - Structure

    - The four layers, the depth ladder, folders and parent docs, and when a topic earns a folder.

  - Numbering

    - Two-digit prefixes, reading order in the filesystem, gaps, and the one named deviation.

  - Cross-doc linking

    - Reference spans, canonical-home targets, and the restraint rules against overlinking.

  - Code linking

    - One-way doc-to-code references by full path, updated when code moves.

- **Content and Checks**

  - In-code docs

    - File headers, docstrings, and inline comments: where documentation continues into the source.

  - Implementation layer

    - Area pages, decision entries, the design-to-code mapping, and lazy accretion.

  - Document Purpose

    - One primary reader purpose within the existing layers, with supporting reasons and reference details.

  - Authoring Lints

    - Rule ownership, draft and completion checks, and the distinction between required findings and editorial warnings.

  - Style Enforcement

    - Proposed tiers that prime writers with STE, then verify pages with lints, judgment rules, and model rewrites.
