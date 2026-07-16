<goal>
    - Run an interactive, Ford-driven dogfood review of the entire docs-system:
      read every doc in the 37-bundle corpus in the workbench, fix what reads
      wrong, and evolve the viewer/editor components, layout, and UX wherever
      the review surfaces friction.
    - This objective owns: docs corpus content under docs/, read-surface
      components and editor UX in packages/docs-viewer, workbench shell/theme
      in packages/docs-workbench, and the corpus test mechanics that keep those
      honest. It is a working-session harness for many sittings, not a one-shot
      task.
</goal>

<context_refresh>
    <required_files>
        - objectives/docs-dogfood-review/goal.md
        - objectives/docs-dogfood-review/current_state.md
        - objectives/docs-dogfood-review/review-ledger.md
        - objectives/docs-dogfood-review/context/00_problem.md
        - objectives/docs-dogfood-review/context/01_constraints.md
        - objectives/docs-dogfood-review/context/02_implementation_scope.md
        - objectives/docs-dogfood-review/context/03_working_plan.md
        - objectives/docs-dogfood-review/context/04_validation_and_handoff.md
    </required_files>

    <instruction>
        - At objective start and after compaction/resume, reread the required
          files and treat this bundle as the authority for this objective.
        - current_state.md carries the session handoff; do not re-derive repo
          history from scratch.
    </instruction>
</context_refresh>

<working_strategy>
    - Ford drives from the Electron workbench (`make dev`); the agent responds
      to small directives ("adjust this layout", "change this block to a
      different component", "this page is wrong about X") with focused
      changes verified live via HMR plus the corpus pipeline.
    - Cadence per directive: locate -> change -> verify (targeted test +
      visual) -> record in review-ledger.md -> update current_state.md when a
      milestone lands or before ending a sitting.
    - Spawn sub-agents for parallelizable batches (multi-doc rewrites,
      repo-wide component sweeps); keep single-component tweaks inline.
    - Doc content edits and component changes travel together when one review
      finding needs both; never leave the corpus tests red between directives.
</working_strategy>

<success_metrics>
    - review-ledger.md shows every one of the 37 docs reviewed with a verdict
      and actions taken.
    - make check green after every landed directive; `docs links check docs`
      reports 0 stale references.
    - Viewer/editor friction found during review is either fixed or recorded
      as a scoped follow-up in current_state.md — nothing lives only in chat.
</success_metrics>

<non_goals>
    - Do not grow the 14-type block vocabulary (Ford must approve any new
      type).
    - Do not restructure the seven-package layout; boundary questions are
      documented in docs/10-system-design/30-packages/ and are a separate
      decision.
    - Do not touch external/canvas internals or the framework methodology
      package unless a directive explicitly targets them.
</non_goals>

<completion_criteria>
    - All 37 docs reviewed in review-ledger.md; accumulated UX/component
      follow-ups done or explicitly parked in current_state.md; full suite
      green; current_state.md updated with a final handoff marked COMPLETE.
</completion_criteria>
