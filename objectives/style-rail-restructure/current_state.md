<current_state>
<last_updated>2026-07-22</last_updated>

<status>
    - Phases 1-3 plus the 44rem width amendment implemented, reviewed, and
      committed on branch style-rail-f-restructure (7558842, e522573,
      a160f1b, a85dec2). Phase-1 geometry approved by Ford in live review
      2026-07-22. Awaiting Ford live review of phases 2+3 + width before
      phase 4. All codex work runs at xhigh per Ford directive 2026-07-22.
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
    - Pre-restructure compat fixtures captured (codex exec, commit 9d72219):
      examples/settings-blob-pre-restructure.json (themes/default
      railDefaults + 6 non-empty component files) and
      examples/settings-vars-pre-restructure.json (176 resolved vars).
    - Phase 1 chassis (codex exec gpt-5.6-sol xhigh, commit 7558842):
      StyleRail.tsx split into shell + style-rail-nav.tsx (29-item rail:
      Theme 5 / Blocks 18 / Layout 6) + style-rail-panes.tsx (flat panes,
      sub-headers not accordions); selection persisted under
      docs-style-rail-selected; docs-style-rail-section:* keys retired;
      two-pane CSS (detail left / edge rail right); tests migrated +
      navigation suite. Gates: 81/0 tests, fixture vars 176/176 identical,
      exported API unchanged, App.tsx untouched. Ford live review:
      approved 2026-07-22.
    - Phase 2 override state (codex exec gpt-5.6-sol xhigh, commit
      e522573): style-rail-overrides.ts pure helpers (paneOverrideCount /
      isLeafOverridden) with one-pane-per-leaf attribution
      (colors.sidebar -> theme.colors, documented exception on the Sidebar
      pane duplicate row; at-default non-color component values excluded,
      mirroring styleRailVars); rail dots + block count badges with
      accessible labels; per-row filled/hollow dots via shared context;
      header count line; per-block "Reset <block> to theme" (list-item
      also restores list geometry). Gates: 87/0 tests, fixture vars
      176/176, no ambiguous-default tokens.
    - Phase 3 rail previews (codex exec gpt-5.6-sol xhigh, commit a160f1b):
      Colors rail item 4-swatch strip (accent/background/text/sidebar;
      explicit hex wins, else one-shot computed-style probe memoized per
      settings/dark change — no polling); Typography "Sans · 16px"
      summary; previews passive, values carried in accessible names; 8px
      swatches (10px crowded label + dot). Gates: 90/0 tests, fixture
      vars 176/176.
    - Width amendment (Ford, 2026-07-22; codex exec xhigh, commit a85dec2):
      expanded panel w-[36rem] -> w-[44rem], rail column 10rem -> 11rem
      (goal.md's "36rem fixed" superseded). Codex clip audit: no clip
      vector found; the right-edge symptom Ford saw at 36rem is expected
      to be tightness — confirm in live review.
</completed>

<in_progress>
    - Gate: Ford live review of phases 2+3 + width in `make dev`
      (dots/counts, rail preview density, 44rem geometry).
</in_progress>

<next_actions>
    - After Ford approves: draft and run the phase-4 coverage-audit codex
      prompt (xhigh): enumerate consumed vars per surface, 4-way diff
      (registry / panel / theme file / viewer vars), close `sequence`
      first (registry entry + picker entry + themes/default/components/
      sequence.json), emit context/05_coverage_matrix.md.
</next_actions>

<risks_or_open_questions>
    - Detail pane width vs widest rows: resolved by the 44rem amendment
      unless Ford's live review says otherwise; fallback G not needed so
      far.
    - Phase-2 note for the phase-4 matrix: registry files `shell` and
      `editor-controls` have no Blocks pane (their knobs live in the
      Colors / Editor panes) — map them there, don't flag them as gaps.
    - Specimen strip (phase 5) may hit heavy/circular imports rendering
      viewer components inside the workbench shell — explicitly
      deferrable.
    - Pre-existing repo typecheck error (packages/docs-server/src/
      fs-watch.ts:140, FSWatcher .on) predates this work; left untouched.
    - Two codex exec runs against objectives/ state files hung with no
      output and were killed (one low, one xhigh); full-file-replacement
      prompts are the workaround. Implementation runs never hung.
    - A concurrent Claude session (different session id) was running codex
      in this repo 2026-07-22 evening — unexpected working-tree changes
      are likely its work; commits on this branch stage explicit paths
      only.
</risks_or_open_questions>

<important_paths>
    - objectives/style-rail-restructure/goal.md
    - objectives/style-rail-restructure/context/03_working_plan.md (phase gates)
    - objectives/style-rail-restructure/examples/style-rail-layouts.html (F mockup)
    - objectives/style-rail-restructure/examples/settings-blob-pre-restructure.json
      + settings-vars-pre-restructure.json (compat fixtures)
    - packages/docs-workbench/web/src/shell/StyleRail.tsx (+ style-rail-nav.tsx,
      style-rail-panes.tsx, style-rail-overrides.ts)
    - packages/docs-workbench/web/src/theme/theme-folders.ts
    - packages/docs-model/src/doc-schema.ts (DOC_BLOCK_TYPES, read-only)
    - themes/default/components/
</important_paths>
</current_state>
