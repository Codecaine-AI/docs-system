The implementation layer records structural decisions about the current code — how it is organized and why — so an agent adding code conforms to the standardized architecture instead of quietly restructuring it. An agent whose change conflicts with an entry files a proposal; it never silently deviates. 

This page states the shape of an area page, the test an entry must pass, and why the layer accretes lazily.

## Structure

```
20-implementation/  # L1 — the layer's parent doc: orientation map of top-level source dirs, one line of ownership each
└── 30-connectors/  # an area page — mirrors src/connectors/, one level per genuine subdivision
    └── 10-http/  # does not exist — deeper structure becomes entries on the connectors page
```

An area page reads top to bottom in four parts:

- **Role line**

  - One sentence on what the area does, ending in the source path it documents.

- **Governed-by links**

  - References up to the design docs that constrain the area — the governed-by convention in cross-doc linking.

- **Decision entries**

  - Every structural decision in force, in the entry format below.

- **Orientation roster (optional)**

  - One line per instance when the area is a set — an agent roster, a connector list.

## The Rule

- **An entry governs unwritten code**

  - The inclusion test: an entry states a rule that governs code that does not exist yet.

  - Thirty data connectors extend a base class, so connector #31 must too — an inline comment cannot govern a file nobody has written, and system design does not care: behavior is identical either way.

- **Decision / Why / Applies to**

  - **Decision**

    - The rule, in one sentence.

  - **Why**

    - The reasoning behind it — including the alternative that was rejected, when it is known.

  - **Applies to**

    - The source paths the rule covers, explicitly including future code under them.

- **Conform or propose**

  - An agent whose change fits the entries follows them; one whose change conflicts files a proposal.

  - Silent deviation is never an option.

- **Lazy accretion**

  - An entry appears when a structure is standardized or violated — never proactively per directory.

  - A near-empty area page that only routes upward through its governed-by links is correct, not incomplete.

- **One level per genuine subdivision**

  - The mirror descends one level for each genuine subdivision of the source; deeper structure becomes entries on the area page, not sub-pages.

- **What stays out**

  - Everything below already has a home; an area page carries none of it.

| Content | Belongs in |
| --- | --- |
| Schemas and state models | `10-system-design` — design owns them |
| Behavior | `10-system-design` — behavior is design, wherever the code lives |
| File-local detail | In-code docs — file headers and docstrings |
| Point-in-time reports | Nowhere in the docs tree — the docs describe present state, not moments |
| Deep file trees | Nowhere — the mirror stops at one level |

- **Salvage before delete**

  - When report content is removed from a docs tree, still-normative rules buried in it are first extracted into the owning tier — a parity analysis may hold live behavioral contracts; a findings log may hold a real decision.

  - Deletion happens after the salvage pass, never instead of it.

## Why

- **A rule for unwritten code needs a home**

  - In-code docs reach only files that exist; nothing in the source can govern a file nobody has written.

  - Design cannot hold it either — the system behaves identically whether the structure is followed or not.

- **Proposals keep the architecture deliberate**

  - A standardized layout survives only while every restructuring is a recorded decision; one silent deviation makes the next one invisible.

- **Lazy entries stay load-bearing**

  - A page written proactively per directory echoes the file tree and rots with it.

  - An entry written when a structure is standardized or violated records a rule someone actually needed.

- **A shallow mirror survives churn**

  - Sub-pages tracking the source tree file by file go stale with every move; entries on an area page move with the page.
