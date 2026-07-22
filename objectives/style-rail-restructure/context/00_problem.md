<problem>
    <objective_question>
        - Can the StyleRail become a first-class interactive theming surface —
          navigable in two clicks, state-visible at a glance — while staying a
          docked, flag-removable sidebar?
        - Is every themeable piece of the page actually reachable from it?
    </objective_question>

    <current_baseline>
        - `packages/docs-workbench/web/src/shell/StyleRail.tsx` (~2,050 lines):
          fixed `w-[30rem]` right-docked aside, segmented Theme/Layout tabs,
          one long scroll of accordion `PanelSection`s. The Components section
          is 18 nested accordions in a row — a wall of chevrons.
        - Live preview works well and is kept: `applyStyleRailVars` writes
          `--docs-*` vars onto `document.documentElement`; defaults remove the
          override so `theme/semantic.css` stays authoritative.
        - Layout explorations (2 rounds, 8 variations A–H) are rendered in
          examples/style-rail-layouts.html. Ford picked F: mirrored two-pane
          (A's rail moved to the screen edge) + D's specimen strip.
    </current_baseline>

    <why_current_state_is_insufficient>
        - Navigation buries everything: reaching one callout token means
          scrolling past 17 sibling accordions. No sense of "we are looking at
          callouts."
        - No override visibility: nothing shows which tokens diverge from the
          theme, at any level.
        - 30rem is cramped for label + hex + swatch + slider rows.
        - Coverage gap: the `sequence` block type cannot be themed at all — it
          is absent from THEME_TOKEN_REGISTRY, COMPONENT_PICKER_FILES, and
          themes/default/components/. Nobody has audited the remaining 15
          block types for tokens the viewer consumes but the panel never
          exposes.
    </why_current_state_is_insufficient>

    <failure_modes>
        - `buried_controls`: users scroll instead of navigate; theming feels
          like config editing, not design.
        - `invisible_state`: overrides accumulate silently; "what did I
          change?" requires exporting the theme and reading JSON.
        - `silent_coverage_gaps`: a block ships (sequence) without theming
          hookup and nothing flags it; themes look complete but are not.
    </failure_modes>

    <prior_evidence>
        - `objectives/style-rail-restructure/examples/style-rail-layouts.html`:
          rendered mockups A–H with tradeoffs and the accepted recommendation
          (build F; G is the fallback if the detail pane gets tight).
    </prior_evidence>

    <expected_value>
        - During this development phase the rail is a primary tool for tuning
          the doc system's look; a two-click, state-visible panel with full
          coverage directly speeds that loop. Ford's framing: it will be
          collapsed most of the time, so edge-rail ergonomics beat perfect
          open-state page weighting.
    </expected_value>
</problem>
