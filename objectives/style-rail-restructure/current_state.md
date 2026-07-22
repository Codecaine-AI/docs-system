<current_state>
<last_updated>2026-07-22</last_updated>

<status>
    - Spec complete, no implementation started. Design direction locked:
      variation F (mirrored two-pane + specimen) from
      examples/style-rail-layouts.html, chosen by Ford 2026-07-22.
</status>

<completed>
    - Two rounds of layout exploration (A–H) rendered and reviewed; F
      accepted, G designated fallback if the detail pane proves too tight.
    - Ground-truth survey of the current implementation (see
      context/00_problem.md and 02_implementation_scope.md): StyleRail.tsx
      structure, THEME_TOKEN_REGISTRY (22 files), COMPONENT_PICKER_FILES (18),
      DOC_BLOCK_TYPES (16), themes/default/components (20 json).
    - Coverage gap identified: `sequence` has no registry entry, no picker
      entry, no theme component file — the only block type with zero coverage.
    - Full bundle authored: goal.md + context/00–04.
</completed>

<in_progress>
    - Nothing active.
</in_progress>

<next_actions>
    - Capture a pre-restructure settings blob into
      examples/settings-blob-pre-restructure.json (phase-1 prerequisite, see
      04_validation_and_handoff.md).
    - Draft the phase-1 codex exec prompt (xhigh, workspace-write) carrying
      the F geometry, current StyleRail.tsx structure, and the constraint
      list; run it on a branch.
</next_actions>

<risks_or_open_questions>
    - Detail pane width (~400px inside 36rem) vs the widest existing rows —
      phase-1 gate checks this; fallback G needs Ford's call.
    - Tokens without resolvable defaults may surface in phase 2; they route
      into the phase-4 audit rather than being guessed.
    - Specimen strip may hit heavy/circular imports rendering viewer
      components inside the workbench shell — phase 5 is deferrable.
</risks_or_open_questions>

<important_paths>
    - objectives/style-rail-restructure/goal.md
    - objectives/style-rail-restructure/context/03_working_plan.md (phase gates)
    - objectives/style-rail-restructure/examples/style-rail-layouts.html (F mockup)
    - packages/docs-workbench/web/src/shell/StyleRail.tsx
    - packages/docs-workbench/web/src/theme/theme-folders.ts
    - packages/docs-model/src/doc-schema.ts (DOC_BLOCK_TYPES, read-only)
    - themes/default/components/
</important_paths>
</current_state>
