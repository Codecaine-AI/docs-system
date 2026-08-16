# Multi-Doc Change-Sets ("Doc PRs") — Design & Build Plan

2026-08-15 design record. Status: **designed, not built** — this doc is the
handoff for the build thread. Baseline commit at time of writing: `8a87d98`
(docs lab polish) on docs-system main.

## 1. Product model

The docs lab's review loop is deliberately layered like git:

| Layer | Git analog | Status |
|---|---|---|
| Ops on one document | edits in one file | ✅ shipped (`DocOp`/`applyOps`, staged proposals, hash+lock+ledger accept) |
| Per-doc staged diff | a file diff | ✅ shipped (red/green staged regions + `ProposalActionBar`) |
| **Change-set across docs** | **a PR** | ❌ this design |
| Doc-level operations | file create/delete/rename | ❌ this design (enabler) |

Driving use case (Ford): *annotate a section on the architecture doc → "move
this to <other doc/section>" → agent proposes it → review one PR-like unit
whose diffs span both docs → accept once.* Merge-two-docs and split-a-doc are
compositions of the same primitive.

Key architectural luck: a docs-edit **session already groups proposals by
`sessionId`**, and DocPage already renders staged regions for its own doc from
the per-doc `proposals.json` sidecar. So if a session stages proposals in doc
B, visiting doc B shows its diff with zero new rendering work. The change-set
is a **grouping record plus an acceptance protocol — not a new mutation
path.** Every mutation still flows through the existing per-doc
`proposal-ops` accept (hash precondition, draft lock, ledger inverse, SSE).

## 2. Current constraints being removed

1. `propose_ops` (docs-kernel session tool) can only stage against the doc the
   session was opened on.
2. Session busy-ness is keyed to ONE doc bundle path.
3. No op can create/delete/move a *document* — the op vocabulary is
   blocks-within-a-doc. (`POST /api/move` exists as a tree route outside the
   review loop.)
4. Nothing migrates annotation sidecar entries or retargets links/backlinks
   when content crosses a doc boundary — a naive cross-doc move strands both.
5. No persistent reviewable unit spans docs; "Apply all" drains one doc's
   queue.

## 3. Design

### 3.1 Change-set record

Corpus-level sidecar, one file per change-set (NOT inside any bundle — it
spans bundles): `docs/.changesets/<id>.json`

```ts
DocChangeSet {
  id: string;
  summary: string;
  status: "open" | "applied" | "declined";
  sessionId?: string;          // the docs-edit session that authored it
  annotationId?: string;       // originating request, if annotation-driven
  alias?: string;
  entries: Array<{             // ordered — acceptance order matters
    docPath: string;
    proposalId: string;        // references the doc's proposals.json sidecar
  }>;
  treeOps: Array<              // doc-level operations, applied interleaved
    | { kind: "create-doc"; docPath: string; title: string }
    | { kind: "delete-doc"; docPath: string }
    | { kind: "move-doc"; from: string; to: string }
  >;
  createdAt: string;
  resolvedAt?: string;
}
```

Same sidecar conventions as `proposals.json`: absence = empty, atomic writes,
path-mutex guarded. `.changesets/` joins the docs-root dot-dirs alongside
`.index/`.

### 3.2 Acceptance protocol

**Accept (the PR merge button)** — single action, ordered, atomic-*feeling*:

1. Acquire path locks for every `entries[].docPath` + treeOp target (ordered
   by path to prevent deadlock; reuse `path-mutex`).
2. For each entry in order: `acceptBundleProposal` (existing path — per-doc
   `baseHash` precondition, ledger inverse recorded, SSE notify).
3. TreeOps applied at their recorded positions via existing/new doc-level ops.
4. On ANY failure: roll back the applied prefix by replaying ledger inverses
   in reverse (`undo_patch` semantics, but batched); change-set stays `open`
   with a per-entry `stale`/`failed` report.
5. On success: mark `applied`, attach `agentRun` + resolve the originating
   annotation, record ONE compound ledger entry (list of patch ids) so a
   change-set undo is a single action.

**Per-doc accept stays available** (reviewing one file of a PR): accepting an
individual entry through the existing proposal routes marks that entry
resolved in the change-set; the card tracks progress. This is the escape
hatch, not the headline flow.

