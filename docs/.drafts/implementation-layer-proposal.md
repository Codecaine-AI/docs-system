# Implementation Layer — Proposed Changes

Draft for review, 2026-08-15. Nothing staged. Two parts: the docs-system standard, then the
GameCube decomp harness as the worked example — full docs tree, all tiers, so cross-tier moves
are visible in one place.

## The contract, in one paragraph

The implementation layer records **structural decisions about the current code** — how it is
organized and why — so agents adding code conform to the standardized architecture instead of
quietly restructuring it. Inclusion test: *an entry states a rule that governs code that doesn't
exist yet* (connector #31 must extend the base class). Design owns behavior, state models, and
load-bearing schemas; the code owns file-local detail; reports don't belong in the docs tree at all.

---

## Part 1 — docs-system: where the standard lives

```
docs-system/docs/10-system-design/10-doc-standards/
│
├── doc.json                      EDIT
├── 10-structure/                 EDIT
├── 20-numbering/
├── 30-cross-doc-linking/         EDIT
├── 40-code-linking/
├── 50-in-code-docs/
└── 60-implementation-layer/      NEW
    └── doc.json
```

| Doc | Change |
| --- | --- |
| `60-implementation-layer/` **(new)** | The sixth standard. Carries: the layer's purpose (protect standardized code architecture; agents conform or file a proposal, never silently deviate) · the inclusion test above · the entry format (**Decision** / **Why**, with the rejected alternative / **Applies to**) · the area-page shape (role + source pointer, governed-by links, decision entries, optional one-line roster) · what stays out (schemas, behavior, reports, file listings) · the lazy-accretion rule (entries appear when a structure is standardized or violated — never proactively per directory). |
| `doc.json` (parent) | Reword the implementation row of the Three Layers table: "Functionality, decisions, etc. of the current code" → **"Structural decisions about the current code — how it's organized and why, so additions conform."** Add the sixth standard to the standards list. |
| `10-structure/` | Keep "implementation mirrors the source"; add: the mirror goes one level per genuine subdivision — deeper structure becomes entries on the area page, not sub-pages. |
| `30-cross-doc-linking/` | Name the **governed-by** convention: implementation area pages link one-way up to the design docs that constrain them. Same restraint rules as all cross-doc links. |

Follow-on (separate change, later): audit docs-system's own `20-implementation/` against the new
standard, one project at a time.

---

## Part 2 — decomp harness: full docs tree

Unmarked = unchanged. Markers appear only where something happens.

### Legend

| Marker | Meaning |
| --- | --- |
| REWRITE | Replace the page body with the four-block stub: role + source pointer · governed-by links · decision entries · optional roster. |
| REFRAME | Content survives, recast as decision entries (Decision / Why / Applies to) instead of description. |
| COLLAPSE | Sub-pages fold into decision entries on the parent page (the one-level mirror rule). Folder disappears. |
| DELETE | Point-in-time report — no home in the docs tree. |
| MOVE | Leaves this spot; destination after the arrow. |
| FLAG | Needs a call from Ford before staging (numbered; see Open Flags). |

### The tree

```
gamecube-decomp-harness/docs/
│
├── 00-foundation/                                      (unchanged)
│
├── 10-system-design/                                   (unchanged except one flag)
│   ├── 10-core-idea/
│   ├── 20-architecture/
│   ├── 30-games/
│   │   ├── 10-game-model/
│   │   ├── 20-cycles/
│   │   └── 30-save-points/
│   ├── 40-harness-state/
│   │   ├── 10-state-composition/
│   │   │   ├── 10-harness-state/
│   │   │   ├── 20-workflow-slot/
│   │   │   ├── 30-cycle-state/
│   │   │   ├── 40-sync-state/
│   │   │   ├── 50-run-state/
│   │   │   ├── 60-pr-state/
│   │   │   └── 70-knowledge-state/
│   │   ├── 20-dispatch-authority/
│   │   ├── 30-operator-actions/          ◄─────────── possible incoming move (flag 2)
│   │   ├── 40-durable-records/
│   │   ├── 50-game-events/
│   │   │   └── … (7 sub-pages, unchanged)
│   │   └── 60-event-handshake/
│   ├── 50-workflows/
│   │   ├── 10-sync/
│   │   ├── 20-run/
│   │   │   ├── 10-run-state/
│   │   │   ├── 20-director-loop/
│   │   │   ├── 30-board-prioritization/
│   │   │   ├── 40-workers/
│   │   │   │   ├── 10-lifecycle/
│   │   │   │   ├── 20-capabilities/
│   │   │   │   └── 30-write-safety/
│   │   │   └── 50-process-guardians/
│   │   └── 30-pr/
│   │       ├── 10-score-gate-and-handoff/
│   │       └── 20-campaign-and-tracking/
│   └── 60-knowledge/
│       ├── 10-principles/
│       ├── 20-connection-map/
│       ├── 30-per-target/
│       │   └── … (3 sub-sections, unchanged)
│       ├── 40-knowledge-stores/
│       ├── 50-inputs/
│       ├── 60-worker-surfaces/
│       ├── 70-background-jobs/           ◄─────────── boundary check vs impl (flag 3)
│       └── 90-record/                                  FLAG 4 — working state living in design
│           ├── 10-implementation-record/               reads as roadmap/objectives material
│           ├── 20-decision-log/                        may seed implementation decision entries
│           └── 30-open-questions/
│
├── 20-implementation/
│   ├── doc.json                                        REWRITE
│   ├── 10-agents/
│   │   ├── doc.json                                    REWRITE — roster of the seven agents
│   │   ├── 10-director-worker/                         REFRAME
│   │   ├── 20-pr-review/                               REFRAME
│   │   ├── 30-knowledge-curator/                       REFRAME
│   │   └── 40-runtime/                                 REFRAME
│   ├── 20-server-jobs/
│   │   └── doc.json                                    REWRITE
│   ├── 30-knowledge/
│   │   ├── doc.json                                    REWRITE
│   │   ├── 10-worker-tooling-doc-gap-report/           DELETE
│   │   ├── 20-melee-pr-review-qa-standards/            MOVE → harness knowledge corpus
│   │   ├── 21-melee-pr-review-qa-coverage-audit/       DELETE
│   │   └── 30-background-processing/                   REFRAME + COLLAPSE (flag 3)
│   │       ├── 10-job-storage-and-migration/           └─ becomes a decision entry
│   │       ├── 20-enqueue-claim-and-retry/             └─ becomes a decision entry
│   │       ├── 30-materialization-and-idempotency/     └─ becomes a decision entry
│   │       └── 40-operator-trigger/                    └─ behavioral? promote to design
│   ├── 40-state/
│   │   ├── doc.json                                    REWRITE — thinnest page; governed-by only
│   │   └── 10-harness-state-and-authority/             KEEP + COLLAPSE
│   │       ├── 10-harness-state-view-builder/          └─ becomes a decision entry
│   │       ├── 20-action-projection-and-guards/        └─ becomes a decision entry
│   │       └── 30-dispatch-integration/                └─ becomes a decision entry
│   ├── 50-tools/
│   │   └── doc.json                                    REWRITE — seed entry: toolpack pattern
│   ├── 60-ui/
│   │   ├── doc.json                                    REWRITE
│   │   ├── 10-operator-runbook/                        FLAG 1 — where do ops docs live?
│   │   └── 20-harness-state-workspace/                 FLAG 2 — structure or behavior?
│   │       ├── 10-dto-and-client-model/                └─ structure → collapse to entry
│   │       ├── 20-state-summary-and-freshness/         └─ structure → collapse to entry
│   │       ├── 30-action-controls-and-confirmation/    └─ behavior? → design operator-actions
│   │       └── 40-compatibility-actions/               └─ behavior? → design operator-actions
│   └── 99-appendix/
│       ├── 20-current-repo-mechanics/                  KEEP
│       ├── 30-implementation-roadmap/                  KEEP — possible landing spot for flag 4
│       ├── 40-design-coverage/                         DELETE
│       └── 50-pi-agent-run-reports/                    DELETE
│
└── 40-new-features/                                    (unchanged — proposal staging, out of scope)
    └── 10-daytona-sandbox-execution/
        └── … (7 sub-pages)
```

### Notes per implementation area

| Area | After the change |
| --- | --- |
| `doc.json` (root) | Orientation map — top-level source dirs, one line of ownership each — plus a link to the `60-implementation-layer` standard. No deeper file trees. |
| `10-agents/` | Roster: the seven agents, one line each (what it does, what it pulls in). Governed-by → `10-system-design/50-workflows`. Existing sub-pages become the seed decision entries (why director/worker rather than peers, why the PR pipeline splits indexer/splitter/reviewer/fixer, runtime wiring choices). |
| `20-server-jobs/` | Stub. Source `apps/server/src/application/jobs`. Governed-by → `50-workflows`. Decisions accrete as job structure gets contested. |
| `30-knowledge/` | Stub, governed-by → `10-system-design/60-knowledge`. Background-processing sub-pages collapse into decision entries; anything behavioral in them promotes up to design `70-background-jobs` (flag 3 draws that line at staging time). |
| `40-state/` | Thinnest page, by design: governed-by → `10-system-design/40-harness-state`, which owns the state model outright. `harness-state-and-authority` stays as the model entry (who may write state); its three sub-pages collapse into entries on it. |
| `50-tools/` | Stub. Likely first real decision entry: the toolpack pattern — why `toolpacks/gamecube-decomp` is separated from `src/core/tools`. This repo's "connector base class." |
| `60-ui/` | Stub, source `apps/frontend`. Both sub-pages flagged (1 and 2). |
| `99-appendix/` | Shrinks to repo mechanics + roadmap. Reports deleted. |

---

## Flag resolutions (settled 2026-08-15 — Ford deferred to Fable)

1. **`60-ui/10-operator-runbook/`** — **DELETE.** No runbooks in the docs tree. A separate
   operator-docs / how-to section may exist someday; not now.
2. **`60-ui/20-harness-state-workspace/`** — **COLLAPSE all four sub-pages** into decision entries
   on the workspace page. Behavioral content (action controls, compatibility actions) shrinks to
   one-line pointers at design `40-harness-state/30-operator-actions` — no design edits in this
   pass; the later docs audit session redraws content if needed.
3. **Background-processing boundary** — **COLLAPSE sub-pages into decision entries** (storage,
   retry, idempotency, trigger). No design restructuring now; behavior stays referenced via
   governed-by links to `60-knowledge/70-background-jobs`. Later docs session revisits.
4. **Design `60-knowledge/90-record/`** — **UNCHANGED.** The record stays where it is. The design
   tier is untouched everywhere in this pass.
