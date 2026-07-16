<constraints>
    <hard_rules>
        - The 14-type block vocabulary is frozen; retired types coerce to
          callout on read. Any new type requires Ford's explicit approval.
        - doc.json files must be canonical serializer bytes: after any edit,
          round-trip through serializeDocDocument (packages/docs-model) and
          write the bytes back.
        - Every corpus doc is pinned by tests: CORPUS_PATHS in
          packages/docs-model/src/__tests__/goldens.test.ts (byte-equality +
          projection goldens) and the corpus count assertion (currently 37) in
          packages/docs-model/src/components/__tests__/schema-over-corpus.test.ts.
          Adding/removing/renaming a doc means updating both plus the golden
          files.
        - Editor typing semantics must match Notion; the editor UI mirrors the
          AFFiNE reference (reference checkouts live git-ignored at
          reference/). Don't reinvent interaction patterns.
        - The exports-map keys of docs-model are frozen (9 keys); new exports
          go through the root barrel only.
    </hard_rules>

    <forbidden_shortcuts>
        - `hand-editing golden .md files`: goldens are generated
          (projectToMarkdown); regenerate, never hand-tune.
        - `styling around a wrong block choice`: if content is in the wrong
          block type, re-author the block; CSS is not the fix.
        - `skipping make spa after viewer changes`: subprocess CLI tests time
          out at exactly 5000ms when the SPA cache is stale — that failure
          signature means run `make spa`, not debug the tests.
    </forbidden_shortcuts>

    <data_and_feature_boundaries>
        - docs/.index/ is derived state (rebuild with
          `bun run docs backlinks rescan docs`); never hand-edit, never
          commit.
        - external/canvas is a git submodule with its own release cadence;
          read-only for this objective.
        - reference/ (AFFiNE/BlockSuite checkouts) is read-only inspiration.
    </data_and_feature_boundaries>

    <risk_budget>
        - `red corpus tests`: never left red between directives; a directive
          is not done while make check fails.
        - `editor regressions`: any editor behavior change gets typed-through
          manual verification in the Electron app before it counts as done.
    </risk_budget>

    <promotion_or_completion_gates>
        - `directive_done`: change landed, targeted tests + relevant goldens
          green, visually verified via HMR, ledger/state updated.
        - `sitting_done`: full `make check` green, links check 0 stale,
          current_state.md updated with next actions.
    </promotion_or_completion_gates>
</constraints>