**Reject** drops all staged entries (existing per-doc reject) and marks the
record `declined`. Never touches any doc.

### 3.3 Identity-preserving move (the compound primitive)

`move_blocks(sourceDocPath, blockIds[], destDocPath, destPosition)` —
server-side **generator that emits a change-set**, review stays generic:

1. Dest proposal: `insertBlock` ops carrying the **same block ids** and
   content (id-stability contract: ids are minted per-doc-slug and globally
   unique in practice; a collision check falls back to fresh ids + an
   annotation-migration map).
2. Source proposal: `deleteBlock` ops for the moved ids.
3. Annotation migration step (runs inside accept, after both proposals
   apply): move matching sidecar entries from source `annotations.json` to
   dest — block ids unchanged, so targets stay valid; text-range targets ride
   along verbatim.
4. Link retargeting: docs-index backlinks for the moved blocks → rewrite
   inbound references to the new docPath (delta link nodes), emitted as
   additional entries in the same change-set so they're reviewable too.

`merge_docs(a, b)` = move all of A's root children into B + `delete-doc` A +
retarget inbound links to A. `split_doc` = create-doc + move_blocks. Both are
thin compositions — build `move_blocks` first, derive the others.

### 3.4 Session integration

- `propose_ops` gains `docPath?` (defaults to the session's doc).
- New session tool `propose_move_blocks(sourceDocPath?, blockIds, destDocPath,
  destPosition)` → calls the generator, returns the change-set summary to the
  agent.
- A session's staged output IS an implicit change-set; `changeset_finalize`
  (or automatic on first cross-doc proposal) persists the record.
- Busy-ness: a session locks the SET of docs it has staged into (list on the
  session, checked on launch — `agent-busy` wire literal unchanged).
- docs-writer prompt addendum: "move/merge/split requests use
  propose_move_blocks; never hand-copy content across docs."

### 3.5 Review UI (the PR card)

In the AI tab's chat transcript (PanelQueue child slot already exists):

- **Change-set card**: summary, per-doc rows (`docPath  +adds −dels`,
  staleness chip per entry), click a row → navigate DocPage to that doc (its
  staged regions render from its own sidecar — free), **Accept** / **Reject**
  for the whole set, progress state when entries were accepted individually.
- Queue target labels gain a doc prefix when the target is not the open doc.
- Undo: one "Undo change-set" on the record card while the compound ledger
  entry is live.

## 4. Blast radius

### Touched

| Package | Files | Nature |
|---|---|---|
| `docs-server` | NEW `src/changesets/` slice: `changeset-ops.ts` (record CRUD + accept protocol + rollback), `move-blocks.ts` (generator + annotation migration + link retarget), `changesets-sidecar.ts`; edits: `routes.ts` (+4 routes), `agent-tools.ts` (+`changeset_*`, `move_blocks` tools), `store.ts`, `index.ts`, `patch-ledger.ts` (+compound entry), `bundle.ts` (create/delete-doc helpers if missing) | biggest slice; wiring-heavy |
| `docs-kernel` | `docs-edit-session/tools.ts` (+docPath, +propose_move_blocks), `service.ts` (multi-doc busy-ness, changeset finalize), `docs-edit-session-api.ts` (+changeset routes/events) | wiring-heavy |
| `docs-viewer/lab` | NEW `src/lab/changeset/` slice: `ChangeSetCard.tsx`, `changeset-model.ts` (pure derivations); edits: `session/doc-edit-session.ts` (+ChangeSet types), `annotate/PanelQueue.tsx` (none — card mounts via existing children slot), target label helper | copy-adapt-ish |
| `docs-workbench` | `web/src/lab/`: `doc-lab-controller.ts` (+changesets fetch/overlay), `docs-kernel-client.ts` + `docs-kernel-session-source.ts` (+changeset routes/events), `DocLab.tsx` (mount card), `data/api.ts` (+changeset client fns); DocPage: cross-doc jump navigation only | moderate |
| `docs-model` | ideally NOTHING (no new op kinds — doc-level ops live as treeOps in the record, not in `DocOp`); possible small type export | keep at zero if possible |
| docs corpus | new page under `10-system-design/30-data-model/` for the change-set model; mutation-model page addendum; goldens via the documented one-off-script procedure (NO regen script) | docs |

### Explicitly NOT touched

`@codecaine-ai/annotations` (shared package), prompt-kit, the editor
(`docs-viewer/src/editor`), `DocOp`/`applyOps` semantics, the per-doc proposal
accept path (the protocol calls it, never reimplements it), agent-kernel core.

### Risk notes

- Rollback correctness is THE hard part: inverses must be replayed newest-first
  and the compound ledger entry must be recorded only on full success. Test
  mid-sequence 409 injection explicitly.
- Annotation migration on id-collision fallback needs a remap table threaded
  through — cover with a forced-collision test.
- `docs/.changesets/` must be excluded from the bundle tree walk and audit
  (mirror how `.index/` is excluded) or every audit run flags it.
- happy-dom: assert card semantics/attributes, not computed styles (standing
  gotcha).

## 5. File tree (end state, all phases)

`NEW` = created by this build; `mod` = existing file edited; unmarked = untouched.

```
docs-system/
├─ CHANGESETS-DESIGN.md                          mod  (updated to as-built in Phase 4)
├─ docs/
│  ├─ .changesets/                               NEW  runtime sidecar dir (committed, like annotations.json;
│  │  └─ <changeset-id>.json                          excluded from tree walk + audit, like .index/)
│  └─ 10-system-design/30-data-model/
│     └─ <nn>-change-sets/doc.json               NEW  corpus page (Phase 4, goldens via one-off script)
│
├─ packages/docs-server/src/
│  ├─ changesets/                                NEW  ← the server slice; owns ALL change-set logic
│  │  ├─ changesets-sidecar.ts                   NEW  atomic/mutexed CRUD over docs/.changesets/
│  │  ├─ changeset-ops.ts                        NEW  create/list/get, accept protocol (ordered locks,
│  │  │                                               prefix rollback, compound ledger), reject, undo
│  │  ├─ tree-ops.ts                             NEW  create-doc/delete-doc/move-doc executors + inverses
│  │  ├─ move-blocks.ts                          NEW  generator: id-preserving pairs, collision remap,
│  │  │                                               annotation migration, link retargeting; merge/split
│  │  └─ __tests__/
│  │     ├─ changeset-ops.test.ts                NEW  happy path / rollback / concurrency / treeOps
│  │     ├─ move-blocks.test.ts                  NEW  id preservation / collision remap / migration
│  │     └─ roundtrip.test.ts                    NEW  Phase-4 accept→undo battery
│  ├─ proposal-ops.ts                                 (untouched — protocol calls it)
│  ├─ patch-ledger.ts                            mod  +compound entry {patchIds[]} + batched undo
│  ├─ bundle.ts                                  mod  +createDocBundle/deleteDocBundle helpers
│  ├─ docs-tree.ts                               mod  exclude .changesets/ from the walk
│  ├─ routes.ts                                  mod  +5 routes (/api/changesets, accept/reject/undo)
│  ├─ agent-tools.ts                             mod  +changeset_list/_stage, move_blocks
│  ├─ store.ts / index.ts                        mod  wiring + exports (./changesets subpath export)
│  └─ __tests__/                                 mod  audit-exclusion coverage
│
├─ packages/docs-kernel/src/
│  ├─ docs-edit-session/
│  │  ├─ tools.ts                                mod  propose_ops(+docPath), +propose_move_blocks
│  │  ├─ service.ts                              mod  touchedDocPaths busy-ness, cross-doc accept-all,
│  │  │                                               auto-persist record, changeset events
│  │  └─ __tests__/                              mod  overlap-409, rollback, propose_move_blocks e2e
│  └─ docs-edit-session-api.ts                   mod  changeset passthrough routes + SSE events
│
├─ packages/docs-viewer/src/lab/
│  ├─ changeset/                                 NEW  ← the UI slice; props-only, no fetches
│  │  ├─ changeset-model.ts                      NEW  pure derivations: counts, staleness, progress
│  │  ├─ ChangeSetCard.tsx                       NEW  PR card: rows, chips, Accept/Reject/Undo
│  │  └─ __tests__/changeset.test.tsx            NEW
│  ├─ session/doc-edit-session.ts                mod  +DocChangeSet types, +docPath on request/proposal
│  ├─ annotate/PanelQueue.tsx                         (untouched — card mounts via existing children slot)
│  └─ index.ts                                   mod  re-export the changeset slice
│
├─ packages/docs-workbench/web/src/
│  ├─ lab/
│  │  ├─ doc-lab-changesets.ts                   NEW  fetch/overlay helpers (keeps the controller lean)
│  │  ├─ doc-lab-controller.ts                   mod  changeset state + SSE overlay
│  │  ├─ docs-kernel-client.ts                   mod  +changeset transport
│  │  ├─ docs-kernel-session-source.ts           mod  +changeset-updated reduction
│  │  ├─ target-label.ts                         mod  doc prefix for cross-doc targets
│  │  ├─ DocLab.tsx                              mod  mount ChangeSetCard in the transcript slot
│  │  └─ __tests__/                              mod
│  ├─ data/api.ts                                mod  +changeset client fns
│  └─ pages/DocPage.tsx                          mod  row-click cross-doc navigation, AI mode preserved
│
└─ packages/docs-model/                               (untouched — the design's explicit goal)
```

Slice rule (matches the lab convention): the four NEW clusters are
self-contained verticals; every `mod` outside them is a mount point, a wire,
or an additive type. Removing the feature = delete the clusters, revert ~14
small edits. No change-set logic in `proposal-ops.ts`, `PanelQueue.tsx`, or
DocPage beyond mounting and navigation.

## 6. Build phases — changes and testing strategy

Cross-phase testing doctrine (applies to every phase):

- **Pure logic** tests colocated in each slice's `__tests__/` (the lab
  convention) — no server, no DOM.
