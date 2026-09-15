# Minimal Documentation Layer Proposal

Applied September 14, 2026. The six document edits, two folder moves, and skill updates are complete. The approved proposal is preserved below. Agents remains a reserved tier; no new agent pages were created.

192 existing blocks preserved. 25 blocks updated. Zero blocks deleted, inserted, moved, or re-nested.

## Proposed Order

00-foundation → 10-system-design → 20-agents → 30-implementation → 40-guides → 99-appendix

## Doc standards

Add Agents to the existing layer table and tree; retain the surrounding explanation and standards index.

File: docs/10-system-design/10-doc-standards/doc.json

### Complete Proposed Document

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

A repo may declare additional numbered root tiers (40 and above, below 99) for procedural guide content the four layers cannot hold. structure owns the rule.

## The "Why" Travels With Every Decision

Every decision in these docs carries its why

- The what can be re-derived from the system; the why cannot

- Recorded, it does two jobs

  - A returning human sees exactly why a choice was made a month ago and easily re-onboard to the project

  - An agent checking its work against the docs cannot overturn deliberate intent by accident

## The Shape on Disk

```
00-foundation/  # intent: what this is and why; every change is compared against it
10-system-design/  # behavior: implementation-agnostic; what the system does and why
└── 10-doc-standards/  # this section: the structure itself, plus its standards docs
20-agents/  # the agents involved: definitions, context, tools, outputs, and responsibilities
30-implementation/  # the current code: mirrors the source tree, churns with it
```

## The Standards

Each standard owns one concern. Every one shows how things are laid out, states the rule, and defends it.

- Structure

  - The four layers, the depth ladder, folders and parent docs, and when a topic earns a folder.

- Numbering

  - Two-digit prefixes, reading order in the filesystem, gaps, and the one named deviation.

- Cross-doc linking

  - Reference spans, canonical-home targets, and the restraint rules against overlinking.

- Code linking

  - One-way doc-to-code references by full path, updated when code moves.

- In-code docs

  - File headers, docstrings, and inline comments: where documentation continues into the source.

- Implementation layer

  - Area pages, decision entries, the design-to-code mapping, and lazy accretion.

- Document Purpose

  - One primary reader purpose within the existing layers, with supporting reasons and reference details.

- Authoring Lints

  - Rule ownership, draft and completion checks, and the distinction between required findings and editorial warnings.


## Structure

Update layer names and numbered paths only. Preserve the full depth ladder, folder rules, examples, and rationale.

File: docs/10-system-design/10-doc-standards/10-structure/doc.json

### Complete Proposed Document

Within every layer, the docs keep the same substructure.

A tree of bundle folders descending L1–L6

- Three levels in the doc tree

- Three in the source

This page states the depth ladder, the folder rules, and why the shape holds.

## Structure

```
10-system-design/  # L1 — the layer's parent doc: summary plus an index of every section
└── 10-doc-standards/  # L2 — a section: the folder is itself a doc introducing its children
    └── 10-structure/  # L3 — a concept doc: one coherent idea (this one)
30-implementation/
├── 20-workbench/  # a single doc — one concept covers it
└── 40-theming/  # a folder — themes split four ways
```

## The Depth Ladder

Six levels — three in the doc tree, three in the source:

