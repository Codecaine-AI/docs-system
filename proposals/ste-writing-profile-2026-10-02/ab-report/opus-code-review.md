# docs-style code review (Opus, independent)

Date: 2026-10-02. Scope: `packages/docs-style` (all of `src/`, `baml_src/`, and the generated-client match), the `docs style` wiring in `packages/docs-cli/src/index.ts`, the two new `docs-model` exports, and the root `package.json` / `tsconfig.json` edits. `src/report` got a light pass only.

**The code changed while I reviewed it.** Other workers landed fixes between 11:50 and 12:02, so every finding below was re-run against the code as of 12:02. A copy of `src/` at 11:58 is in `/tmp/ds-review/snapshot-1158/`. The section "Fixed while I reviewed" lists the earlier findings that no longer reproduce.

The review was read-only on the repo. Scratch scripts:

- `/tmp/ds-review/`: mine
- `/tmp/ds-review-a/`: the autofix sub-review
- `/tmp/ds-review-b/`: the judge and rewrite adapter sub-review

## Verdict

**Not safe yet for a staged full pass.** **An autofix-only staged pass is close.**

1. **Blocker: the staging contract.** Each change's `ops` hold absolute insert indexes that assume every earlier change on the page was applied. Proposals are hash-pinned, and `PageResult` records no base hash. So per-change review either goes stale (accept, then accept) or silently misplaces bullets (reject, then accept). See B1. `docs style stage` is not implemented yet, so this must be settled before it is.
2. **The cheap guardrails no longer miss deletions, but they still miss additions, swaps, and permutations.** The `content-coverage` check landed at about 12:00 and now catches every deletion and content-word swap in my set. Still, 20 of 34 adversarial edits pass every cheap check and rest on the Jev fact check alone. Those 20 are added claims, invented links, intensifiers, closed-class swaps (before/after, every/some, can/must, and/or), number and role swaps, code-span swaps (including inside an unflagged sentence), and malformed model output. See H1 to H3.

**Autofix:** the unsafe profile rows were demoted to "flag" during the review, and the 41 corpus autofixes that remain look clean. The rest of the autofix risk is latent: plain-text identifiers, ALL-CAPS words, bold or italic mentions, and headings (A1, A2). Add an autofix re-lint guard first.

## Checks run

| When | Check | Result |
| --- | --- | --- |
| Start (11:20) | `bun test packages/docs-style` | 180 pass, 0 fail, 30 files |
| Start | `bunx tsc --noEmit -p .` | Only the 2 known `docs-server/src/agent-tools.ts` errors |
| Start | `bun run docs style lint` | Works through docs-cli: 113 pages, 2,428 findings, about 1 s |
| Sub-review B | `bun test …/judge …/rewrite` | 15 of 15 pass. The generated `baml_client` matches `baml_src`. |
| End (12:01, mid-edit by other workers) | `bun test packages/docs-style` | 193 pass, **6 fail**: 5 sweep tests that assume a run without a judge accepts rewrites, plus 1 other |
| End | `bunx tsc --noEmit -p .` | **1 new error:** `src/report/fixture.ts:48` lacks the new GuardrailIds `content-coverage` and `sentence-shape` |

The end failures belong to the in-flight guardrail change, not to a regression I found. Re-run both checks once that change settles.

## Fixed while I reviewed (verified at 12:02)

| Earlier finding | Now |
| --- | --- |
| Unsafe autofix rows | `remain`, `locate`, `finish`, `begin`, `data shape`, `simply`, `basically`, `actually`, `essentially` are now `flag` (`profile/replacements.ts`). Corpus autofixes went from 145 blocks (159 edits, of which sub-review A judged 10 meaning-changing and 7 questionable) to 41 blocks. I read all 41, and they are clean (retain→keep, execute→run, happen→occur, alter→change). |
| 84% of rewrites skipped `smallest-edit` | Semicolon and em-dash findings are now split per sentence (`sweep/tier1.ts:16-26`). Whole-block jobs fell from 558 of 666 to 113 of 646. |
| Deletions passed within a 20% budget, a parenthetical counted as one word, and labels were dropped | `guardrails/content-coverage.ts`: any lost content-word lemma rejects. That catches dropped clauses, sentences, list items, parentheticals, and labels ("Why:", "Rejected alternative:"), plus antonym swaps (warm→cold) and truncation inside a word. |
| A rewrite with no fact check was accepted (`--no-judge`, or Jev down) | `fact-check.ts:58-66`: the check now fails without an answer. `needsReview` is deprecated. |
| Numbered-step blocks ("2. Preview…") lost their number on restore | `rewrite/protect.ts` (11:53) keeps the step number as text. Verified with `/tmp/ds-review/numbered2.ts`. |
| Rewrite policy spread through the sweep | `sweep/core-rules.ts` plus `StyleRule.rewrite: "rewrite" \| "list" \| "hold"`. A new `ste.broken-sentence` rule holds damaged text for a person. |

