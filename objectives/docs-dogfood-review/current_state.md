<current_state>
<last_updated>2026-07-17 evening (round 2, second sitting closed: R2-D3..D12 landed — canvas embed de-framing, drag-select, page titles, drop-nesting root-cause fix)</last_updated>

<status>
    - ROUND 2 in progress, SECOND SITTING CLOSED (2026-07-17 evening).
      This sitting landed ten directives, R2-D3..R2-D12 (full detail per
      directive in <completed>): canvas embed de-framed + content-fitted
      section previews (D3/D4, incl. a fit=content renderer option in the
      CANVAS SIBLING REPO); drag grip on atom blocks (D5); bottom-padding
      + scrollbar-padding + title-padding rail knobs (D6/D12); drag
      opacity governs the whole floating block via a typography-faithful
      body-level ghost (D7); the interaction-surfaces canvas restructured
      to nested-sections containment, no arrows (D8, canvas repo);
      Notion-style drag select — screenshot-style band from margins/gaps,
      multi-block grip move, rail color/opacity knobs, borderless fill
      (D9); drop-nesting root cause fixed + the "Solution staircase"
      repaired (D10); fixed page-title furniture from the sidebar name +
      21 duplicate leading H1s stripped (D11); click-to-rename page title
      through /api/move (D12, incl. the band-vs-title press fix).
    - Ford visually verified through iteration: D3-D10 flows and the D11
      furniture. STILL PENDING his check: D12 title rename (the
      not-clickable fix landed after his last test), the borderless band
      rect, and the per-doc call on the 24 docs that KEPT a richer
      opening H1 under the new page title.
    - Suite state at close: make check 909 pass / 4 skip / 0 fail (913
      tests, was 875 at sitting start — drag-select, drag-handle,
      doc-title, rename e2e, clamp tests added). Links 0 stale; backlinks
      45 sources / 119 refs. Corpus still 45 docs; content changed by:
      staircase repair (00-interaction-surfaces), 21 title-strips, and
      Ford's own live edits (goldens regenerated over disk truth ~6x).
    - UNCOMMITTED SCOPE NOW SPANS TWO REPOS: everything above in
      docs-system, PLUS the canvas sibling repo
      (~/Github Repos/Codecaine/canvas, on main with Ford's own changes):
      fit=content renderer option (static-svg.ts, types.ts,
      canvas-file-api.ts, 2 renderer tests) and the restructured
      canvases/interaction-surfaces.canvas.json. Commit strategy is
      OVERDUE — see next_actions.
    - NEW CANON VOCABULARY (unchanged from first sitting, memory saved):
      "projection" = specs→code ONLY; per-reader forms are RENDERED
      INTERACTION SURFACES (human = workbench editor, agent = rendered
      markdown via CLI); doc.json = canonical state neither reader
      touches. Code identifiers (projectToMarkdown) rename still PARKED.
    - PARALLEL SESSION note: another session edits this repo same-day
      (D19 living theme; a `list` rail settings group + style-rail.css
      appeared mid-sitting) — watch for concurrent edits to this bundle
      and to StyleRail.tsx/index.css.
    - WORKING MODE unchanged (hard rules in context/03): agent implements
      + machine-verifies only (targeted tests, typecheck, make spa + make
      check, links/backlinks); Ford is the ONLY UI verifier; every
      UI-affecting change ships with a numbered TEST PLAN; never type
      into corpus docs via a browser; sub-agents are all-Fable, NO codex;
      "chrome" is a banned word for UI.
</status>

<completed>
    ROUND 1 (2026-07-16) — committed in b55ecfd; see git history and the
    round-1 close-out for D1–D18 details (editor UX, marks, drag grip,
    theming contract, theme folders, rail v1–v3, corpus 37→43, "chrome"
    purge). Late round-1 entry from a parallel session:
    - D19 Default-only living theme (NOT yet Ford-verified): picker shows
      ONLY Default (Dark built-in removed; themes/example deleted; save-as
      button removed); the rail AUTO-SAVES every change (1.5s debounce)
      into themes/default/ (railDefaults + component overrides as real
      components/*.json) via POST /api/themes; resolveThemeById is now
      REPO-FIRST so themes/default overrides the compiled-in fallback —
      Default IS Ford's evolving core theme, and clicking it restores the
      last saved look. localStorage still carries instant session state.
      10-global-themes doc updated + goldens. Machine-verified: 310 pass
      on rerun, gate 856 / 1 standing manifesto fail, typecheck clean.
      NOTE: themes/default/ is generated-but-committable state — worth
      committing with the theme workstream.

    ROUND 2 (2026-07-17):
    - R2-D1 Foundation rewrite (interview → implementation, all landed):
      - INTERVIEW DECISIONS (Ford-confirmed): knowledge-transfer is the
        opening thesis (lineage: writing→diagrams→libraries→internet→AI);
        lossy-projection demoted to supporting argument; docs define the
        function (mathematical framing), layers ordered by rate of change;
        bet-framing for "code matters less" + "docs as enforced spec"
        (tests = obligation); trust chain (agents write more code →
        autonomy needs locked-in behavior+why); slop = failed intent
        transfer; self→team→AI understanding rings; embeddable/themable
        medium as foundation-level goal.
      - docs/00-foundation/00-manifesto REWRITTEN end-to-end (one doc,
        organic; absorbed framework philosophy + Ford's three reverted
        round-1 paragraphs' substance; Grove/Horthy citations moved in).
      - NEW docs/10-system-design/00-interaction-surfaces: canonical state
        + mirrored human/agent surface sections + symmetry table + "why
        this shape"; richer-than-markdown agent render marked as OPEN
        direction (Ford hasn't specced it).
      - NEW docs/10-system-design/10-doc-architecture: the decision memory
        — three layers by rate of change, folders/overviews/numbering,
        vertical slices, web of knowledge (refs + one-way doc→code links +
        L1-L6 mapping), enforced-vs-adhered table, flat-files→blocks
        migration record. Absorbed the WHY from framework 20-standards.
      - Renumber cascade via server /api/move (32 bundles, 0 failures,
        all inbound refs auto-rewritten; old empty dirs removed).
      - Vocabulary sweep: 70 minimal span edits across 25 docs
        (projection→render/agent-surface; canonical bytes verified).
        Note: 50-canonical-bytes doc TITLE changed ("…serialization,
        rendering, hashing").
      - docs/…/50-packages/70-framework REWRITTEN: "the loadable skill" —
        owns SKILL.md/cookbook/standards/templates/workflows; why lives in
        corpus; sync discipline; render-the-skill north star callout.
      - packages/framework SLIMMED 6951→4335 lines: philosophy+architecture
        reference files DELETED (pointer stub remains); standards collapsed
        1007→246 (imperative rules + "Rationale: docs/10-system-design/
        10-doc-architecture" pointer lines); cookbook/workflows modernized
        to doc.json/CLI reality; foundation templates loosened to optional
        patterns; SKILL.md rewritten (Where-the-Why-Lives section + sync
        discipline). package.json/scripts untouched.
      - Plumbing: CORPUS_PATHS renumbered + 2 new; count 43→45; all 45
        goldens regenerated (.tmp/regen-goldens.ts is the reusable
        regenerator); backlinks rescan; links 0 stale; make check green.
    - Authoring scripts for audit: .tmp/author-foundation-round2.ts,
      .tmp/vocab-sweep.ts, .tmp/scan-vocab.ts, .tmp/regen-goldens.ts.
    - R2-D12 Click-to-rename page title + title padding knob (2026-07-17,
      next sitting): the page title (R2-D11) is now contentEditable (read
      + edit modes, not static export) — Enter/blur commits, Escape
      reverts. Commit re-slugs the typed title (docSegmentFromTitle: slug
      + keep the segment's numeric prefix) and calls NEW api moveDoc →
      POST /api/move (server rewrites inbound refs); DocPage fires new
      onDocMoved(newPath) prop; App navigates (hash) + refetches the tree
      so the sidebar follows. Empty/punctuation-only/unchanged titles
      revert silently; move failure reverts + paneError. h1 keyed by path.
      Rail: Layout → "Title padding" (0-240, default 20px,
      --style-title-padding) = gap between the page title and first block
      (Top/Title/Bottom now the three column paddings).
      Tests: 2 e2e rename tests in workbench.test.tsx (real server, disk
      folder asserted moved 80-rename→80-fresh-coat and back; revert
      matrix), 4 docSegmentFromTitle unit tests. make check green.
      FOLLOW-UP (Ford: title not clickable): the R2-D9 drag-select band
      preventDefault-ed presses on the title (it's neither editor text
      nor a control). drag-select.ts now has exported shouldStartBand —
      outside view.dom, anything [contenteditable] keeps native caret
      behavior (the PM root is contenteditable, so the check only applies
      outside the editor); grip presses still keep the range; text/node
      view/furniture presses dissolve it. 3 new predicate tests (14 in
      drag-select.test.ts).
      CAUTION for Ford: renaming a REAL corpus doc moves its bundle —
      CORPUS_PATHS + golden filenames pin old paths, so make check goes
      red until the agent runs the rename cascade (CORPUS_PATHS edit,
      goldens regen, backlinks rescan, links check). Tell the agent after
      renaming. Awaiting Ford's visual check.
    - R2-D11 Fixed page title from the sidebar name (2026-07-17, next
      sitting): DocPage renders non-block page furniture above all three
      mode panes — <h1 class="docs-page-title"> of
      docTitleFromPath(path) (NEW web/src/lib/doc-title.ts: last path
      segment, numeric prefix stripped, Title Case with minor-word
      exceptions + acronym uppercasing CLI/UI/API/etc; 4 unit tests).
      Styled a step larger than a block H1 (2.25rem, heading-font var,
      index.css). CORPUS SWEEP (.tmp/strip-duplicate-title-headings.ts):
      leading childless H1 blocks whose normalized text equals the
      derived title REMOVED — 21/45 stripped, 24 kept (richer titles like
      "The data model — one format, five shapes"; kept docs will show
      page title + their own H1 — Ford may retitle during the
      read-through). doc.json `title` FIELDS untouched. Goldens regen,
      backlinks rescan (119 refs), links 0 stale. One test updated for
      the new furniture (workbench annotate test: "Comments" heading now
      needs level:2). Awaiting Ford's visual check.
    - R2-D10 Drop-nesting bug ("Solution staircase") repaired + fixed
      (2026-07-17, next sitting): grip drops near a block's interior
      NESTED the dragged block into that block's block* child slot (PM
      dropPoint honors the schema's nested-children capability) — Ford's
      00-interaction-surfaces ended up with a 5-block diagonal staircase
      under the "The Solution" heading. REPAIR:
      .tmp/repair-solution-staircase.ts flattened the chain to top-level
      siblings after the heading (canonical bytes rewritten, goldens
      regen). FIX (drag-select.ts): new topLevelDropPos snaps any block
      drop to the nearest top-level boundary; moveRangeTr uses it, and
      handleDrop now ALSO intercepts single CLOSED block slices (grip
      drags) via new dropBlockSliceTr (top-level reorder + NodeSelection
      lands on the dropped block; open slices = native text drags stay
      PM's). TRADE-OFF recorded: block drops can no longer nest into
      callouts either — deliberate for now, revisit if Ford wants
      Notion-style nest-into-callout drops. 3 new tests (11 total in
      drag-select.test.ts). NOTE: intentional nesting still exists in the
      corpus from authoring (e.g. the callout under the agent-surface
      paragraph) — only the staircase was repaired.
    - R2-D9 Notion-style drag select (2026-07-17, next sitting): NEW
      editor extension docs-viewer views/drag-select.ts (+ shared
      drag-select-state.ts to avoid a drag-handle circular import) —
      background press + drag draws a rubber-band rect (container-level
      div, .docs-drag-select-rect); intersecting top-level blocks become a
      contiguous multi-selection (plugin state {from,to,dragging} + node
      decorations .docs-block-multi-selected, same look as selectednode).
      Grip drag on a selected block moves the WHOLE range (drag-handle
      sets dragging:true + range slice; drag-select handleDrop does one
      delete+insert via moveRangeTr, selection follows the move). Escape
      clears; Backspace/Delete removes the run (extension priority 200 so
      the guards precede base keymaps); any doc edit dissolves; plain
      background click re-places the caret manually (mousedown is
      preventDefaulted). buildDragGhost now takes HTMLElement[] (stacked
      clones for multi-drag). Rail: Editor → "Drag select" nested section
      (color + fill opacity 2-60%, default theme blue @ 12%) →
      --docs-dragselect-color/-opacity consumed in index.css (border =
      fixed 60% mix of the color). Tests: drag-select.test.ts (8: state
      lifecycle, keyboard, moveRangeTr both directions + no-op) +
      drag-handle multi-ghost test; geometry (blockRangeForRect) is
      layout-dependent — Ford's visual pass covers it. make check green.
      REWORK same day (Ford: band must start like a screenshot drag from
      anywhere, not just the editor's own background element): mousedown
      listener moved to the nearest scrollable ancestor (findScrollRegion;
      document fallback) so page margins + gaps + the run-out beside a
      line all start the band; only presses ON text
      (span[data-doc-node=docBlockText]), inside node views
      ([data-node-view-wrapper]), or on controls (BAND_EXCLUDED_SELECTOR)
      are excluded. Rect is now a body-level position:fixed overlay
      (unclipped by the scroll region); margin plain-clicks deselect
      without placing a caret (in-column clicks still place it).
      Ford-verified the band UX; border then REMOVED per Ford (borderless
      soft fill only, index.css). Awaiting his look at the borderless
      rect.
    - R2-D8 Interaction-surfaces canvas restructured to containment
      (2026-07-17, next sitting): canvases/interaction-surfaces.canvas.json
      (CANVAS SIBLING REPO, uncommitted) rewritten — arrows removed;
      "Canonical document state — stable, validated, addressable" is now a
      violet SECTION inside one-state-two-readers, containing two nested
      sections "Human surface" (blue: Direct manipulation + Workbench
      sticky) and "Agent surface" (green: Rendered markdown/typed actions
      + CLI sticky) plus the red contract pill. Nesting = the "both read
      one state" visual. Machine-verified: validateInteractiveCanvasDocument
      ok + fit=content section render contains all labels, no connectors.
      If Ford has the board open in Studio, RELOAD Studio before editing it
      there (stale in-memory state would overwrite the file). Awaiting
      Ford's visual check.
    - R2-D7 Drag-opacity governs the whole floating block (2026-07-17,
      next sitting): Chromium snapshots the drag image AFTER dragstart
      returns — by then the source was dimmed/highlight-stripped, so the
      floating copy was a washed-out fragment the knob couldn't reach.
      drag-handle.ts now builds an offscreen body-level clone
      (buildDragGhost, exported) for setDragImage; index.css
      .docs-drag-image puts --docs-drag-opacity on it, so the knob dims
      the ENTIRE dragged block (text/backgrounds/embeds) and the source
      ghost alike. Ghost removed on dragend/destroy. Follow-up (Ford:
      "text size changes on pickup"): the body-level ghost escaped the
      .docs-markdown typography cascade and rendered at body-default
      size — buildDragGhost now copies the closest .docs-markdown
      wrapper's className onto the holder so the clone re-enters the
      cascade. drag-handle.test.ts covers both (4 tests). Awaiting
      Ford's visual check.
    - R2-D6 Bottom padding layout token (2026-07-17, next sitting): the
      style rail's Layout tab gained "Bottom padding" (0-240px, default
      24) mirroring Top padding end-to-end — StyleRailSettings.layout
      .bottomPadding, clamp in normalize, --style-content-bottom CSS var,
      slider row; DocPage content wrapper's hardcoded pb-6 now reads
      pb-[var(--style-content-bottom,1.5rem)]. Rides the D19 living-theme
      auto-save like every rail token (older saved manifests without the
      key fall back to the default via normalize). Follow-up same day:
      bottom padding range raised to 0-600; NEW scrollbar "Padding" knob
      (scrollbar.padding 0-12px, default 0, --docs-scrollbar-padding) —
      transparent-border inset in index.css, track widens by 2x inset so
      the thumb keeps its set width. Awaiting Ford's visual check.
    - R2-D5 Drag grip on atom blocks (2026-07-17, next sitting): the grip
      never appeared for atom blocks (image/video/canvas/divider/etc) —
      `posAtDOM(block,0)-1` assumed border-1 text blocks; atoms are border
      0, so the pos missed and the grip bailed. Fixed via exported
      topLevelBlockPos helper (resolve + .before(1) normalization) in
      docs-viewer views/drag-handle.ts; new drag-handle.test.ts (2 tests,
      all 14 block shapes' positions + atom NodeSelection). 290 viewer
      tests green. Awaiting Ford's visual check.
    - R2-D3/D4 Canvas embed de-framing (2026-07-17, next sitting): the
      docs-page canvas embed lost its header bar (kicker/title/button row);
      Edit-in-Canvas + expand are now hover-revealed overlay controls
      (Notion-embed style). Section previews render CONTENT-FITTED: new
      `fit=content` option in the CANVAS SIBLING REPO
      (~/Github Repos/Codecaine/canvas — renderer static-svg.ts + types.ts,
      preview route canvas-file-api.ts parses fit/pad, 2 new renderer
      tests; UNCOMMITTED THERE, typecheck + 15 render tests green) — omits
      the section frame rect + title chip, fits member bounds + 16px world
      padding; docs-side CanvasEmbed requests fit=content for section
      views and sizes the image naturally (16:9 letterbox removed).
      Studio dev server may need a restart to pick up the plugin change.
      Awaiting Ford's visual check.
    - R2-D2 Paste-corruption incident + root-cause fixes (same day):
      - INCIDENT: Ford copy/pasted manifesto content into
        00-interaction-surfaces; the reference chip's attrs serialized to
        the clipboard as the literal string "[object Object]" and were
        object-spread into {"0":"[","1":"o",...}; the save was ACCEPTED,
        and the bundle then failed load-validation (unopenable in UI).
      - Repair: .tmp/repair-broken-refs.ts scanned all 45 docs, found
        exactly 1 broken span, dropped the junk reference (chip → plain
        text), canonical bytes rewritten. Ford's in-progress content
        edits (manifesto opening rework into list items; "One state, two
        readers" section moved into interaction-surfaces) PRESERVED as
        disk truth; goldens regenerated over them.
      - Clipboard fix (docs-viewer, Fable subagent): THREE corruption
        paths — reference chip ref attr (default TipTap attr serializer),
        blockProps rendered:false (paste silently reset props — that's
        how the pasted callout lost its title), and atom blockText.
        Now JSON-encoded data attributes (data-doc-reference-payload,
        data-block-props, data-block-text) with defensive parsing
        (validateSpectreRef gate; malformed → plain text / safe
        defaults) + conversion-boundary guards in convert.ts so invalid
        clipboard data can never reach a span again. New
        clipboard-roundtrip.test.ts; 288 viewer tests green.
      - Save gate (docs-server, Fable subagent): applyDocOpsToBundle now
        runs validateDocDocument on the full resulting doc BEFORE
        persisting; failure → 422 + issues, file untouched; success
        persists the validator's normalized doc. Gates /api/ops (the
        editor autosave route), /api/move, /api/undo (all converge on
        that seam). Root cause: applyOp validated props but copied text
        spans verbatim. New doc-validation-gate.routes.test.ts (5 tests,
        incl. the literal incident shape). 107 server tests green.
      - Close-out gate: make spa, goldens regen (45), backlinks rescan
        (119 refs — one fewer, the repaired chip), links 0 stale,
        make check 871 pass / 4 skip / 0 fail.
      - Ford VERIFIED this sitting ("everything has been done and
        checked" 2026-07-17): paste flow + R2-D1 visuals confirmed.
        (Save gate needs a make dev restart to be live; assume Ford
        restarted since he verified the paste flow.)
</completed>

<in_progress>
    - THE CORE OF ROUND 2 IS STILL OPEN: the per-doc CONTENT read-through.
      Ford reads each doc in the workbench for accuracy/voice and issues
      directives; the ledger walk resumes at docs/00-foundation/00-manifesto
      and proceeds in tree order (00-interaction-surfaces →
      10-doc-architecture → 20-data-model → …). This second sitting was
      consumed ENTIRELY by editor/UX directives (D3-D12) — zero ledger
      READ verdicts were recorded; rows still say "needs Ford's read".
    - Ford was actively editing 00-interaction-surfaces this sitting (The
      Issue / The Solution / Shared State sections are his live text) and
      may still be mid-rewrite of the manifesto opening. Two mid-edit
      artifacts were deliberately left in the manifesto for him earlier:
      the broken opening sentence ("…our species is not any specific
      entity.") and the orphaned fragment "software needs that channel —
      and because…". Verify they're still relevant before flagging.
    - Awaiting Ford's visual check (fresh session should ask): D12 title
      rename (the click fix landed AFTER his last test — plan in chat
      history; re-give it), the borderless drag-select rect, and the
      page-title look across docs that kept a richer opening H1.
</in_progress>

<next_actions>
    - FIRST: Ford re-tests the D12 title rename (click title → caret in;
      rename → sidebar follows, prefix kept; Escape reverts). If he
      renames a REAL corpus doc and keeps it, the agent must run the
      rename cascade: CORPUS_PATHS in goldens.test.ts, golden file
      rename/regen, backlinks rescan, links check.
    - THEN: resume the ledger read-through at 00-manifesto and walk
      forward. Per doc: Ford reads, issues directives, agent lands them,
      row gets a verdict. Also collect his per-doc call on kept opening
      H1s (page title + richer H1 now stack — retitle folder, reword H1,
      or leave).
    - COMMIT STRATEGY (overdue, Ford's call): the uncommitted tree now
      holds R2-D1..D12 in docs-system plus fit=content + the restructured
      interaction-surfaces canvas in the CANVAS sibling repo. Suggest:
      one docs-system commit for R2-D1/D2 (foundation + paste fix), one
      for the D3-D12 editor/UX batch, one canvas-repo commit for
      fit=content + the canvas doc; D19's themes/default/ rides with the
      theme workstream (parallel session's note).
    - Ford still to explicitly test from round 1: @-references, video
      drop, dark-mode sweep (scrollbar, grip, highlight), D18 grip
      click/fade, D19 Default living theme.
</next_actions>

<risks_or_open_questions>
    - OPEN (Ford calls) from R2-D1:
      - 30-block-vocabulary/00-overview still opens "written primarily for
        agents to read" — audience claim vs the symmetric-surfaces stance
        (sweep left it deliberately; flagged in ledger).
      - framework 40-templates: example skeletons still show covers/concepts
        YAML that bundles don't carry (aspirational — strip or keep?).
      - framework 40-templates/30-L2-section-overview/system-overview.md:
        stray 272-line unreferenced "Advisor Copilot" example — delete/
        number/move?
      - /docs:* slash commands referenced in framework are host-installed,
        unverifiable here (only /docs:sync was provably dead and removed).
    - OPEN (Ford, carried): his early-typing manifesto paragraphs were
      folded into the rewrite as substance, not verbatim — confirm the
      rewrite covers what he meant.
    - OPEN (new this sitting, Ford calls):
      - Block drops can no longer nest into callouts (D10's top-level
        clamp is deliberate) — revisit if Ford wants Notion-style
        nest-into-callout with a proper drop indicator.
      - Intentional nesting still in the corpus from authoring (e.g. the
        callout under the agent-surface "Writing is typed operations"
        paragraph in 00-interaction-surfaces) — untouched by the
        staircase repair; Ford may want it top-level during read-through.
      - 24 docs kept a richer opening H1 under the new page title (see
        ledger note "title strip") — per-doc call during read-through.
      - Canvas repo: if Ford has the interaction-surfaces board open in
        Studio, he must RELOAD Studio before editing it there (stale
        in-memory state would overwrite the D8 restructure).
      - Band-drag while the page scrolls mid-drag doesn't retrack until
        the next mousemove (viewport-fixed rect) — known v1 simplification.
    - PARKED (unchanged from round 1): SPA relative API URLs / path-style
      deep links; own-save changed-flash (actor-tagged SSE); editor
      code-block commenting; syntax auto-detect; custom font FILES;
      repo-theme base chains vs builtins; drag grip top-level only (the
      GRIP; drag-select multi-move is in as of D9); AFFiNE "+" insert
      button; theming v2.
    - PARKED (new): rename projectToMarkdown/goldens-projection code
      identifiers to render vocabulary (docs prose already switched);
      "render the framework skill FROM the corpus" = framework north star
      (recorded in 70-framework doc + here).
    - git stash@{0} "stray slash paragraph (retest)" is junk — drop when
      convenient. Untracked planning files at root still await Ford's call.
    - Known test flakes: DocsBlockLibrary happy-dom teardown (rerun);
      exactly-5000ms subprocess timeouts = stale SPA cache → make spa;
      workbench.test.tsx "409 stale save" save-state race ("saving" vs
      "error") — only under full-package runs, passes in isolation.
</risks_or_open_questions>

<important_paths>
    - objectives/docs-dogfood-review/review-ledger.md — 45 rows, new paths
    - docs/00-foundation/00-manifesto — the rewritten thesis
    - docs/10-system-design/00-interaction-surfaces + 10-doc-architecture —
      the two new design docs (R2-D1)
    - docs/10-system-design/{20-data-model,30-block-vocabulary,
      40-mutation-model,50-packages} — renumbered sections
    - packages/framework/ — the slimmed loadable skill (SKILL.md first)
    - packages/docs-model/src/__tests__/goldens.test.ts (CORPUS_PATHS) +
      components/__tests__/schema-over-corpus.test.ts (count = 45)
    - .tmp/regen-goldens.ts — regenerate ALL goldens from disk state
    - .tmp/author-foundation-round2.ts — R2-D1 authoring source (audit)
    - .tmp/repair-solution-staircase.ts + .tmp/strip-duplicate-title-headings.ts
      — this sitting's corpus repair/sweep scripts (audit)
    - packages/docs-viewer/src/editor/views/drag-select.ts (+
      drag-select-state.ts, drag-handle.ts) — band select, multi-move,
      top-level drop clamp, buildDragGhost
    - packages/docs-workbench/web/src/lib/doc-title.ts — page-title
      derivation + rename slugging; DocPage.tsx carries the editable title
    - packages/docs-workbench/web/src/shell/StyleRail.tsx — rail knobs
      (this sitting added: bottomPadding, titlePadding, scrollbar.padding,
      dragSelect; a PARALLEL session owns the `list` group)
    - CANVAS SIBLING REPO (~/Github Repos/Codecaine/canvas, uncommitted):
      packages/canvas/src/render/static-svg.ts + types.ts (fit=content),
      packages/studio/server/canvas-file-api.ts (fit/pad params),
      canvases/interaction-surfaces.canvas.json (D8 containment layout)
</important_paths>
</current_state>