- **Server integration** tests run against a tmp docs root (the existing
  docs-server test pattern) — real files, real sidecars, real hashes.
- **UI** tests in happy-dom assert semantics and data attributes, never
  computed styles (standing gotcha: happy-dom drops `var()`/`calc()`).
- **Phase acceptance** is a LIVE check in the preview browser or via curl
  against a booted stack — a phase is not done on unit tests alone.
- **Regression gate** closes every phase: full docs-system suite at or above
  the running baseline (at time of writing: workbench+viewer 796/4/0,
  model+server 638/0, docs-server+kernel 164+20, agent-kernel kernel 411),
  `tsc --noEmit` clean. Update the pinned numbers here as phases land.

### Phase 1 — Cross-doc staging

**What changes**

| Where | Change |
|---|---|
| docs-kernel `docs-edit-session/tools.ts` | `propose_ops` gains optional `docPath` (docs-root confinement validated; defaults to the session doc) |
| docs-kernel `service.ts` | session tracks `touchedDocPaths: Set`; busy-ness = set overlap (launch 409s `agent-busy` on any intersection); accept-all iterates proposals in staging order ACROSS docs via in-process per-doc `acceptBundleProposal`, collecting patch ids; on failure, replay collected inverses newest-first (prefix rollback) |
| docs-viewer `lab/session/doc-edit-session.ts` | additive `docPath?` on `DocEditProposal`/`DocEditRequest` |
| docs-viewer target labels | doc prefix when a target's doc ≠ the open doc (`architecture/20-… → North Star`) |
| docs-workbench controller | kernel-session SSE overlay carries cross-doc proposals; static (sessionless) projection stays per-doc — documented limitation until Phase 2 |
| docs-server | nothing structural (`proposal_stage` is already per-docPath) |