## Open findings, ranked

Severity:

- **blocker:** must fix before a staged full pass.
- **high:** lets a meaning-changing or junk edit pass every cheap check, or breaks a full run.
- **medium:** wrong behavior with limited blast radius.
- **low:** hygiene.

### B1. blocker: change ops are order-coupled, unpinned, and can write one block twice

- **Where:**
  - `src/sweep/tier3.ts:392-408` (`applyRewrites` builds each rewrite's ops against the page with every earlier rewrite applied)
  - `src/rewrite/ops.ts:30-33` (absolute insert `index`)
  - `src/types.ts:311-312` (the contract says "the ops a full pass would stage for this change")
  - `src/types.ts:315-329` (`PageResult` has no base hash)
  - `docs-server/src/proposal-ops.ts:305` (accept refuses a proposal whose `baseHash` moved)
- **Reproduced on current code (`/tmp/ds-review/order2.ts`):** a page `p1 p2 x1 x2 x3`, and both paragraphs get lead-plus-bullets rewrites.
  - `p2`'s ops insert at root index 5, 6, 7, because `p1`'s three bullets came first.
  - Reject `p1`, then accept `p2`. The page hash did not move, so `p2` is not stale. Its bullets land at `p1 p2 x1 x2 x3 p2-r0 p2-r1 p2-r2`, three paragraphs away from their lead, with no error.
- **The other orders:**
  - Accept `p1`, then `p2`: `p2` is stale and cannot apply.
  - An autofix and a rewrite on one block: the rewrite's `updateBlock` text already holds the autofix, so rejecting the autofix while accepting the rewrite applies the autofix anyway.
  - Sweep, edit, then stage: `updateBlock` replaces the whole text, and nothing records the hash the ops were built from. Staging later silently reverts the edit.
- **Fix:** pick one model and put it in the types.
  - Simplest: one proposal per page, with ops in `changes` order, plus `PageResult.baseHash`. The stage step refuses a page whose hash moved.
  - For per-change review, build each change against the page as loaded, record its anchor (insert after block X), and resolve the index at accept time. Fold an autofix into the rewrite change of the same block.

### H1. high: additions pass every cheap check

- **Where:**
  - `src/rewrite/protect.ts:78-98`: `restoreLine` keeps any link, code, or mark span that `inlineToDelta` builds from model output, and any `⟦` that is not `⟦digits⟧`.
  - `content-coverage` checks losses only.
  - `fact-ledger` checks only that original facts survive.
  - `shrink-limit.ts` lets growth pass.
  - `slop.ts` is a fixed word list.
- **Reproduced on current code (`/tmp/ds-review/final.ts`, rows 25 to 30 and 34):**
  - "…reads every page in under a second and is safe to run in production"
  - `[the style guide](https://example.com/style)`
  - "significantly"
  - ", which keeps every run fast and predictable"
  - "Importantly,"
  - "(see the cache guide)"
  - An echoed evidence placeholder `⟦…⟧`. `tier3.ts:207` puts `⟦…⟧` in the prompt, and `restoreSpans` reports ok.
- **Fix:** an "additions" guardrail that is the mirror of `content-coverage`.
  1. No new content-word lemma outside a short connective list and the block's own words.
  2. No span with `link`, `code`, or `reference` that did not come from a token, and no new bold or italic.
  3. No `⟦` or `⟧` after restore.

  My prototype (`/tmp/ds-review/newwords.ts`) of rule 1 plus a loss check caught 16 of 19 lossy cases with 0 false rejects on 8 faithful splits, passives, and condition moves.

### H2. high: closed-class swaps and permutations pass, including code spans in an unflagged sentence

- **Where:**
  - `content-coverage` counts only NOUN, PROPN, VERB, ADJ, ADV, and NUM (`content-coverage.ts:20`).
  - `meaning-words.ts:11-17` tracks a fixed list, and lets `must`, `if`, and `all` grow.
  - `fact-ledger.ts` compares numbers and code facts as sets (`:146-160`).
  - `smallest-edit.ts:20-22` compares `proseText`, where every code or reference span is the same `"\u0000"`.
- **Reproduced on current code (rows 10, 12, 14 to 18, and 20 to 23):**
  - "before" to "after"
  - "nothing" to "everything"
  - "every" to "some"
  - "can" to "must"
  - "and" to "or"
  - "30 seconds … 3 retries" to "3 seconds … 30 retries"
  - "5 and 5" to "5 and 50"
  - "Only admins can publish drafts" to "Admins can publish only drafts"
  - "The client calls the server" to "The server calls the client"
  - "Copy `config.local.json` over `config.json`" to the reverse. Row 23 does this inside an unflagged sentence, and `smallest-edit` reports "kept 1 unflagged sentences".
- **Fix:**
  1. `smallest-edit` and sentence keys compare literal identity: write each literal as `\u0000<token index>`, not a bare `\u0000`.
  2. Track order-sensitive closed-class words as meaning words: before, after, until, since, every, each, some, any, nothing, everything, can, must, may, and, or, more, less, first, last. Drop `must` from `MAY_INCREASE`, or allow growth only for the word the target rule names.
  3. For split-only fixes (semicolon, em dash, list-item-sentences, sentence-length), require content words and numbers to keep their order across the rewrite: an LCS of at least 95% per original sentence. Passive and condition-first fixes may reorder only inside the flagged sentence.
  4. Compare numbers as a multiset, not a set.

### H3. high: a truncated or malformed model answer becomes doc text

- **Where:** `src/rewrite/baml.ts:113-124` and `:128-141` set no `finish_reason_allow_list`. `:77` returns `result.markdown` unchecked. The file has not changed since 10:55.
- **Reproduced:**
  - BAML's lenient parser returns the partial string of a `finish_reason: "length"` reply (sub-review B demo5, demo9).
  - `content-coverage` now catches a cut inside a word, row 31. A cut that loses only the final period or stop words still passes.
  - Array- or wrong-key-shaped JSON becomes text, as in `"[The sweep reads every page., It writes one report …]"`. That passes every cheap check on current code (row 32), and so does a literal `\n` (row 33).
- **Fix:**
  - Add `finish_reason_allow_list: ["stop"]` to both client option sets. Sub-review B verified that BAML then throws.
  - Validate the reply shape, `{markdown: string}`.
  - Reject output that starts with `[` or `{`, or holds a literal `\n`, when the original did not.
  - Require terminal punctuation on the last block when the original had it.

### H4. high: Jev reliability on a full pass

- **Where:** `src/judge/jev.ts:138-142` retries only 429 and 529, once, with no jitter. `:175-179` throws `JudgeUnavailable` when every question in one call fails. `src/sweep/index.ts:53-56` then turns Tier 2 off for every later page.
- **Effect:**
  - One 503 or timeout on a page with one question disables Tier 2 for the rest of the run (sub-review B demo1). Across thousands of calls that is near certain.
  - After that, judge-only structure rules never fire, and passive matches stand unconfirmed and get rewritten.
  - The fact check is now mandatory, so a Jev outage rejects every rewrite after spending both model attempts on it.
  - Partial answers are silent: `jev.ts:175` drops failed keys, and no result field records asked versus answered.
- **Fix:**
  - Retry 5xx, timeouts, and network errors 2 to 3 times with jittered backoff.
  - Raise `JudgeUnavailable` only for a missing key, 401 or 403, or N consecutive failed calls.
  - Stop Tier 3 when Jev is down instead of burning model calls.
  - Record `{asked, answered, failed}` per page.

### H5. high: the passive-voice hint tells the model to invent an instruction

- **Where:** `src/rules/passive-voice/index.ts:22` says "in an instruction, tell the reader what to do ('Save the file')". `baml_src/rewrite.baml:79-80` says "If no actor follows 'by', keep the passive. Never invent an actor." Detect flags exactly the agentless passives in instructions (`:28-30`).
- **Scenario (sub-review B demo11):** "Run the link check after the page is published." became "Publish the page, then run the link check." That adds an instruction the author never gave, and content-coverage keeps "publish", so it still passes the cheap checks.
- **The other outcome:** if the model obeys the prompt, the passive stays and `fixes-target` fails twice, which wastes both calls.
- **Fix:**
  - Hint the condition-first form ("After the page is published, run…").
  - Or stop sending agentless instruction passives to Tier 3.
  - Put the detected phrase in the judge state.

### A1. medium (autofix): no re-lint guard, and headings lose Title Case

- **Where:** `src/sweep/autofix.ts:12` (headings are autofixed), and `:39-55` (no check that the fix adds no findings).
- **Reproduced through `sweep` (`/tmp/ds-review/heading.ts`):** "Ensure That Builds Pass" became "Make sure That Builds Pass". That adds a `structure.heading-title-case` finding, 0 → 1, and docs-mcp gates `docs_check` on that rule (`docs-mcp/src/lint-feedback.ts:16`).
- **Sub-review A, still on current code:**
  - "Regex in Search" → "Regular expression in Search"
  - "Data Set" → "Dataset"
  - "Mock Up Screens" → "Mockup Screens"
- **Links are safe:** `SpectreRef.section` holds a block ID, not heading text.
- **Fix:**
  - Re-lint the autofixed block and refuse the fix if any rule fires more often, the same `no-new-findings` test rewrites get.
  - Or drop `heading` from `AUTOFIX_TYPES`.

### A2. medium (autofix): identifiers, ALL-CAPS words, mentions, and idioms are edited as prose

Reproduced on current code (`/tmp/ds-review-a/adversarial.ts`, `/tmp/ds-review/heading.ts`). Each item is input → current output:

- **Plain-text identifiers are renamed:**
  - "Call retain() on the handle." → "Call keep() on the handle."
  - "retain=true" → "keep=true"
  - "retain: true" → "keep: true"
- **ALL-CAPS words get wrong casing:**
  - "Run ALTER TABLE…" → "Run Change TABLE…"
  - ", AKA the server" → ", Also known as the server"
  - "N/A" → "Not applicable"
  - "NEVER UTILIZE THE CACHE." → "NEVER Use THE CACHE."
- **Mentions are edited:**
  - "Replace **utilize** with **use**." → "Replace **use** with **use**."
  - "The word *utilize*…" → "*use*"
  - 'On a 27" monitor, never write "utilize"' → "use". The stray inch mark shifts quote pairing.
- **Meaning-changing swaps:**
  - "Mock up the screen" → "Mockup the screen", a verb turned into a noun
  - "Move the mouse over the button" → "Move the hover over the button"
  - "As it happens," → "As it occurs,"
  - "Whatever happens" → "Whatever occurs"

Where the code lives:

- `src/rules/replacement/match.ts` (quote pairing about `:105-109`, casing about `:81` and `:98-114`)
- `src/text/inflect.ts:147-150`
- `src/profile/replacements.ts` (the `mouse over`, `mock up`, and `happen` rows)

**Fix:**

- Skip a match followed by `(`, `=`, or `:`, or a word with `_` or a dot.
- Skip ALL-CAPS matches.
- Treat a bold or italic deny-list word as a mention.
- Require a non-letter after a closing quote.
- Demote `mouse over` and `mock up` to `flag`, and autofix `happen` only as a plain intransitive verb.
- No corpus page is affected today.

### M1. medium: whole-block license remains for list-item-sentences and every judge-only finding

- **Where:**
  - `src/sweep/tier3.ts:143` (`wholeBlock` when any trigger lacks `sentence`)
  - `src/sweep/tier2.ts:81-96` (judge-only findings for one-topic, one-instruction, and condition-first never carry a sentence)
  - `src/guardrails/findings.ts:29` (`fixes-target` skips when no Tier 1 count exists)
- **Effect:**
  - The model gets "All sentences. The findings cover the whole block." (`rewrite.baml:118-119`).
  - `smallest-edit` is skipped, and `fixes-target` is skipped for judge-only triggers.
  - That leaves 113 Tier 1 jobs (paragraph-length 60, list-item-sentences 53, dense-paragraph 2) plus every Tier 2 job.
- **Fix:**
  - `list-item-sentences` is a pure move: treat every sentence as unflagged but movable.
  - Pin sentences for judge-only rules. condition-first's `select` already finds them, and one-instruction already builds a sentence array.

### M2. medium: the rewrite request leaks pre-autofix, unmasked evidence

- **Where:** `src/sweep/tier3.ts:204-211` with `tier2.ts:92`. A Tier 2 finding's evidence is the original block's markdown, before autofix, with raw backticks and link syntax. `requestEvidence` forwards up to 200 characters of it.
- **Effect:**
  - The model sees code text the tokens hide, and wording the autofix already changed.
  - Code spans in the evidence render as `⟦…⟧`, which H1 shows can land in the doc.
- **Fix:** send no evidence for whole-block findings. Otherwise send masked text from the current block.

### M3. medium: a sweep is all-or-nothing, and a hung rewriter has no breaker

- **All-or-nothing:**
  - **Where:** `src/sweep/index.ts:72` and `:95` (`Promise.all`), and `tier3.ts` `runRewrite` (`protectSpans`, `planRequest`, `restoreSpans`, and `renderBlocks` run outside any try).
  - **Effect:** one unexpected throw rejects the whole sweep after hours of paid calls, and nothing is written. `sweep.json` is written only at the end.
  - Sub-review B also found that a throwing `select` or `state` skips Tier 2 for the whole page.
- **No breaker:**
  - **Where:** `src/rewrite/baml.ts:50` caches the probe route for the run, and `RewriteRetry` retries every HTTP error, a 401 included.
  - **Effect:** a hung codex-lb costs about 4.6 minutes per block (sub-review B demo7), and one missed 1.5 s probe fails every block.
- **Fix:**
  - Catch per job and per page, recording an `error` change.
  - Checkpoint results to JSONL.
  - Add a shared breaker after K consecutive timeouts or 5xx errors.

### M4. medium: design seams

- **A rule slice imported by other slices:** `rules/filler/index.ts:8` and `rules/modal-verbs/index.ts:9` import `denyListRule` from `../replacement/match`. The deny-list engine is shared infrastructure, so move it to `src/rules/shared/` or `src/text/`.
- **Duplicated logic:**
  - `applies()` (`tier2.ts:75-78` and `judge/judge-blocks.ts:12-15`)
  - `messageOf()` (`sweep/index.ts` and `tier3.ts`)
  - three whitespace `collapse` helpers
- **Dead parameters:**
  - `VerifyInput.vocabularyOnly` is always `false` (`tier3.ts`).
  - `thresholds.rewriteRejectLimit` is never read.
  - `needsReview` is now a deprecated constant.
- **A question that misses its own rule:** one-instruction asks "does any one sentence" but passes a numbered step as one item (`rules/one-instruction/index.ts:35,40`). "Open the file. Save it." likely scores no, which is what the rule exists to catch.

### L. low: hygiene

- **Autofix gets the original span array.** `src/sweep/autofix.ts:33` passes `{ ...block, text }`, which is the page's own array for the first rule, although the comment says a rule cannot edit the page.
- **Retired `quote` blocks.** `validateDocDocument` coerces them to `paragraph` (`docs-model/src/doc-schema.ts:23-30`), so a future quote would be autofixed and rewritten. There are none live today.
- **Import-boundary test.** `import-boundaries.test.ts:12-20` does not list `packages/docs-style/src`.
- **Sentence-initial case.** `smallest-edit.ts:12` ignores the case of a sentence's first letter.
- **Cost.** `scratchRewrite` lints the whole page per attempt, which grows fast on long pages.
- **Grammar.** "E.g. run the check." becomes "For example run the check.", with no comma.

## Adversarial guardrail results

**Method:**

- Each row runs the real pipeline: Tier 1, autofix, `planRewrites`, protect and restore, scratch ops, re-lint, and `verifyRewrite`.
- A fake model returns the edit, and no judge runs.
- "Jev only" means every cheap check passed, so the Jev fact check alone decides.
- Script: `/tmp/ds-review/final.ts`. The 11:40 column comes from my earlier scripts (`adv*.ts`, `label.ts`, `slop2.ts`, `swap-unflagged.ts`, `shape.ts`, `echo.ts`) and sub-review B's `demo9`.

| # | Edit | 11:40 | 12:02 (current) |
| --- | --- | --- | --- |
| 1 | Drop a fact-free clause | Jev only | caught: content-coverage |
| 2 | Drop a clause inside the flagged long sentence | Jev only | caught: content-coverage |
| 3 | Drop 1 of 5 sentences (paragraph-length) | Jev only | caught: content-coverage |
| 4 | 6 semicolon steps → lead + 5 bullets | Jev only | caught: content-coverage |
| 5 | Drop an inline list item | Jev only | caught: content-coverage |
| 6 | Drop a fact-free parenthetical | Jev only | caught: content-coverage |
| 7 | Drop a label "Why:" | Jev only | caught: content-coverage |
| 8 | Drop "Rejected alternative:", turning it into a claim | Jev only | caught: content-coverage |
| 9 | warm → cold | Jev only | caught: content-coverage |
| 10 | before → after | Jev only | **Jev only** |
| 11 | more than → less than | Jev only | caught: content-coverage |
| 12 | nothing → everything | Jev only | **Jev only** |
| 13 | always → sometimes | Jev only | caught: content-coverage |
| 14 | every → some | Jev only | **Jev only** |
| 15 | can → must | Jev only | **Jev only** |
| 16 | and → or | Jev only | **Jev only** |
| 17 | Swap two numbers (30 s, 3 retries) | Jev only | **Jev only** |
| 18 | Change one copy of a repeated number (5, 5 → 5, 50) | Jev only | **Jev only** |
| 19 | three → two | Jev only | caught: content-coverage |
| 20 | Move "only" to another noun | Jev only | **Jev only** |
| 21 | Swap roles (client calls server ↔ server calls client) | Jev only | **Jev only** |
| 22 | Swap two code spans | Jev only | **Jev only** |
| 23 | Swap two code spans in an **unflagged** sentence | Jev only | **Jev only** |
| 24 | "Jev answers…" → "The model answers…" | Jev only | caught: content-coverage |
| 25 | Add a claim | Jev only | **Jev only** |
| 26 | Add an invented link | Jev only | **Jev only** |
| 27 | Add "significantly" | Jev only | **Jev only** |
| 28 | Add ", which keeps every run fast and predictable" | Jev only | **Jev only** |
| 29 | Add "Importantly," | Jev only | **Jev only** |
| 30 | Add "(see the cache guide)" | Jev only | **Jev only** |
| 31 | Truncated answer ("…the shared fol") | Jev only | caught: content-coverage |
| 32 | Array-shaped answer "[A., B.]" | Jev only | **Jev only** |
| 33 | Literal "\n" in the answer | Jev only | **Jev only** |
| 34 | Echoed placeholder "⟦…⟧" | Jev only | **Jev only** |
| 35 | Add "may" (control) | caught: no-new-findings | caught: no-new-findings |
| 36 | Drop a digit number (control) | caught: fact-ledger | caught: fact-ledger, content-coverage |
| 37 | Change an unflagged sentence (control) | caught: smallest-edit | caught: smallest-edit |
| 38 | Faithful semicolon split (control) | passes | passes |

**Summary:**

- At 11:40, 34 of 34 adversarial edits passed the cheap checks.
- At 12:02, 20 of 34 still do. Every one of the 20 is an addition, a closed-class or permutation swap, or malformed output.
- The Jev fact check is calibrated on 29 pairs with none of these shapes. Turn rows 10 to 34 into a regression set and measure Jev's recall on it before you treat it as the backstop.

## Fix plan, ranked by value per hour

| Fix | Effort |
| --- | --- |
| B1: one proposal per page, `PageResult.baseHash`, and a stale-page refusal in `stage` | About 2 hours |
| H3: `finish_reason_allow_list`, reply-shape check, bracket, backslash, and terminal-punctuation guards | About 30 minutes |
| H2.1: literal identity in `smallest-edit` and sentence keys | About 1 hour |
| H1: additions guardrail (new content words, new spans, bracket characters) | About 3 hours, then calibrate on the pilot |
| H2.2 to H2.4: closed-class meaning words, order check for split-only fixes, number multiset | About 3 hours |
| H4 and H5: Jev retry and breaker, passive hint | About 2 hours |
| A1 and A2: autofix re-lint guard, then the identifier, caps, and mention skips | About 2 hours |

## Test gaps for critical behavior

- **B1:** no test applies one change's ops alone, out of order, or after a rejected earlier change.
- **H1, H2, H3:** no test for added spans or claims, closed-class swaps, number or code-span permutations, a literal swap in an unflagged sentence, or truncated and array-shaped replies. The table above should become a test file.
- **H4:** no test shows that one transient Jev failure keeps Tier 2 on, or that partial answers are recorded.
- **A1:** no test that an autofix may not add a finding (heading Title Case).
- **A2:** no test for identifiers, ALL-CAPS words, or bold and italic mentions.

## Wiring (docs-cli, docs-model, root)

- `docs-cli/src/index.ts`: `style` lazy-imports `@codecaine-ai/docs-style/cli` and sets `process.exitCode`. The usage line is added. Correct.
- `docs-model/package.json`: `./lint/engine` and `./writing/prose` point at existing files, and docs-style uses both. Fine.
- The root `package.json` adds the workspace and the test path, and `tsconfig.json` includes `docs-style/src` and `baml_client`. Correct.
- `docs style stage` prints "not implemented yet" and exits 2. That is correct today, and it means a staged pass cannot run yet.
