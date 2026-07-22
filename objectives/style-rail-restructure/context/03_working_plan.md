<working_plan>
    <overview>
        1. chassis - 36rem width, mirrored two-pane navigation replacing tabs
           and accordions.
        2. override_state - dots + counts computed from settings vs defaults.
        3. rail_previews - value summaries in rail rows.
        4. coverage_audit - enumerate consumed vars per surface, diff against
           registry/panel/theme files, close gaps (sequence first).
        5. specimen_strip - compact live block render above block controls
           (deferrable).
    </overview>

    <operating_principles>
        - One phase per Codex work unit; the orchestrator reviews and Ford
          live-reviews visual phases before the next starts.
        - Every Codex prompt carries: exact file paths, the current code of
          the region being changed, the F mockup geometry, and the constraint
          list from 01_constraints.md. Codex is instructed to parallelize
          internally where its task splits.
        - Control anatomy (ColorRow/SliderRow/SelectRow/ToggleRow) is reused
          as-is in phase 1; improvements to controls are out of scope.
    </operating_principles>

    <phase id="1" name="chassis">
        <objective>
            - Replace tabs + accordion stack with the F geometry: detail pane
              left, navigation rail right (flush to screen edge), 36rem width.
        </objective>
        <inputs>
            - StyleRail.tsx current structure; examples/style-rail-layouts.html
              variation F; style-rail.css; App.tsx mount site.
        </inputs>
        <process>
            - Width: `w-[30rem]` → `w-[36rem]`; collapsed width unchanged.
            - Build rail with three labeled groups: Theme (Presets, Colors,
              Typography, Background, References), Blocks (the 18
              COMPONENT_PICKER_FILES entries in current order), Layout
              (Column, Surfaces, Sidebar, Scrollbar, Side peek, Editor).
            - Each rail item maps to a detail pane assembled from the existing
              section contents (same rows, same settings wiring); the
              `list-item` extra sliders and nested sections (References→Icon,
              Background→Softening, Editor→Highlight/Drop line/Drag
              select/Drag grip) fold into their parent pane as grouped
              sub-headers, not accordions.
            - Selected rail item persists in a new additive localStorage field;
              old `docs-style-rail-section:*` keys are read once for nothing
              (retired) — document the retirement in code.
            - Detail pane header shows the pane name + layering line
              ("N overrides · layered over <theme>", static text in phase 1 is
              acceptable with N wired in phase 2).
            - Footer (Export / Import / Reset) and header (STYLE + collapse)
              unchanged; StyleRailOverlay untouched.
        </process>
        <outputs>
            - Restructured StyleRail module (split files per
              02_implementation_scope.md), updated style-rail.css, updated
              tests.
        </outputs>
        <gate>
            - Tests green; every control reachable in ≤2 clicks from panel
              open; theme export→import round-trips identically; Ford live
              review in `make dev` approves geometry.
        </gate>
        <failure_handling>
            - If the 400px detail pane crushes any existing row, do not shrink
              controls — flag the row; fallback G (icon rail) is the agreed
              pressure valve and needs Ford's call before switching.
        </failure_handling>
    </phase>

    <phase id="2" name="override_state">
        <objective>
            - Make divergence-from-theme visible everywhere: dots on rail
              items and rows, counts on block rail items.
        </objective>
        <inputs>
            - StyleRailSettings vs DEFAULT_STYLE_RAIL_SETTINGS;
              settings.components (file → key → value) vs resolved theme
              defaults.
        </inputs>
        <process>
            - Derive a pure helper: overrideCount(file) and
              isOverridden(section-or-token) from the settings object — the
              registry already knows defaults, so no new state is stored.
            - Row-level dot sits left of the label (filled = overridden,
              hollow = theme default), matching the mockup treatment.
            - Wire the phase-1 header line's N to the real count.
            - Per-block "Reset <Block> to theme" row clears that file's
              overrides only.
        </process>
        <outputs>
            - Override helpers + UI wiring; tests asserting counts for a
              seeded settings blob.
        </outputs>
        <gate>
            - Seeded-blob test proves counts; manual check: changing any token
              flips its dot and increments exactly one rail count.
        </gate>
        <failure_handling>
            - If default resolution is ambiguous for a token (no defaultValue
              and no semantic.css expression), list those tokens in
              current_state.md rather than guessing — they feed phase 4.
        </failure_handling>
    </phase>

    <phase id="3" name="rail_previews">
        <objective>
            - Rail rows carry their values: swatch strip on Colors, summary on
              Typography ("Sans · 16px"), override counts on blocks (from
              phase 2).
        </objective>
        <inputs>
            - Phase 1–2 output; settings.colors / settings.typography shapes.
        </inputs>
        <process>
            - Colors row: 4-swatch strip from current accent/bg/text/+1
              resolved values.
            - Typography row: font family short name + base size.
            - Keep previews passive (no interaction targets inside rail rows).
        </process>
        <outputs>
            - Rail preview rendering + tests for the summary formatting.
        </outputs>
        <gate>
            - Ford live review approves rail density (previews must not make
              the rail noisy — drop a preview rather than crowd it).
        </gate>
        <failure_handling>
            - If a preview needs resolved CSS values not available from
              settings, read computed styles once per open — no polling.
        </failure_handling>
    </phase>

    <phase id="4" name="coverage_audit">
        <objective>
            - Prove and close full theming coverage across all blocks and
              panel-managed surfaces.
        </objective>
        <inputs>
            - DOC_BLOCK_TYPES (16, packages/docs-model/src/doc-schema.ts);
              THEME_TOKEN_REGISTRY (22 files); COMPONENT_PICKER_FILES (18);
              themes/default/components/ (20 json); docs-viewer styles;
              semantic.css.
        </inputs>
        <process>
            - Enumerate per surface: (a) CSS custom properties consumed by its
              viewer styles, (b) registry tokens/vars, (c) panel controls,
              (d) theme component file presence. Diff all four.
            - Known row 1: `sequence` — define its token set from the vars its
              styles consume (align with structured-table/waterfall
              conventions), add registry entry, picker entry, and
              themes/default/components/sequence.json.
            - For every other row, classify gaps: missing-token (var consumed
              but not in registry), dead-token (registry var nothing
              consumes), hardcoded-value (style that should consume a var —
              docs-viewer edit, flagged), missing-theme-file.
            - Close gaps or record a waiver decision per row with Ford.
            - Include the Layout areas (Column, Surfaces, Sidebar, Scrollbar,
              Side peek, Editor) in the matrix — same four-way diff.
        </process>
        <outputs>
            - context/05_coverage_matrix.md (schema in
              02_implementation_scope.md); code/theme edits closing gaps.
        </outputs>
        <gate>
            - Matrix committed; zero open rows without an explicit waiver;
              sequence block styleable end-to-end from the panel.
        </gate>
        <failure_handling>
            - If a block's styles turn out to consume no vars at all
              (fully hardcoded), stop and scope that block's tokenization with
              Ford before editing docs-viewer broadly.
        </failure_handling>
    </phase>

    <phase id="5" name="specimen_strip">
        <objective>
            - Compact live specimen (~90px) above a selected block's controls,
              rendered with current tokens on a neutral backdrop.
        </objective>
        <inputs>
            - Phase 1 chassis; per-block fixture content (minimal doc.json
              fragments per block type).
        </inputs>
        <process>
            - Build fixtures for high-value blocks first (callout, code,
              heading, structured-table); blocks without fixtures simply show
              no specimen — absence is fine, placeholders are not.
            - Specimen renders through the real viewer components so token
              changes hit it via the same CSS vars; collapsible, collapsed
              state persisted.
        </process>
        <outputs>
            - Specimen component + fixtures; per-block rollout list in
              current_state.md.
        </outputs>
        <gate>
            - Dragging any exposed token slider visibly updates the specimen
              with no extra wiring; Ford live review.
        </gate>
        <failure_handling>
            - If rendering real viewer components inside the rail is heavy or
              circular, defer with findings recorded — do not ship a fake
              (non-live) specimen.
        </failure_handling>
    </phase>
</working_plan>
