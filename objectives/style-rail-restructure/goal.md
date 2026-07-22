<goal>
- Restructure the docs-workbench StyleRail into the approved "F" layout: 36rem-wide right-docked panel, mirrored two-pane — detail pane on the left (beside the doc), navigation rail flush to the screen edge on the right — with override-state surfacing and, last, a compact live specimen strip above block controls.
- Then audit and close theming coverage: every block type in the doc vocabulary and every panel-managed surface must line up across token registry, panel controls, theme component file, and viewer CSS vars. `sequence` is the known gap (no registry entry, no picker entry, no themes/default/components/sequence.json).
</goal>

<context_refresh>
    <required_files>
        - objectives/style-rail-restructure/goal.md
        - objectives/style-rail-restructure/current_state.md
        - objectives/style-rail-restructure/context/00_problem.md
        - objectives/style-rail-restructure/context/01_constraints.md
        - objectives/style-rail-restructure/context/02_implementation_scope.md
        - objectives/style-rail-restructure/context/03_working_plan.md
        - objectives/style-rail-restructure/context/04_validation_and_handoff.md
    </required_files>

    <instruction>
        - At objective start and after compaction/resume, reread the required
          files and treat this bundle as the authority for this objective.
        - Open examples/style-rail-layouts.html in a browser — variation F is
          the build target; A and D explain the lineage.
    </instruction>
</context_refresh>

<working_strategy>
- Five gated phases, in order: (1) chassis — width + mirrored two-pane navigation; (2) override dots + counts; (3) rail value previews; (4) theming coverage audit + gap closure; (5) specimen strip (needs per-block fixtures; explicitly deferrable).
- The rail replaces the Theme/Layout segmented tabs entirely. Rail groups: Theme (Presets, Colors, Typography, Background, References), Blocks (component picker files), Layout (Column, Surfaces, Sidebar, Scrollbar, Side peek, Editor).
- Navigation changes; control anatomy does not. Reuse ColorRow / SliderRow / SelectRow / ToggleRow, the StyleRailSettings model, and the CSS-var live-preview path unchanged.
- All file edits go through codex exec (workspace-write sandbox); the orchestrator plans, reviews, and pastes ground truth into prompts. See context/01_constraints.md.
</working_strategy>

<success_metrics>
- Panel renders at 36rem with detail left / rail right; segmented tabs gone; collapse and theme-lock behavior preserved.
- Every rail item shows override state; block rows show override counts; Colors shows a swatch strip, Typography a value summary.
- context/05_coverage_matrix.md shows 16/16 block types plus all non-block surfaces covered, with `sequence` styleable from the panel.
- Workbench style-rail tests pass; Ford approves a live UI review in `make dev`.
</success_metrics>

<non_goals>
- No takeover/studio mode — the panel stays a docked sidebar, removable via theme lock.
- No resizable width or drag handle; 36rem fixed.
- No redesign of individual controls, no new token kinds, no new block types.
- No changes to theme file formats or exports-map keys; settings/localStorage schema changes must be additive with migration.
</non_goals>

<completion_criteria>
- Phases 1–4 implemented, reviewed, and merged; phase 5 merged or explicitly deferred in current_state.md with fixture work scoped.
- context/05_coverage_matrix.md committed with every row closed or explicitly waived by Ford.
- current_state.md updated with Ford's live-review sign-off recorded.
</completion_criteria>
