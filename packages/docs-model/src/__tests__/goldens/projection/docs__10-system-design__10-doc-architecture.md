# Doc architecture

The corpus itself is a designed artifact. The rules below are small — folder shapes, two-digit prefixes, where overviews live — but each is a decision, and the reasons decay faster than the rules do. This page is the decision memory: every structural rule with its why, so that a year from now the structure still means what it meant. It is also the structure agents adhere to when they add or move docs — followed well, new material lands where readers expect it, with no cleanup pass to put it there.

> **INFO: Where the how lives** — The operational form of these rules — imperative, load-and-follow, no rationale — is the framework skill. The reasons live here. The discipline: change a structural decision on this page and update the skill in the same change.

## Three layers, by rate of change

| Layer | Holds | Organized by | Changes |
| --- | --- | --- | --- |
| 00-foundation | Intent — what this is and why it exists | Organically; no prescribed shape | Rarely; only when the north star moves |
| 10-system-design | Behavior — what the system does, code-agnostic | Concept | When behavior or architecture changes |
| 20-implementation | The current projection — mechanics of this codebase | Code structure, mirroring the source tree | With the code |

The three kinds of knowledge decay at different rates, and filing them together makes the durable rot with the volatile — a backend rewrite should not touch a single foundation sentence. The litmus test for placement: behavior changed → design; how the code handles it changed → implementation; the goal itself moved → foundation.

Implementation ends with a `99-appendix` for operational material — setup, tooling, the dev loop — which is implementation-specific by nature.

## Folders, overviews, numbering

- Every doc is a bundle folder (the `doc.json` inside it is the canonical state); a section is a folder of docs.

- Every section keeps a `00-overview` that says what exists, what each child covers, and where to descend.

- Two-digit prefixes with gaps of ten (`10-`, `20-`, …) order every listing; `00` is reserved for overviews, `99` for appendices.

- A topic becomes a folder when it needs several docs; until then it stays a single doc.

The goal is navigation without exhaustion — the repair-manual property. From the index you find the section; from the overview you learn what it holds without opening its children; you descend only where the task lives. Numbering makes reading order explicit and insertion cheap: a new doc slots into a gap without renumbering, and running out of gap is the signal that a subfolder is due. Overviews are what make skipping safe.

## Vertical slices, clean boundaries

Each section owns its subject end-to-end and connects to its neighbors at interfaces, not internals. A section documents what crosses its boundary — what it consumes, what it produces — and never re-documents another section's insides. You can rebuild the transmission without understanding combustion; you only need to know what the input shaft carries.

Boundaries contain the blast radius of change. When a subsystem's internals change, one slice of the corpus updates, and every adjacent doc survives untouched as long as the interface holds. That is what keeps a large corpus maintainable by small local edits — and what lets a reader trust that skipping a section is safe.

## The web of knowledge

Docs link to docs with typed reference spans, not raw paths in prose. References resolve through the backlinks index; moving a doc rewrites every inbound reference automatically; and `docs links check` holds the corpus at zero stale references. Dense cross-linking is safe to rely on precisely because it cannot silently rot.

Docs point at code with plain file paths, introduced in prose where the concept is discussed. Code never points back at docs — one-way linking keeps the maintenance cost on one side.

Below the doc tree, the same web continues into the code: file headers state what a file is responsible for, docstrings state what a function promises, and the code states how. Corpus and code together form one continuous ladder from intent down to implementation. (The flat-file framework called these depth levels L1–L6: the index, section overviews, and concept docs are L1–L3; file headers, docstrings, and code are L4–L6.)

## Enforced, or adhered to

| Rule | Held by |
| --- | --- |
| doc.json files are canonical serializer bytes | Byte-equality tests over the whole corpus |
| Every doc's markdown render is stable | Golden files pinned byte-for-byte |
| References never go stale | docs links check + move-time rewriting |
| Corpus membership is explicit | The corpus count assertion and CORPUS_PATHS |
| Layer placement, numbering, overview upkeep | Convention — the skill instructs, review enforces |

The split is deliberate. Where drift is mechanical, the system enforces; where judgment is required, the rule is written imperatively in the skill and applied by whoever — human or agent — is doing the writing.

## From flat files to blocks

This architecture predates the block system: it was designed for markdown files on disk, and it survived the migration because none of its reasons were about file format. What changed in the move: a doc is a bundle folder rather than a `.md` file; frontmatter became bundle metadata; markdown links became reference spans; and reading happens through renders rather than raw files.

What deliberately did not change: the three layers, the numbering, and the overview rule. Their reasons — rate of change, explicit ordering, safe skipping — are about how minds navigate, not about how bytes are stored. The sidebar sorts by the same prefixes; both readers walk the same shape.
