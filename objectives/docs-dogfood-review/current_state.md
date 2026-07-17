<current_state>
<last_updated>2026-07-17 (round 2: R2-D1 landed; R2-D2 paste-corruption incident fixed — awaiting Ford's pass)</last_updated>

<status>
    - ROUND 2 in progress. Landed this sitting: R2-D1 (foundation rewrite,
      via a full pre-implementation interview with Ford) and R2-D2 (the
      paste-corruption incident + its three-layer root-cause fix). Both
      Ford-checked ("everything has been done and checked" 2026-07-17);
      still awaiting Ford's ledger READ pass on the R2-D1 docs.
    - Suite state: make check 871 pass / 4 skip / 0 FAIL (was 857 before
      the R2-D2 fixes added 14 tests). The round-1 manifesto-golden
      failure is GONE (superseded by the rewrite). Links check 0 stale;
      backlinks rescanned (45 sources / 119 refs — one fewer after the
      repaired paste chip went to plain text).
    - CORPUS IS NOW 45 DOCS (was 43): +00-interaction-surfaces,
      +10-doc-architecture. System-design RENUMBERED: data-model→20-,
      block-vocabulary→30-, mutation-model→40-, packages→50-.
    - NEW CANON VOCABULARY (enforced corpus-wide, memory saved):
      "projection" = specs→code ONLY (docs define the function; code is the
      current projection). The per-reader forms are RENDERED INTERACTION
      SURFACES: human surface = workbench Notion-style editor; agent
      surface = rendered markdown via CLI. The doc.json is the "canonical
      state" that neither reader touches. Code identifiers
      (projectToMarkdown, goldens/projection/) unchanged — rename PARKED.
    - Round 1 work is committed (b55ecfd "lots of changes"). Today's R2-D1
      work is uncommitted. NOTE: a PARALLEL session appended round-1 D19
      (Default-only living theme, preserved below) to this file mid-day
      2026-07-17 — watch for concurrent edits when updating this bundle.
    - WORKING MODE unchanged (hard rules in context/03): agent implements +
      machine-verifies only; Ford is the only UI verifier; never type into
      corpus docs via a browser. R2-D1 execution mode per Ford: all-Fable
      subagents, NO codex, for this directive.
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
    - R2-D1 mechanics + R2-D2 fixes are Ford-CHECKED. Still open: the
      per-doc CONTENT read-through (the core of round 2) — Ford reads
      each R2-D1 doc in the workbench for accuracy/voice and issues
      directives. Ledger rows for the authored/swept docs still say
      "needs Ford's read"; the walk resumes at 00-manifesto.
    - FORD MAY STILL BE MID-REWRITE of the manifesto opening (his own
      voice: lineage as list items, "ideas are getting more complex"
      line) and moved the
      "One state, two readers" section into 00-interaction-surfaces. Two
      mid-edit artifacts deliberately left in the manifesto for him: the
      broken opening sentence ("…our species is not any specific entity.")
      and the orphaned fragment "software needs that channel — and
      because…". The repaired chip is now plain text "interaction
      surfaces" in the pasted paragraph (re-chip it in the editor if
      wanted, post-restart).
</in_progress>

<next_actions>
    - Ford RESTARTS make dev (picks up the save gate + clipboard fix),
      then tests R2-D2 paste flow (chat test plan) and R2-D1.
    - Then resume the ledger read-through at docs/00-foundation/00-manifesto
      (which doubles as the R2-D1 review) and walk forward in the new
      order: 00-interaction-surfaces → 10-doc-architecture → 20-data-model…
    - Commit strategy for today's uncommitted R2-D1 work (suggest: one
      commit — it is one coherent directive). D19's themes/default/ rides
      with the theme workstream per the parallel session's note.
    - Ford still to explicitly test from round 1: @-references, video drop,
      dark-mode sweep (scrollbar, grip, highlight), D18 grip click/fade,
      D19 Default living theme.
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
    - PARKED (unchanged from round 1): SPA relative API URLs / path-style
      deep links; own-save changed-flash (actor-tagged SSE); editor
      code-block commenting; syntax auto-detect; custom font FILES;
      repo-theme base chains vs builtins; drag grip top-level only; AFFiNE
      "+" insert button; theming v2.
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
</important_paths>
</current_state>
