<validation_and_handoff>
    <validation_ladder>
        - `workbench test suite (style-rail tests)`: run after every phase via
          the package's configured runner; pass = all green including new
          navigation/override-count/preview tests.
        - `theme round-trip`: export theme → reset → import → exported JSON is
          byte-identical and the rendered doc matches; run in phases 1 and 4.
        - `settings compat`: a pre-restructure
          `docs-style-rail-settings.v1` blob (capture one before phase 1 into
          examples/) loads without error and produces identical CSS vars.
        - `make dev` live review: Ford reviews phases 1, 3, and 5 in the
          running app. UI is not done until seen live; if screenshot tooling
          is down, give Ford concrete steps to review instead.
        - `coverage audit`: phase 4 gate — matrix has zero unwaived open rows;
          a sequence block in a scratch doc restyles live from the panel.
    </validation_ladder>

    <artifact_contract>
        - `context/05_coverage_matrix.md`: row = surface; columns = registry
          entry / panel controls / theme component file / consuming viewer
          vars / gaps found / resolution (closed | waived-by-Ford + date).
        - `examples/settings-blob-pre-restructure.json`: captured legacy blob
          for the compat check.
        - `examples/style-rail-layouts.html`: frozen design reference — do not
          regenerate.
        - Codex audit trail: current_state.md lists which codex exec
          invocations produced which changes, per repo workflow.
    </artifact_contract>

    <acceptance_gates>
        - `geometry`: 36rem, detail left / rail right, tabs gone, collapse +
          theme-lock behavior identical to before.
        - `two_click_rule`: any control reachable in ≤2 clicks from panel open.
        - `state_visibility`: every override is findable by scanning rail
          dots/counts alone.
        - `coverage`: 16/16 block types + shell/surfaces/inline-code/
          editor-controls/linking + 6 layout areas all closed or waived.
        - `ford_signoff`: recorded in current_state.md.
    </acceptance_gates>

    <report_contract>
        - report.md must summarize: baseline (pre-restructure panel), method
          (phases + codex invocations), artifacts (matrix, blobs), results
          per gate, rejected routes (e.g. fallback G if considered), risks,
          and recommended next action (specimen rollout list or docs pass for
          20-implementation/40-theming).
    </report_contract>

    <current_state_update>
        - Update current_state.md at phase boundaries: phase completed, gates
          passed (with evidence paths), codex invocations, open flags for
          Ford, next phase's first concrete action.
    </current_state_update>

    <blocked_or_failed_handoff>
        - If blocked (e.g. detail pane too tight, specimen circular deps),
          preserve the branch, record the blocker + smallest next step in
          current_state.md, and stop rather than switching layouts without
          Ford's call.
    </blocked_or_failed_handoff>
</validation_and_handoff>
