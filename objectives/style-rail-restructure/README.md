# StyleRail F-Layout Restructure + Theming Coverage Audit

Rebuild the docs-workbench style panel as a 36rem mirrored two-pane (detail
left, navigation rail on the screen edge), surface override state everywhere,
then audit every block type and surface for full theming coverage —
`sequence` is the known zero-coverage gap. Target design: variation F in
`examples/style-rail-layouts.html`.

Use this objective bundle for the long-running work described in `goal.md`.
Keep durable handoff notes in `current_state.md`, not in the top-level
`CURRENT_STATE.md`.

## Objective Files

- `goal.md` - objective, context refresh, strategy, success metrics, non-goals,
  and completion criteria.
- `current_state.md` - compact objective-local handoff state for active work.
- `context/00_problem.md` - problem statement and motivation.
- `context/01_constraints.md` - hard constraints, validity rules, and boundaries.
- `context/02_implementation_scope.md` - files, modules, and systems this
  objective may change.
- `context/03_working_plan.md` - phase-gated execution plan with inputs,
  outputs, gates, and failure handling.
- `context/04_validation_and_handoff.md` - acceptance checks and handoff rules.
- `examples/` - configs, prompts, command snippets, or fixtures that make the
  objective concrete.

Objective path: `objectives/style-rail-restructure/`
