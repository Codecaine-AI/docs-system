<constraints>
    <hard_rules>
        - All implementation edits run through `codex exec` with
          `--sandbox workspace-write`; `.git` operations stay orchestrator-side.
          Paste ground truth (exact current code, registry keys, file lists)
          into Codex prompts — do not make Codex rediscover it.
        - The word "chrome" is banned repo-wide. Say system UI / wrapper /
          framing. Do not reintroduce it in code, comments, or copy.
        - Corner radii derive from the `--radius` token via calc; bare
          `rounded` Tailwind classes are banned (canvas geometry exempt).
        - Panel copy follows writingstyle.md (repo root): matter-of-fact,
          fact-first.
        - Live-preview mechanism is untouchable: settings → styleRailVars →
          CSS custom properties on documentElement; a knob at its default
          removes its override so theme/semantic.css stays authoritative.
        - `themeLocked === true` must still omit the rail entirely
          (App.tsx behavior preserved).
        - Keep the module's exported API stable unless App.tsx and tests are
          updated in the same change: DEFAULT_STYLE_RAIL_SETTINGS,
          normalizeSettings, loadStyleRailSettings, hasStoredStyleRailSettings,
          saveStyleRailSettings, styleRailVars, applyStyleRailVars,
          StyleRailOverlay, StyleRail, ThemePickerEntry.
    </hard_rules>

    <forbidden_shortcuts>
        - `settings_schema_break`: Do not rename or restructure the
          `docs-style-rail-settings.v1` blob. New fields (e.g. selected rail
          item) are additive; existing blobs must load unchanged through
          normalizeSettings.
        - `registry_guessing`: When adding `sequence` (or any) tokens, derive
          them from the CSS vars the viewer styles actually consume — never
          invent token names without a consuming var.
        - `panel_only_coverage`: A coverage row is not closed by adding a
          panel control; registry entry, panel control, theme component file,
          and consuming viewer CSS var must all agree.
        - `screenshot_free_signoff`: UI is not done until seen live. If
          screenshot tooling is down, ask Ford for a UI review with concrete
          steps instead of declaring victory.
    </forbidden_shortcuts>

    <data_and_feature_boundaries>
        - Owned: docs-workbench web (shell + theme dirs), themes/default/.
        - Diagnostic-only: docs-viewer styles are read to enumerate consumed
          CSS vars; edit docs-viewer only when phase 4 finds a hardcoded value
          that must become a var, and flag each such edit for review.
        - Forbidden: doc corpus (docs/), docs-model wire schema, exports maps.
    </data_and_feature_boundaries>

    <risk_budget>
        - `visual_regression`: Zero tolerated on the doc rendering itself;
          panel-only changes must not alter doc output except through
          intentional token hookups found in phase 4.
        - `phase_slip`: Phase 5 (specimen) may be deferred without penalty;
          phases 1–4 may not be reordered.
    </risk_budget>

    <promotion_or_completion_gates>
        - `tests_green`: docs-workbench style-rail test suite passes after
          every phase.
        - `ford_live_review`: Each visual phase (1, 3, 5) gets a `make dev`
          review from Ford before the next phase starts.
    </promotion_or_completion_gates>
</constraints>
