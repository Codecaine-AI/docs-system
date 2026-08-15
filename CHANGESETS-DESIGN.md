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

## 5. File tree (vertical slices)

```
docs-system/
├─ packages/docs-server/src/
│  ├─ changesets/                     ← NEW slice (owns everything change-set)
│  │  ├─ changeset-ops.ts             record CRUD, accept protocol, rollback
│  │  ├─ changesets-sidecar.ts        read/write docs/.changesets/*
│  │  ├─ move-blocks.ts               compound generator + migrations
│  │  └─ __tests__/
│  ├─ proposal-ops.ts                 (unchanged API; called by the protocol)
│  ├─ routes.ts                       +GET/POST /api/changesets, /:id/accept, /:id/reject
│  └─ agent-tools.ts                  +changeset_list/_stage, move_blocks
├─ packages/docs-kernel/src/
│  └─ docs-edit-session/              docPath on propose_ops, propose_move_blocks,
│                                     multi-doc locks, changeset events
├─ packages/docs-viewer/src/lab/
│  ├─ changeset/                      ← NEW slice (props-only UI)
│  │  ├─ ChangeSetCard.tsx
│  │  ├─ changeset-model.ts
│  │  └─ __tests__/
│  └─ session/doc-edit-session.ts     +DocChangeSet types
├─ packages/docs-workbench/web/src/lab/
│  ├─ doc-lab-controller.ts           +changeset state/overlay
│  ├─ docs-kernel-client.ts           +changeset transport
│  └─ DocLab.tsx                      mount ChangeSetCard in transcript slot
└─ docs/.changesets/                  ← runtime sidecar dir (gitignored? no —
                                        committed like annotations.json)
```

Slice rule (matches the lab convention): `changesets/` in docs-server and
`changeset/` in docs-viewer own their domain completely — no change-set logic
leaks into `proposal-ops.ts`, `PanelQueue.tsx`, or DocPage beyond mounting and
navigation.

## 6. Build phases

**Phase 1 — Cross-doc staging.** `propose_ops(docPath?)`, multi-doc session
locks, doc-prefixed queue labels, "Apply all" = ordered accepts with prefix
rollback (protocol without the record). *Accept:* session on doc A stages into
doc B; B shows regions; mid-sequence 409 rolls back cleanly.

**Phase 2 — The record + PR card.** Sidecar, 4 routes, compound ledger entry,
ChangeSetCard with jump navigation, changeset accept/reject/undo end-to-end,
treeOps (move/create/delete doc). *Accept:* full card lifecycle live,
audit/tree-walk ignores `.changesets/`.

**Phase 3 — move_blocks + compositions.** Generator with annotation
migration + link retargeting, `propose_move_blocks` session tool, docs-writer
prompt addendum, `merge_docs`/`split_doc`. *Accept:* live e2e — annotate
"move this section to X" → PR card → accept → content in X **with its
annotations intact** and inbound links retargeted; undo restores both docs.

**Phase 4 — Hardening.** Collision-fallback remap test, staleness chips per
entry, corpus docs page + goldens, suite sweep (baselines at time of writing:
workbench+viewer 796/4/0, model+server 638/0, docs-server+kernel 164+20,
kernel 411).

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
