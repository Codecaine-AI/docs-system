<current_state>
<last_updated>2026-07-16 (round 1 close-out)</last_updated>

<status>
    - ROUND 1 of the dogfood review is COMPLETE: one full working day
      (2026-07-16), 17 directives landed, all Ford-tested unless noted.
      The session was editor/theming-UX heavy; the doc read-through
      (ledger) has NOT started yet — that is round 2's job.
    - Suite state: make check 856 pass / 1 fail. The ONE failure is
      docs/00-foundation/00-manifesto's projection golden: Ford's drag
      test moved "The agent-read markdown projection..." below "Humans
      get the same blocks..." and his move-back landed wrong. Fix = drag
      it back above in the app, or bless the new order and regenerate the
      golden. Everything else green; links 0 stale.
    - CORPUS IS NOW 43 DOCS (was 37): theming section (5) + rich-text
      overview (1) added; block-vocabulary regrouped by component.
    - WORKING MODE (hard rules, also in context/03): agent implements +
      machine-verifies ONLY (tests/typecheck/make spa+check); agent NEVER
      verifies UI by looking at it — every UI change ships a numbered
      test plan and Ford tests/screenshots; agent never types into corpus
      docs via any browser.
</status>

<completed>
    ROUND 1 (2026-07-16), all uncommitted, chronological:

    - Boot reconciliation: fixed half-landed StyleRail topPadding knob
      (presets + type error) that had typecheck red.
    - D1 Editor UX 101 (4 feedback rounds, Ford: "lists feel right"):
      - Block markdown input rules were structurally dead (they targeted
        the docBlockText WRAPPER; the real schema is "docBlockText
        block*"). New schema-aware factories convert the parent block:
        editor/input/block-convert.ts. Test harness rewritten against the
        real nested schema (it had been flattening, masking the bug).
      - Input rules segmented per component: components/rich-text/ and
        components/code/input-rules.ts + thin aggregator.
      - Cursor-flash fixed: DocEditor reseed skips setContent when the
        SSE echo of our own save is byte-identical to the baseline.
      - Notion inline-code chip (red text, no CSS backticks) on both
        surfaces; INLINE_CODE_CLASSES + --docs-inline-code-fg/bg.
      - Lists: real numbered markers via CSS counter runs (depth-cycled
        1./a./i.), Notion 24px marker-box metrics, zero nested-children
        indent, no gray "List" placeholder, Tab/Shift-Tab indent/outdent
        (children ride; followers absorbed on outdent), Enter on empty
        nested item outdents (top-level converts), Backspace ladder:
        nested item outdents, top-level strips to paragraph, paragraph
        merges into the DEEPEST last block of its previous sibling in one
        press.
    - D2 Marks + third-char triggers + real code block: bold+inline-code
      are the only auto-converting marks (Ford; StarterKit's own italic/
      strike input rules stripped via DocItalic/DocStrike in rich-text/
      editor-marks.ts); ---/``` fire on the third character; editor code
      block got live syntax highlighting (editor-highlight.ts decorations
      over highlightCodeTokens — same grammars/classes as read surface)
      and a hover language picker node view (editor-node-view.tsx).
    - D3 Component file-tree breakdown: rich-text split one-file-per-
      sub-component (paragraph.tsx ... video.tsx, descriptor + editor
      node co-located; descriptors.tsx/editor-nodes.ts now aggregators);
      code/ renamed to editor-* plane naming.
    - D4 Block highlight + drag grip: changed-flash re-colored soft blue
      (was warning orange); node selection = soft blue fill; NEW
      dependency-free ⠿ drag grip (editor/views/drag-handle.ts) —
      hover-tracked, hands PM's native node-drag the slice, top-level
      blocks v1. Fixed offsetParent positioning bug (never cache ancestor
      lookups in a PM plugin-view constructor).
    - D5 Highlight styling knobs (3 rounds): rail knobs for highlight
      color/rounding/padding (same-color shadow spread = no layout
      shift), drop-line color/thickness/opacity/rounding, drag ghost
      opacity; Notion drag feel (held block dims, highlight lands on
      drop via .docs-block-dragging).
    - D6 Grip position (12px gap / 6px down) then full "Drag grip" rail
      knobs: gap/vertical offset/size/color (position vars read at show
      time via pixelVar()).
    - D7 Theming as first-class: canonical 3-tier contract WRITTEN as
      theme/semantic.css header (palette -> semantic tokens both blocks ->
      consumers; rail = runtime overlay; consumers never branch on mode);
      per-surface font tokens --docs-font-code/-numeric + rail Code/
      Number font selects.
    - D8 Theming corpus doc + theme export/import buttons (settings blob
      as docs-theme.json; imports normalize/clamp).
    - D9 Theme folders (all 3 phases, design aligned via Q&A): JSON token
      files with per-token {light,dark}; themes/<id>/ in the repo served
      by docs-server (GET/POST /api/themes, slug-confined, 5 route
      tests); loader/compiler theme-folders.ts (THEME_TOKEN_REGISTRY,
      base chains vs builtins, CSS injection); rail theme picker +
      Save-as-theme; themes/example scaffolded.
    - D10 Theming doc -> 5-doc SECTION (00-overview with who-decides-what
      table, 10-global-themes, 20-component-themes, 30-fonts,
      40-system-ui with the deliberately-fixed table + full knob map).
    - D11 "chrome" term purge repo-wide (docs, code comments,
      data-docs-target-ui attr rename, overlayUi prop, editor-controls
      file) — zero grep hits outside the purge record; memory saved.
      VOCAB: system UI / wrapper / framing / panel — never "chrome".
    - D12 Per-component themes: registry = ONE FILE PER BLOCK TYPE (all
      14) + shell/surfaces/inline-code/editor-controls; ~20 new semantic
      tokens both blocks; component wiring delegated to one Fable
      subagent (all 14 wired, host-neutral fallbacks); every vocabulary
      doc gained a "Theming" section (file/keys/vars table).
      INTENTIONAL: structured-table headers went Notion-neutral gray
      (indigo identity removed; recoverable as a one-line theme file).
    - D13 Vocabulary regrouped by component: 10-rich-text/ folder
      (00-overview + 8 types renumbered) + 20-code ... 70-canvas peers;
      moves via store.moveDoc (references auto-rewritten); corpus 43.
    - D14 Rail 30rem wide; sidebar Dark/Light button removed.
    - D15 Rail v2: tabs removed -> vertical collapsible sections
      (persisted open state) + per-component Components section writing
      overlay vars; Save-as-theme emits real components/*.json.
    - D16 Rail v3 (Ford's approved ASCII): TWO tabs — Theme (Themes /
      Colors / Typography / Components / Background effect w/ nested
      Softening) and Layout (Column / Surfaces / Scrollbar / Editor w/
      nested Highlight, Drop line, Drag grip); built-ins trimmed to
      Default + Dark only (presets deleted); Default/Dark = full overlay
      reset on select.
    - D17 Rail text forced full off-black #37352F (no opacity-washed
      classes anywhere) + NEW Scrollbar section (width 4-20px / color /
      opacity via ::-webkit-scrollbar vars; standard scrollbar-color
      props removed — Chromium ignores webkit styling when they're set).
    - D18 Grip polish (NOT yet Ford-verified — first change under the new
      no-agent-UI-verification rule): plain CLICK on the grip selects the
      block (NodeSelection -> highlight fill, editor focused); grip
      visibility moved from display toggling to a
      .docs-drag-handle-visible class with opacity fade (140ms) +
      top/left glide (120ms) so it never pops — hidden state keeps the
      element in the layer (offsetParent readable) with pointer-events
      none. drag-handle.ts + index.css. Machine-verified only: 310 pass
      on rerun (known flake once), make check 856 / 1 standing manifesto
      fail, typecheck clean.
      - Feedback round (Ford: no sliding): position glide REMOVED —
        transition is opacity-only (100ms); block-to-block moves now
        SEQUENCE fade-out at the old block -> reposition -> fade-in
        (GRIP_FADE_MS 110ms timer in drag-handle.ts, cancelled on
        rapid moves/hide/destroy). Machine-verified only; same gate.
      - Round 2: grip fade is now a rail knob — Drag grip section gains
        "Fade" (0-400ms, default 100; 0 = instant). grip.fadeMs setting ->
        --docs-grip-fade var; CSS transition reads it; the JS handoff
        timer reads the var via gripFadeMs() + 10ms beat. Knob-map doc
        row updated + goldens. Machine-verified only; same gate.
</completed>

<in_progress>
    - Nothing mid-flight. One red test standing (manifesto paragraph
      order — Ford's call, see status).
</in_progress>

<next_actions>
    - ROUND 2 = the actual read-through: start the ledger at
      docs/00-foundation/00-manifesto and walk forward. 6 rows already
      filled (the theming section + rich-text overview, authored fresh,
      need Ford's read pass); 37 rows open.
    - Resolve the manifesto paragraph order (drag back or bless+regen).
    - Ford still to explicitly test: @-references, video drop, dark-mode
      sweep over the newest UI (scrollbar, grip, highlight in dark).
    - Decide commit strategy: the ENTIRE round (plus the prior day's
      restructure) is uncommitted — suggest one commit per workstream
      (editor UX / theming system / corpus restructure / rail).
</next_actions>

<risks_or_open_questions>
    - OPEN (Ford): his early typing added three manifesto paragraphs
      ("Defining the identity of software...", "Agents can introduce
      massive amounts of slop...", "This projects goal...") that were
      reverted as test junk — reinstate as real content if intended.
    - Parked follow-ups: SPA relative API URLs break path-style deep
      links (hash URLs fine; fix in web/src/data/api.ts); changed-block
      flash fires on your OWN saves (fix wants actor-tagged SSE = server
      change); editor code-block commenting (read surface has
      CodeAnnotations; own directive); syntax auto-detect beyond JSON
      sniff; custom font FILES (@font-face pipeline — designed in
      30-fonts doc); repo-theme base chains resolve vs builtins only;
      drag grip = top-level blocks only (nested via Tab/Shift-Tab); no
      AFFiNE "+" insert button; theming v2 (unify legacy --docs-viewer-*
      names, custom font-stack text input, more rail color knobs).
    - git stash@{0} "stray slash paragraph (retest)" is junk — drop when
      convenient. Untracked planning files at root (BLOCK-ARCHITECTURE*,
      REVIEW-TOUR-PROMPT.md, to_add/, .tmp/) still await Ford's call.
    - Known test flakes: DocsBlockLibrary happy-dom teardown (rerun);
      exactly-5000ms subprocess timeouts = stale SPA cache -> make spa.
</risks_or_open_questions>

<important_paths>
    - objectives/docs-dogfood-review/review-ledger.md — progress record
      (43 rows)
    - docs/ — the 43-bundle corpus (block vocabulary grouped by
      component; theming section at 20-implementation/40-theming)
    - themes/ — repo theme folders (example/); built-ins compiled into
      theme-folders.ts
    - packages/docs-viewer/src/components/ — one file per sub-component
      (descriptor + editor node + input rules + marks)
    - packages/docs-viewer/src/editor/ — DocEditor, keymap (Notion
      Enter/Backspace/Tab), block-convert input-rule factories,
      drag-handle, node views
    - packages/docs-workbench/web/src/theme/ — notion-palette.css,
      semantic.css (THE contract, read its header), theme-folders.ts
      (registry/loader), style-rail.css
    - packages/docs-workbench/web/src/shell/StyleRail.tsx — the rail
      (two tabs, collapsible sections, Components overrides)
    - packages/docs-server/src/themes.ts + routes — theme folder API
    - packages/docs-model/src/__tests__/goldens.test.ts (CORPUS_PATHS) +
      components/__tests__/schema-over-corpus.test.ts (count = 43)
    - .tmp/ — authoring/normalization scripts (author-theming-section.ts,
      add-theming-sections.ts patterns)
</important_paths>
</current_state>
