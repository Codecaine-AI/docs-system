<problem>
    <objective_question>
        - Are the 37 self-docs accurate, readable, and pleasant enough that
          Ford (and agents) can actually operate the system from them — and
          where they are not, is the fix content, component rendering, or
          editor UX?
    </objective_question>

    <current_baseline>
        - 2026-07-15: the corpus was restructured into 37 bundles (packages
          split, data-model split, block-vocabulary split) by agents in one
          day; content is code-sourced but has had zero human review passes.
        - The read surface just had its block type banners removed;
          the editor surface (TipTap node views) has NOT had the same pass.
        - Full suite green at baseline: 831 pass / 0 fail; links check 0 stale.
    </current_baseline>

    <why_current_state_is_insufficient>
        - Agent-written docs at this volume will contain wrong emphasis, stale
          claims, duplicated explanations, and awkward block choices that only
          a human read-through catches.
        - Ford has not yet internalized the restructured system; the review IS
          the mechanism for him to build that understanding while the docs
          improve (dogfooding).
        - The workbench UX has never survived a sustained editing session; the
          friction list is empty because nobody has used it in anger.
    </why_current_state_is_insufficient>

    <failure_modes>
        - `silent_drift`: a doc claims something the code no longer does;
          looks fine, misleads agents later. Verify claims against code when a
          page is reviewed.
        - `component_misfit`: content forced into the wrong block type (prose
          in tables, tables in prose); fix by re-authoring the block, not by
          styling around it.
        - `chat_only_findings`: UX friction mentioned in conversation but
          never recorded; every finding lands in review-ledger.md or
          current_state.md.
    </failure_modes>

    <prior_evidence>
        - `objectives/docs-dogfood-review/current_state.md`: the running
          handoff, including the day-one state this objective inherits.
        - `docs/10-system-design/30-packages/00-overview`: honest notes on
          which package boundaries are judgment calls.
    </prior_evidence>

    <expected_value>
        - A corpus Ford trusts and understands end-to-end, a workbench whose
          editor UX has survived real use, and a ledger proving both.
    </expected_value>
</problem>
