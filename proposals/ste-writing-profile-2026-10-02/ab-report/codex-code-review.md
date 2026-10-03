**Block approval until the six P1 content-preservation defects below are fixed.**

The rewrite path has three P1 defects. Each was reproduced through an in-memory sweep.

1. **P1 — Reference swaps are invisible to the fact-check.** [fact-check.ts:40](/Users/Ford/workspace/codecaine/core/docs-system/packages/docs-style/src/guardrails/fact-check.ts:40) serializes references as their labels, discarding targets. Two references labelled “the guide,” pointing to `build/prepare` and `release/cleanup`, can swap positions. Tokens and ledger checks pass; Jev sees unchanged labels; accepted ops point readers to cleanup before release.

   **Fix:** include stable reference identity and complete targets at their positions in the fact-check input. Add a pipeline regression for same-label, different-target swaps.

2. **P1 — Unavailable semantic validation accepts meaning-changing edits.** [fact-check.ts:55](/Users/Ford/workspace/codecaine/core/docs-system/packages/docs-style/src/guardrails/fact-check.ts:55) returns a passing, skipped check when Judge is absent, throws, or supplies no answer. With Judge throwing `503`, the sweep accepts “The client sends updates…; the server stores…” rewritten as “The server sends updates…. The client stores….” It emits accepted ops and changes `page.after`; “needs review” is informational.

   **Fix:** unavailable validation must leave the original unchanged and emit no accepted ops. Test actor reversals with missing, failing, and incomplete Judge responses.

3. **P1 — Sentence-local findings disable protection of clean sentences.** [tier1.ts:48](/Users/Ford/workspace/codecaine/core/docs-system/packages/docs-style/src/sweep/tier1.ts:48) assigns sentence scope only to core sentence-length findings. Semicolon/em-dash findings lack it, so [tier3.ts:138](/Users/Ford/workspace/codecaine/core/docs-system/packages/docs-style/src/sweep/tier3.ts:138) grants whole-block permission. A semicolon repair can delete the separate sentence “Retries work.” The reproduced rewrite passes every cheap check and is accepted without Judge.

   **Fix:** locate the affected sentences for sentence-local rules. Reserve whole-block scope for genuine paragraph findings; reject ambiguous scope rather than broadening it. Test preservation of unrelated sentences.

Autofix has three further P1 defects. These also produce accepted `updateBlock` ops, without guardrails.

1. **P1 — Overlapping edits delete sentence punctuation.** [match.ts:605](/Users/Ford/workspace/codecaine/core/docs-system/packages/docs-style/src/rules/replacement/match.ts:605) applies expanded deletion ranges against stale offsets.  
   `It works, basically, actually. Retry if needed.` becomes `It works Retry if needed.` The neighboring fixes overlap through their whitespace/punctuation boundaries.

   **Fix:** merge overlapping deletions before applying them, or build output once from validated, nonoverlapping ranges. Add adjacent-filler cases that assert sentence boundaries survive.

2. **P1 — “Safe” replacement rows change authored meaning.** [replacements.ts:175](/Users/Ford/workspace/codecaine/core/docs-system/packages/docs-style/src/profile/replacements.ts:175), [replacements.ts:288](/Users/Ford/workspace/codecaine/core/docs-system/packages/docs-style/src/profile/replacements.ts:288), and [replacements.ts:48](/Users/Ford/workspace/codecaine/core/docs-system/packages/docs-style/src/profile/replacements.ts:48) approve these transformations:

   `Deselect the text before copying.` → `Clear the text before copying.`  
   `The implementations are essentially equivalent.` → `The implementations are equivalent.`  
   `The keys are in order to allow binary search.` → `The keys are to allow binary search.`

   These change an instruction, remove a qualification, and erase sorted-order context.

   **Fix:** make ambiguous rows suggestions unless context proves the swap preserves meaning. Add sweep regressions for these examples.

3. **P1 — Quotation protection fails on contractions and long quotes.** [match.ts:105](/Users/Ford/workspace/codecaine/core/docs-system/packages/docs-style/src/rules/replacement/match.ts:105) uses a quote regex capped at 200 characters. Apostrophes inside single-quoted contractions also break matching.  
   `The message says 'don't utilize the cache.'` becomes `The message says 'don't use the cache.'` Quotes exceeding 200 characters are similarly edited.

   **Fix:** use shared quote parsing with apostrophe/escape handling and no length cap. Test contractions, long quotations, and quotations spanning formatting boundaries.

Two P2 findings and one P3 design problem remain.

1. **P2 — Judge-only rewrite targets are never verified afterward.** [findings.ts:29](/Users/Ford/workspace/codecaine/core/docs-system/packages/docs-style/src/guardrails/findings.ts:29) skips `fixes-target` when no Tier 1 target exists. A reproduced one-topic finding at `0.9` receives a rewrite that merely changes “after the fetch” to “after fetch.” The same violation remains, but the sweep accepts it without rejudging.

   **Fix:** rerun targeted Tier 2 questions against the produced blocks and require a target improvement. Test changed wording that retains the original violation.

2. **P2 — Concurrent sweeps overwrite their output.** [cli.ts:159](/Users/Ford/workspace/codecaine/core/docs-system/packages/docs-style/src/cli.ts:159) chooses a directory using the minute-resolution timestamp at [cli.ts:303](/Users/Ford/workspace/codecaine/core/docs-system/packages/docs-style/src/cli.ts:303). Two runs within one minute use the same path; `writeFile` at line 172 overwrites the earlier `sweep.json`, losing its operations and review record.

   **Fix:** allocate unique run directories with exclusive creation. Add a CLI test for simultaneous runs.

3. **P3 — Structural capabilities leak out of rule slices.** [tier3.ts:44](/Users/Ford/workspace/codecaine/core/docs-system/packages/docs-style/src/sweep/tier3.ts:44) hardcodes `LIST_FIXES`. Adding a rule requiring bullets also requires editing the sweep, contradicting README’s “pipeline needs no change” contract.

   **Fix:** let each rule declare its supported rewrite shape; consume that metadata generically.

No stale-index or shared-state race was reproduced. `Promise.all` preserves job order, and application rebuilds ops against the current document. Critical coverage still lacks forced reverse completion, parent/child rewrites, generated-ID collisions, and shared Judge key isolation.

Verification: **145 focused tests passed**. The BAML adapter test could not bind its local server in this sandbox. Root typecheck reported errors in `docs-server/src/agent-tools.ts:266,320`, with no docs-style errors reported. CLI dispatch, model exports, and workspace/tsconfig wiring showed no separate defect.

Verdict: request changes.  
Six P1 defects violate content preservation.  
Two P2 defects and one P3 design issue remain.  
Review was read-only; no files changed.  
Next: open `fact-check.ts:55` and make unavailable validation reject acceptance.