# STE Docs Rollout Report

Run date: 2026-10-02. Owner-authorized, agent-reviewed. Nothing is committed or pushed.

## Result

- **1,402 changes applied** on 415 pages across 15 local doc corpora.
- **7 repairs** of older formatting damage. Tool names such as `docs_create` and the model name "Q4_K_M" had lost their underscores to italics before the rollout.
- **2 reverts** after the post-apply audit.
- **Meaning safety:** every change passed the automatic checks and three independent reviewers. A fourth audit (R4) then re-read every changed block on disk. R4 found 2 meaning-level problems in 1,388 blocks (0.14%), and both went back to their original text.

## Per Corpus

| Corpus | Changes | Pages |
| --- | --- | --- |
| docs-system | 457 | 98 |
| canvas | 189 | 44 |
| gamecube-decomp-harness | 174 | 90 |
| network-setup | 164 | 55 |
| agent-kernel | 153 | 34 |
| prompt-kit | 114 | 33 |
| Sotto | 87 | 20 |
| pen-plotter | 23 | 13 |
| variator | 12 | 8 |
| server-manager | 11 | 8 |
| workspace | 5 | 3 |
| budget | 5 | 2 |
| Objectives | 3 | 3 |
| second-brain | 3 | 2 |
| system-view | 2 | 2 |

## Review Funnel

Each phase counts only changes that had already passed every automatic check, including the Jev fact check and the Sol meaning verifier.

| Phase | Reached review | R1 approved | Applied after R2 and R3 |
| --- | --- | --- | --- |
| Machine pass (autofix and model rewrites) | 1,318 | 1,138 | 920 |
| Editor pass (Opus editors) | 552 | 508 | 482 |

A change was applied only when R1 approved it, R2 did not flag it, and R3 did not flag it. Each reviewer worked blind to the others.

## R4: The Post-Apply Audit

R4 compared each changed block on disk with its backup.
- **Reverted:** canvas `06-r6-fan#b-r6-clearance-5`. A split capitalized the lint id "covered-content".
- **Reverted:** docs-system `50-canvas#b-24-canvas-adapter-li-alone-a`. A split left the `routes.ts` citation covering only the second sentence.
- **Kept, markup only:** agent-kernel `40-viewer-model#…trace-15`. The change repeats a bold "TraceCard" in place of a double colon, and the meaning is the same.

A separate script also checked that the text on disk matches the approved text for every applied block.

## Pipeline Changes Made During the Rollout

- **Rewrite prompt v7:** the model checks each sentence before it edits. It keeps pronouns and "this X", never splits a list-introducing colon, a trailing citation, a scope phrase, or a short contrast, and returns the block unchanged when unsure. On 160 previously rejected blocks, v7 accepted 10, with 0 meaning changes. The cost is coverage: most structural findings on new corpora come back unchanged.
- **split-integrity guardrail (new):** fails a split that moves a colon lead-in, cuts a trailing citation, leaves clauses outside their scope phrase, repeats a subject, or capitalizes a lowercase identifier.
- **Guardrail fixes:** shrink-limit now counts every word inside parentheses. sentence-shape detects plural-subject verbs and hyphenated imperatives.
- **Word-swap guards:**
  - "attempt" changes only in "attempt to <verb>".
  - "purchase" never changes as a noun.
  - "initiate a connection" keeps its sense.
  - execute→run is skipped where "run" is a noun or a "runner" exists.
  - A word in a page heading or a capitalized name is never swapped.
  - A row can name corpora to skip.
- **Trigger policy:** ste.one-topic alone no longer starts a rewrite (29% of those were rejected).
- **Line-break guard:** a change that merges a "Decision", "Why", or "Applies to" line into another line is dropped before apply.

## Lessons

1. Bullet restructures fail. Editors turned peer facts into bullets under leads that do not introduce them, and the meaning verifier rejected 64% of those. Editors now work at sentence level only.
2. Simple words collide with project terms. Examples: "purchased" is a status in network-setup, "attempt" and "retained" are domain terms in gamecube, and "run" is an entity there.
3. Most split defects are scope defects: a leading phrase, a colon, a citation, or a pronoun that no longer covers what it covered.
4. Safety costs coverage. Prompt v7 and the strict editor rules leave many long sentences and semicolons as they are, mostly colon lists, "so" chains, and paragraphs already at 4 sentences.

## Side Effects to Know About

- **canvas:** the write saved 8 legacy blocks (type "constraint" or "decision") in the current callout format, with no text change. Both docs frameworks read them that way already.
- **Soft wraps:** 60 machine-pass blocks lost mid-sentence line breaks left over from markdown migration. The docs editor showed these as line breaks inside sentences, and they now flow. No structural line break was lost.
- **Goldens:** docs-system projection goldens were regenerated after each docs-system apply. docs-model passes 676 of 676 tests.
- **Page 85** (`10-system-design/10-doc-standards/85-style-enforcement`) now describes the system as built. It removed an old build plan, a Mistral row, and a Vale-export claim that the code no longer matches.

## Not Done

- **Skipped:** spectre, token-burner, email, and 47 of budget's 50 pages hold the owner's uncommitted work. youtube-capture's docs folder no longer exists.
- **Held for the owner:** client repos, personal-site writing, life-system, life-itself-interactive.
- **Owner calls:**
  - docs-system `40-docs-viewer#b-dv-mirror-a` has a double colon whose meaning is ambiguous.
  - Several canvas callouts carry legacy `status` or `severity` props that block any edit (audit error E6).

## Undo

Every apply wrote a backup first. Restore in reverse order, newest first. The full list with commands is in `.tmp/ste-rollout/STATUS.md`. Each line has this form:

```
bun run docs style restore --backup-dir .tmp/ste-rollout/backups/<corpus>/<run>
```

## Where the Records Are

`.tmp/ste-rollout/` (local, gitignored): review files for R1, R2, R3, and R4, batches, backups, decision files, editor jobs and answers, and the helper scripts.