**Testing strategy**

1. Kernel unit: `propose_ops` with `docPath` writes the OTHER doc's
   `proposals.json`; path-escape (`../`) rejected; busy-ness overlap 409
   (two sessions touching one shared doc), disjoint sessions coexist.
2. Kernel integration (tmp docs root): stage into A and B, accept-all →
   both docs mutated in order; then the rollback test — stage A+B, mutate
   B's hash between stage and accept, accept-all → **A's bytes and hash
   restored exactly**, session reports the failed entry, both proposals
   still `staged`/stale.
3. Contract: all existing single-doc session tests pass unmodified (the
   `docPath` field is additive).
4. UI unit: queue with mixed-doc entries renders doc-prefixed labels;
   same-doc entries unprefixed.
5. Acceptance (live): boot kernel + UI; session opened on doc A stages a
   proposal into doc B via curl; browser visit to doc B shows its staged
   region with zero UI changes beyond labels.

### Phase 2 — Change-set record + PR card

**What changes**

| Where | Change |
|---|---|
| docs-server NEW `src/changesets/` | `changesets-sidecar.ts` (atomic, mutexed CRUD over `docs/.changesets/*.json`); `changeset-ops.ts` (create/list/get + the accept protocol: path locks ordered by path, ordered entry accepts, treeOps at recorded positions, prefix rollback, compound ledger entry on full success; reject; compound undo); per-entry staleness computed on read |
| docs-server `bundle.ts` / tree | `create-doc` / `delete-doc` executors (reuse `moveDoc` for moves); rollback inverses for each treeOp kind |
| docs-server `patch-ledger.ts` | compound entry `{patchIds[]}` + batched undo |
| docs-server `routes.ts` | `GET /api/changesets`, `POST /api/changesets`, `POST /:id/accept`, `POST /:id/reject`, `POST /:id/undo` (existing error conventions: 409 hash / 423 lock / 404) |
| docs-server `agent-tools.ts` | `changeset_list`, `changeset_stage` |
| docs-tree + docs-cli audit | exclude `docs/.changesets/` from the bundle walk and audit (mirror `.index/`) |
| docs-kernel | cross-doc sessions auto-persist a record on first cross-doc proposal; `changeset-updated` SSE events; API passthrough |
| docs-viewer NEW `lab/changeset/` | `changeset-model.ts` (pure: per-doc add/del counts from proposals, staleness, progress) + `ChangeSetCard.tsx` (rows, chips, Accept/Reject/Undo, progress state) |
| docs-workbench | `data/api.ts` changeset fns; controller changeset state + SSE overlay; `DocLab` mounts the card in the transcript slot; DocPage row-click → navigate to that doc **preserving AI mode** |

