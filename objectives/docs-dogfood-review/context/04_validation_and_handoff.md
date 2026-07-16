<validation_and_handoff>
    <validation_ladder>
        - `Ford's visual check (make dev window)`: every rendering/UX
          directive; the AGENT never performs this — it delivers a numbered
          test plan and Ford confirms in the Electron app (both modes when
          theming is touched), replying with feedback/screenshots.
        - `bun test packages/docs-viewer` (258 tests): any component/editor
          change; pass = 0 fail with assertions updated to new markup.
        - `bun test packages/docs-model` (336 tests): any doc.json change;
          pass = byte round-trip + projection goldens green.
        - `bun run docs links check docs`: any reference change; pass = 0
          stale.
        - `make check` (835 tests, after `make spa` if viewer changed): every
          sitting close; pass = 0 fail. Exactly-5000ms subprocess timeouts =
          stale SPA cache, run `make spa`.
    </validation_ladder>

    <artifact_contract>
        - `review-ledger.md`: one row per doc — path, date reviewed, verdict
          (clean / edited / follow-up), actions taken. The ledger is the
          progress record; keep it current within the sitting.
        - `current_state.md`: the handoff. Updated at sitting close and before
          any compaction; must let a fresh agent resume without chat history.
        - Projection goldens + backlinks.db: regenerated, never hand-edited.
    </artifact_contract>

    <acceptance_gates>
        - `directive`: rendered proof + relevant tests green + ledger updated.
        - `sitting`: full suite green + state file updated.
        - `objective`: all 37 ledger rows filled, follow-ups resolved or
          parked with rationale, final current_state.md marked COMPLETE.
    </acceptance_gates>

    <report_contract>
        - No separate report.md required: review-ledger.md + the final
          current_state.md ARE the report for this objective.
    </report_contract>

    <current_state_update>
        - Before handoff, update current_state.md with: completed directives,
          in-progress work, exact next actions (doc paths, not vibes),
          uncommitted-tree scope, and open risks.
    </current_state_update>

    <blocked_or_failed_handoff>
        - If blocked (e.g., a directive needs a model/server decision), record
          the blocker, the smallest useful next step, and which files carry
          the half-done state; never leave that only in conversation.
    </blocked_or_failed_handoff>
</validation_and_handoff>