| Level | Lives at | Carries |
| --- | --- | --- |
| L1 | A layer's parent doc (00-foundation, 10-system-design, 20-agents, 30-implementation) | Layer summary plus a section index linking every L2 |
| L2 | XX-section (the section's parent doc) | Section scope and its children, one line each |
| L3 | A concept doc | One coherent idea — atomic, link-rich, code-connected |
| L4 | Top of a source file | The file's contract: responsibilities, dependencies, invariants — kept under 50 lines |
| L5 | Function docstrings | The function's contract: purpose, inputs, outputs, side effects, errors |
| L6 | The code | The implementation itself — read only after L4/L5 confirm you are in the right place |

- The ladder is the same in every layer

  - L1–L3 structure foundation, system design, and agents exactly as they structure implementation.

- The doc tree stays at three levels; a subsection appears only when a section genuinely subdivides.

- Below L3 the rungs live in the source — in-code docs owns them.

## Folders and Bundles

- A doc is a folder containing `doc.json` — `10-authentication/` holding a bundle, not `10-authentication.md`. The folder name is the doc's address; the bundle inside is its state.

- Implementation mirrors the source: `src/core/workflow/` documents at `docs/30-implementation/10-core/10-workflow/`. Cross-cutting concerns — logging, caching, error handling — get one primary home, never a scatter.

  - The mirror goes one level per genuine subdivision — deeper structure becomes entries on the area page, not sub-pages; the implementation layer standard owns the rule.

- A section folder is itself a document: it carries its own `doc.json` — the parent doc — introducing its immediate children, one level deep, one line each.

  - An abstract, not a table of contents: after reading it, a reader can explain the domain and descends only where the task lives.

- A topic becomes a folder when it needs about three related docs or has clear room to grow; until then it stays a single doc. A folder holding only its parent doc plus one child collapses back into a single doc.

## Extension Tiers

Foundation owns intent, design owns behavior, agents owns agent definitions, and implementation maps the design to the current code and explains key choices. None owns procedure. A repo may declare additional numbered root tiers (40 and above, below 99) for procedural how-to content the four layers cannot hold: authoring recipes, operator guides.

- **Announced as a guides tier**

  - The tier's parent doc names it a guides tier, so a reader knows on arrival that it carries procedure, not contracts.

- **Non-normative**

  - The tier defers authority to the four layers via links and never restates their contracts. A rule found there is a pointer, not a source.

- **Reports stay banned**

  - Point-in-time reports are banned in an extension tier exactly as they are everywhere else in the docs tree.

- An authoring guide tier holding `defineContext` and `defineState` recipes extends the tree without stretching design to hold procedure.

## Why

- **On disk, next to the code**

  - Every doc is a folder in the repo, versioned with the source it describes.

    - An agent reads and edits it with plain file access — no special tooling.

    - Docs and code change in the same place, so they track together.

- **Progressive disclosure**

  - Read only what the task needs.

    - The concept doc points at a source file; the file's header says whether to keep going; docstrings answer for each function.

    - Each level rules the next in or out

      - No scattered hunting.

- **A clear place for everything**

  - The structure answers where a thing lives and where a new thing goes.

    - A human files and finds by walking the numbered tree.

    - An agent searches along the same explicit structure instead of guessing.


## Numbering

Insert Agents and update the Implementation prefix in the existing example; retain the numbering guidance.

File: docs/10-system-design/10-doc-standards/20-numbering/doc.json

### Complete Proposed Document

Every doc and folder carries a two-digit prefix, and every listing — sidebar, terminal, render — sorts by it identically. 

This page states the scheme, the reserved ranges, and what running out of gap space actually means.

## Structure

```
00-foundation/  # 00 — early/foundational slot, used sparingly
10-system-design/  # top-level sections gap by ten: 10-, 20-, 30-…
├── 10-doc-standards/
│   ├── 10-structure/  # children start at 10
│   ├── 20-numbering/  # siblings continue 20-, 30-, 40-…
│   └── 25-new-standard/  # ← a mid-gap insertion lands here; nothing renumbers (hypothetical)
└── 40-block-vocabulary/
    └── 10-rich-text/  # the named deviation: type pages run 10–17 dense, one family as a unit
20-agents/  # participating agents and their definitions
30-implementation/  # the current code: design mapping and implementation choices
```

## The Rule

- Prefix every doc and directory with two digits and a hyphen: `XX-lowercase-hyphenated-name`.

- Leave gaps of ten (`10-`, `20-`, `30-`) so a new doc can be inserted without renumbering anything.

- Insert mid-gap first — `25-` between `20-` and `30-` — before considering any reorganization.

- When the gaps are exhausted, the number line is telling you the section has outgrown its shape: reorganize into a subfolder rather than packing consecutive numbers.

| Range     | Reserved for |
| --- | --- |
| 00–09 | Early or foundational content, used sparingly — 00 is a plain sort prefix, not a reserved slot; new sections start children at 10 |
| 10–89 | Main content |
| 90–98 | Late or supplementary content |
| 99 | Appendix and meta |

Violations look like: consecutive numbers with no gaps, mixed formats (`1-intro`, `02-setup`, `section-3`), `99-` on anything but appendix material.

## Why

- **Ordered for human reading**

  - The numbers are for people first.

  - Prefixes put reading order in the filesystem itself — sidebar, terminal, and render agree without a manifest.

- **Insertion is local**

  - A new doc lands mid-gap and nothing else moves, which matters when paths are reference targets.

- **A clean search path for agents**

  - Second to human reading, and just as real.

  - The same explicit order tells an agent where to search and where to land a change — structure instead of hand-waving.

- **Exhaustion is a signal**

  - The moment you cannot number a doc, the section needs a subfolder. Packing consecutive numbers silences that signal.


## Implementation layer

Adjust the purpose and inclusion test in place; retain the page template, decision format, examples, and detailed rationale.

File: docs/10-system-design/10-doc-standards/60-implementation-layer/doc.json

### Complete Proposed Document

The implementation layer concisely maps the system design to the current codebase: how the code realizes the design, how it is organized, and why key implementation choices were made. An agent whose change conflicts with a recorded structural decision files a proposal; it never silently deviates.

This page states the shape of an area page, the test an entry must pass, and why the layer accretes lazily.

## Structure

```
30-implementation/  # L1 — the layer's parent doc: orientation map of top-level source dirs, one line of ownership each
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

  - One line per instance when the area is a set, such as a module roster or connector list. Agent definitions belong in Agents.

## The Rule

- **An entry connects design to code**

  - The inclusion test: an entry helps the reader locate how the design is implemented or understand why the current code is built this way. Rules governing future additions remain part of that explanation.

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

  - An entry appears when the design-to-code mapping or a structural choice needs explanation. Do not add filler per directory.

  - A near-empty area page that only routes upward through its governed-by links is correct, not incomplete.

- **One level per genuine subdivision**

  - The mirror descends one level for each genuine subdivision of the source; deeper structure becomes entries on the area page, not sub-pages.

- **What stays out**

  - Everything below already has a home; an area page carries none of it.

| Content | Belongs in |
| --- | --- |
| Schemas and state models | `10-system-design` — design owns them |
| Behavior | `10-system-design` — behavior is design, wherever the code lives |
| Agent definitions, context, tools, and outputs | `20-agents` owns the agent contracts |
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


## Document Purpose

Change the layer count and ownership sentence. Keep all purpose definitions and formatting guidance.

File: docs/10-system-design/10-doc-standards/70-document-purpose/doc.json

### Complete Proposed Document

Every document has one primary reader purpose within the corpus's existing layers. Supporting reasons and reference details belong when they help the reader finish that purpose.

## Structure

Diataxis distinguishes four purposes by whether the reader needs action or understanding, for learning or for work.

- **Tutorial**

  - Help a learner build something through a controlled sequence. State the result at the start and show expected output throughout.

- **How-To**

  - Help a competent reader finish a task. Use direct steps, relevant conditions, and decision points. Name the guide by the task.

- **Reference**

  - Supply facts for lookup. Mirror the thing described and state its options, limits, and errors. Generate facts from code where practical.

- **Explanation**

  - Answer a bounded why question with context, constraints, alternatives, and reasons for a decision.

## The Rule

Choose the primary purpose before authoring. Purpose guides the reader's task; the corpus layers still determine location and authority.

- Preserve the four layers and the templates defined in Structure.

  - Foundation owns intent. Design owns behavior. Agents owns agent definitions. Implementation maps the design to current code and explains key implementation choices.

  - Procedure belongs in an existing, declared guides tier. Do not create new root categories merely to match Diataxis.

- Keep one main reader task per page.

  - A standard can state a rule and explain why. A how-to can include a small reference detail needed for its next step.

  - Split and link when a secondary purpose becomes an independently useful page or interrupts the main task.

- Keep the established standard flow of Structure, The Rule, and Why.

  - Keep implementation area pages and decision entries in the Implementation Layer format.

  - Templates define the page's shape. Purpose determines what belongs inside that shape.

- Match the detail to the task.

  - Tutorials show visible results and link extended explanation. How-to guides assume competence and omit lessons unrelated to the task.

  - Reference presents facts for lookup. Explanation weighs alternatives and states the reasoning.

## Why

A primary purpose gives the reader a predictable path through a document. Supporting reasons preserve the corpus's requirement that each decision carries its why, without turning every page into a tutorial or an exhaustive catalog.

The Diataxis distinction comes from [Diataxis](https://diataxis.fr). The Technical Writing source skill records a fetch on 2026-07-18. This attribution does not claim a new fetch.


## Implementation Overview

Adjust the opening, tier purpose, and inclusion test only; preserve the source map, links, and decision guidance.

File: docs/20-implementation/doc.json

### Complete Proposed Document

How the current docs-system code realizes the system design: how the source is organized and why key implementation choices were made. This section is a concise transition from the design into the code.

## Source Areas

- packages/ — the workspace packages: the pure document model, the derived backlinks index, the mutation authority, the browser viewer/editor, the runnable workbench, the command-line dialect, and the methodology package; decisions live under Packages and its per-package children.

- packages/docs-workbench — the composition host where the server and viewer meet; host-wiring decisions live under Workbench.

- external/ — the independently owned Canvas and Sequence projects, mounted as submodules; boundary decisions live under External Canvas and Sequence.

- themes/ — theme folders and component style knobs; decisions live under Theming.

## Tier Contract

This tier maps the design to current code and records key implementation choices. Design owns behavior, state models, and load-bearing schemas; Agents owns agent definitions; the code owns file-local detail; reports do not belong in the docs tree at all.

**Inclusion test**: an entry helps the reader locate how the design is implemented or understand why the code is built this way.

Agents adding code either conform to the decisions recorded here or file a proposal to change them — never silently deviate.

The layer's shape, entry format, and rationale are defined by the Implementation layer standard.


## Skill Addition

The reading order is Foundation, System Design, Agents, then Implementation. Implementation briefly maps the design to the actual codebase and explains key implementation choices. Keep agent definitions in Agents. Preserve existing page structure, formatting guidance, examples, and detailed rationale when adjusting these layers.