**Testing strategy**

1. Server unit (tmp root): sidecar round-trip; accept happy path — N docs
   mutated, ONE compound ledger entry, originating annotation gets
   `agentRun` + resolved; reject leaves every doc byte-identical;
   mid-sequence failure → full prefix rollback, record stays `open`,
   per-entry statuses reported; compound undo restores all docs.
2. TreeOps: create/move/delete each covered, including rollback of a
   move-doc that had already applied when a later entry failed.
3. Concurrency: two overlapping change-sets accepted concurrently — ordered
   path locking means no deadlock, loser gets a clean 409/stale result
   (deterministic assertion, not a timing flake).
4. Corpus hygiene: with a populated `.changesets/`, `docs-cli audit` and
   `links check` report zero issues and the tree route omits it.
5. UI unit: card derivations (counts, staleness, progress after a partial
   per-doc accept); callback wiring; happy-dom semantic assertions only.
6. Controller integration: mocked client + SSE event stream → card state
   transitions (open → accepting → applied / failed-with-rollback).
7. Acceptance (live): seed a two-doc change-set, card renders in the AI
   transcript with correct counts; row click jumps docs without leaving AI
   mode; Accept mutates both docs (verify content via API); Undo restores
   both; harness follow-up — `bun run docs:check` + repo-policy tests in
   gamecube-decomp-harness still green against live packages.

### Phase 3 — `move_blocks` + merge/split (the annotate-and-move flow)

**What changes**

| Where | Change |
|---|---|
| docs-server `changesets/move-blocks.ts` | generator: dest `insertBlock` ops with the SAME block ids (collision check → fresh-id fallback + remap table), source `deleteBlock` ops, annotation-migration step (sidecar entries move source→dest inside the accept transaction, remap applied), link-retarget entries built from docs-index inbound links — all wrapped as one change-set |
| docs-index | helper: enumerate inbound links to a set of block ids / a doc |
| docs-server `agent-tools.ts` | `move_blocks` tool |
| docs-kernel tools | `propose_move_blocks(sourceDocPath?, blockIds, destDocPath, destPosition)` |
| compositions | `merge_docs(a,b)` = move all root children + `delete-doc` + retarget; `split_doc` = `create-doc` + `move_blocks` |
| docs-writer catalog | prompt addendum ("move/merge/split use propose_move_blocks; never hand-copy across docs") — regenerate via `render-prompts`, update pinned gate-test prose in the same change |

**Testing strategy**

1. Generator unit: output shape (paired proposals, id preservation);
   forced-collision case → fresh ids AND the remap table flows through to
   annotation migration (this is the risk-register item — test it first).
2. Integration (tmp root, the core guarantee): move blocks A→B, accept →
   B contains the blocks **with the same ids**; annotations that targeted
   them now live in B's sidecar and pass dangling detection; A's sidecar no
   longer has them; docs-index rescan shows zero broken inbound links;
   compound undo restores docs, sidecars, AND links to the pre-move state.
3. Text-range targets: a range annotation on a moved block survives with
   offsets intact (offsets are block-relative, so this should be free —
   pin it with a test anyway).
4. Merge/split: corpus-fixture tests — merge then `links check` = 0 errors
   and A is gone; split produces a bundle that passes `docs-cli audit`.
5. Kernel: `propose_move_blocks` end-to-end with a scripted spawn stub —
   request in, change-set staged, session events carry it.
6. Prompt gates: `render-prompts --check` green; TUI dry-boot if the
   catalog manifest changed.
7. Acceptance (live, THE demo): in the browser — annotate a section on one
   doc with "move this to <other doc>", agent session produces the PR card,
   Accept, then visually verify: content present in the destination with
   its annotation intact and openable, gone from the source, inbound link
   followed to the new home. Then Undo and verify full restoration.

### Phase 4 — Hardening

**What changes**: retention decision implemented for applied/declined
records; per-entry staleness chip polish; failure-message wording pass;
corpus docs — a change-set page under `10-system-design/30-data-model/` and a
mutation-model addendum, goldens regenerated via the documented one-off
script (never hand-edited); this design record updated to as-built.

**Testing strategy**

1. Round-trip battery: a seeded table of multi-doc op batches (including
   treeOps and moves) each run through accept→undo asserting byte-identical
   docs, sidecars, and index state — the closest thing to a fuzz pass
   without nondeterminism in CI.
2. Corpus-wide `docs-cli audit` + `links check` = 0/0 with change-set
   history present.
3. Full cross-repo sweep: every docs-system package, agent-kernel kernel
   suite, harness `docs:check` + repo-policy + `ui:check`.
4. Manual preview audit against the light theme (the standing bar): card in
   both themes, no layout shifts entering AI mode, scrollbar and composer
   behavior untouched from the shipped baseline.

## 7. Open decisions (decide in the build thread)

1. **Accept semantics** — recommended: single Accept with rollback (PR merge
   button) + per-doc escape hatch. Alternative: checklist-only. Ford leaned
   PR-metaphor in the design conversation.
2. **Implicit vs explicit change-sets** — recommended: any cross-doc session
   auto-persists a record; single-doc sessions stay recordless.
3. **`.changesets/` retention** — keep applied/declined records as history, or
   prune on resolve? (Recommended: keep; they're the PR history.)
4. **Link-retarget scope** — inbound links only (recommended for v1) vs also
   rewriting outbound relative references inside moved blocks.

## 8. Execution notes for the build thread

- Build order phases 1→2 can fan out in parallel after the Phase-1 server
  contract is pinned; Phase 3 depends on both.
- Conventions in force: implementation via `codex exec` (Terra/medium for
  copy-adapt, Sol/low wiring, Sol/xhigh only for the accept/rollback
  protocol); ALWAYS append `< /dev/null` to codex invocations; repo-local
  `bun install` fails on workspace:* — install from Core root; goldens are
  regenerated via one-off `serializeDocDocument` → `projectToMarkdown`
  scripts, never hand-edited.
- The gamecube-decomp-harness consumes this live via `link:../Core/...` —
  run its `bun run docs:check` + repo-policy tests after Phase 2 lands.
