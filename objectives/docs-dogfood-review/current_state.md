<current_state>
<last_updated>2026-07-21 (round 2, FOURTH+FIFTH SITTINGS: the doc-by-doc walkthrough rebuilt system design — doc-standards 5 children, translation-layer sectionified, data-model complete (block-design 6 children, annotations rename incl. CODE, serialization, mutation-model split, componentAction rename incl. CODE). Corpus 60. NEXT THREAD: resume walkthrough at 40-block-vocabulary)</last_updated>

<status>
    - DOC-STANDARDS RESTRUCTURE (2026-07-20, fourth sitting, doc-by-doc
      loop): Ford interviewed per doc; the section was RENAMED
      10-doc-architecture → 10-doc-standards (his standing call, resolved)
      and rebuilt to FIVE children: 10-structure (hierarchy-layers +
      directory-structure MERGED; depth ladder GENERALIZED to every layer
      — his call, it was implementation-pinned), 20-numbering (was 30),
      30-cross-doc-linking (was 50-doc-linking; REWRITTEN around his four
      link rules: canonical home only, first mention, no ancestor links,
      link-as-claim; 50-doc-linking OPEN CALL RESOLVED via Decision
      callout "top-down with canonical-home crossings" — the 14
      block-vocab type-page up-references were unwrapped to plain text),
      40-code-linking (was 60; + pointer to in-code docs), 50-in-code-docs
      (NEW: file headers / docstrings / inline comments = the L4/L5
      story). 40-titles-and-openings DELETED — ported to writingstyle.md
      ("Titles and openings" section; Ford: style, not structure).
      SECTION OVERVIEW fully rewritten earlier same sitting from his
      framing (bet / many-agents scale rationale / layers table /
      why-travels-with-decisions / file-tree of corpus shape).
      Corpus 52 → 51. Moves via /api/move (section rename + 3 child
      renumbers; NOTE: /api/move does NOT rewrite refs INSIDE the moved
      subtree — swept by script). Scripts: .tmp/rewrite-docarch-overview-
      v2.ts, .tmp/generalize-hier-ladder.ts (superseded by the merge),
      .tmp/restructure-doc-standards.ts. Framework pointer lines re-pathed
      (SKILL.md 5-standards list; 25-frontmatter-schema → writingstyle.md);
      framework copy CONTENT still describes the old 6-doc split — sync
      pending Ford / Phase C. Pipeline: goldens 51 regen, backlinks
      51/114, links 0 stale, audit 3 errors (all the parallel session's
      docs/assets) / 4 warnings (pre-existing W1+W4s). CASCADE NOTE for
      the parallel session (or safe to do here if it stalls):
      CORPUS_PATHS + counts now need 51 with the 10-doc-standards paths.
    - LAID-OUT RESHAPE (same sitting, Ford's follow-up directive): the five
      standards docs dropped their "In this corpus" prose sections; each
      now flows "How it's laid out" (a REAL component: file-tree in
      structure/numbering + the overview, annotated JSON code blocks in
      cross-doc-linking/code-linking, an annotated TS header+docstring
      excerpt in in-code-docs) → The rule → Why. Corpus facts moved into
      component notes. GOTCHA: file-tree entries without a trailing "/"
      render as FILES and sort after directories (00-foundation fell to
      the bottom) — all tree entries now carry the "/" directory marker
      (.tmp/tree-entries-dirslash.ts). Goldens 51, backlinks 51/114,
      links 0 stale after reshape.
    - DE-CORPUS + BULLETIZE (2026-07-21, Ford's directives: "Docs
      Inception" self-reference out; bullets/sub-bullets are the writing
      default): .tmp/decorpus-bulletize.ts swept "the corpus" phrasing to
      "the docs"/"the doc tree" across the doc-standards section (14
      replacements + 1 code-annotation note); every why-section is now
      bold-lead fact bullets; in-code-docs' reading-flow para is a lead
      bullet with 3 sub-bullets; the parent-doc abstract nests under its
      rule bullet. writingstyle.md gained the bullets-and-sub-bullets
      default rule (Structure section, first bullet). FORD LIVE EDITS
      honored as disk truth: overview opener merged (H1 gone, bet folded
      into first para), structure intro rebuilt with his Layer/Depth
      bullets, litmus paragraph DELETED by him (bulletization skipped).
      FLAGGED to Ford, not fixed: structure intro grammar slip "Every
      doc's home is decided on two axes decide it". Goldens 51, backlinks
      51/114, links 0 stale.
    - SUBSTRUCTURE REFOCUS (2026-07-21, after Ford REWROTE the doc-
      standards overview himself — layers table + why-bullets + sub-
      bullets now live THERE): 10-structure refocused on L1–L6
      (.tmp/structure-substructure-focus.ts) — layers section removed,
      tree annotated L1/L2/L3, ladder table + 3 bullets, folders rules,
      4 why bullets; Ford's litmus + purity deletions honored; his
      two-axes intro replaced per the refocus (nested pm sub-bullets
      dropped — workbench undo holds them; grammar-slip flag now moot).
      20-numbering tree now shows mechanics incl. a marked hypothetical
      25-new-standard mid-gap insertion. Goldens 51, backlinks 51/113,
      links 0 stale. NOTE: purity test (design stays code-agnostic) now
      lives NOWHERE after Ford deleted the callout — flag if he wants it
      back somewhere (overview table row? structure why?).
    - WHY SECTIONS FROM FORD'S DICTATION (2026-07-21, .tmp/why-sections-
      ford.ts): STRUCTURE why = 3 lead bullets w/ subs — on disk next to
      the code (plain file access, no special tooling, tracks with the
      source), progressive disclosure (concept doc → file header →
      docstrings; each level rules the next in or out), a clear place
      for everything (humans walk the numbered tree; agents search the
      same explicit structure). NUMBERING why = human-first/agent-second:
      "Ordered for human reading" replaces the old read-order bullet
      (Ford's misplaced "docs live alongside the repo" sub moved to
      structure's on-disk bullet); NEW "A clean search path for agents";
      his "Insertion is local" + "Exhaustion is a signal" kept VERBATIM.
      Goldens 51, backlinks 51/112, links 0 stale.
    - LINK OBJECTS + BULLET PATTERN (2026-07-21, Ford's directives at the
      linking docs; numbering + structure APPROVED by him): doc ref =
      {kind:"doc", path} — NO label field, the span text inlines the
      target's name; code links = typed {kind:"source", path} spans
      verified by links check. LANDED: (1) CODE — delta-markdown.ts
      renders references span-text-first (and wraps inline marks, so
      code-marked source refs keep backticks); convert.ts strips legacy
      `label` from refs on save; reference-node.tsx no longer writes
      label on insert; validateSpectreRef emits only DEFINED keys (the
      old undefined-materializing rebuild made key-counting diff equality
      see phantom edits); docs-cli links check now accepts DIRECTORY
      source targets (package roots legal). (2) SWEEP (.tmp/link-objects-
      and-bullets.ts): 112 labels dropped corpus-wide; 66 real-path code
      spans → code+source-ref (existsSync-gated, hypothetical paths left
      plain); fixture sample.doc.json label dropped. (3) DOCS — 30-cross-
      doc-linking + 40-code-linking rewritten around the objects with
      laid-out JSON examples; bold-label bullet pattern (label-only top
      bullets, facts as sub-bullets — writingstyle.md rule added) applied
      there + numbering/in-code-docs why+rule leads. TESTS: viewer 459/0
      (delta-markdown + convert fixtures updated to label-less refs);
      docs-model 4 fail = ALL parallel-owned (2 CORPUS_PATHS ENOENT,
      count 53≠51, file-tree strict-write vs their uncommitted state.ts).
      Backlinks 51 sources / 177 refs (was 112 — source refs now
      indexed); links 0 stale. NOTE: pre-existing fs-watch.ts FSWatcher
      typecheck error on committed code, untouched.
    - INTERACTION SURFACES SECTION-IFIED (2026-07-21, Ford's interview
      calls: idea+issue stay in overview / paragraph-first opening /
      richer-render callout DROPPED): .tmp/sectionify-interaction-
      surfaces.ts. Overview = opener para + canvas + Ford's "The Issue"
      VERBATIM + deduped Solution (3 paras; paste dupes gone) + surfaces
      index + symmetry table. NEW 10-human-surface + 20-agent-surface
      (each: reading / writing-or-editing / why in the bullet pattern;
      agent doc has a docs render/grep code example; both ref the
      mutation model as the ops home). Corpus 51→53 (!!— CORPUS_PATHS
      cascade target moved AGAIN, parallel-owned: needs 53 with
      doc-standards + surfaces children paths). Goldens 53, backlinks
      53/177, links 0 stale, audit W4 canvas-opener RESOLVED (3 errors
      remain = parallel session's docs/assets).
    - DATA-MODEL PASS OPENED (2026-07-21, Ford: GO SLOWER — "the core
      underpinning", things changed a lot; per-doc interviews + code
      fact-checks). Interview calls: (1) overview = FIVE SHAPES + ONE
      BEHAVIOR MODEL (landed, .tmp/rewrite-datamodel-overview.ts —
      mutation model no longer a "neighbor"; title "The data model");
      (2) 60-mutation-model WILL SPLIT into a subsection — overview =
      op algebra, children = undo-redo + copy-paste interaction logic
      (land when the walk reaches it); (3) 30-block-state WILL BECOME
      the custom-component anatomy guide — each component owns state,
      renderer, update logic; near a how-to-add-a-component guide;
      (4) counts PINNED TO TARGET STATE (14 types, sequence in, mermaid
      retiring — "In flight" callout in the overview; code currently has
      15 types/8 bundles until the parallel session's retirement lands);
      type counts delegated to block vocabulary. FACT-CHECKED: 7 ops
      correct (insert/update/delete/move/split/merge/blockAction).
      Walk continues: 10-document-tree next, then 20-rich-text,
      30-block-state, 40-comments, 50-canonical-bytes, 60-mutation-model.
    - BULLET STANDARD GENERALIZED (2026-07-21, Ford w/ screenshots:
      five-shapes index = bad, numbering Why = good): NO "lead — gloss"
      bullets ANYWHERE — the lead (bold label / link / short phrase) is
      the parent bullet alone, gloss + facts are sub-bullets.
      writingstyle.md rule broadened ("applies to index lists,
      why-sections, invariant lists — everywhere").
      .tmp/bullet-split-sweep.ts (DRY=1 previewed, then run): 46 splits
      corpus-wide — all section-overview index bullets, document-tree
      invariants, package roles, theming sections, sd-overview's
      Foundation/Design/Implementation + Humans/Agents bullets (Ford's
      own, covered by his general directive), one manifesto bullet.
      Goldens 53, backlinks 53/174, links 0 stale.
    - DATA-MODEL REORDER (2026-07-21, Ford: tree → BLOCK DESIGN → rich
      text; rich text = a kind of block, and data-model speaks
      REPRESENTATION): /api/move 30-block-state→20-block-design,
      20-rich-text→30-rich-text. 20-block-design FULLY REWRITTEN
      (.tmp/block-design-and-richtext.ts) as the block contract — state
      schema / typed actions / doc renderer / agent renderer / THEME
      (Ford's list) laid out over structured-table's real files +
      numbered add-a-block-type path + discovery + why. 30-rich-text
      NARROWED to representation: label-less SpectreRef example +
      span-text display note, marks→bullets, carriers de-counted
      (sequence not mermaid), render-fallback claim fixed, dup H1 +
      closing nav dropped. Overview index reordered/relabeled. FORD LIVE
      EDITS honored: he bulletized the overview opener and DELETED both
      callouts (Reading guide + In flight) — the in-flight
      mermaid→sequence note is gone with them, his call. Goldens 53,
      backlinks 53/170, links 0 stale. Walk: 40-comments next, then
      50-canonical-bytes, 60-mutation-model (split into subsection
      still planned).
    - COMMENTS → ANNOTATIONS (2026-07-21, Ford's interview: this is NOT
      Notion comments — one person + agents; you annotate something TO
      HAVE IT CHANGED; name must be consistent with canvas's
      annotation-processing agent; FULL rename now, annotate mode wiring
      later). LANDED docs-side: 40-comments → 40-annotations (move +
      full rewrite — request-channel framing, annotations.json example
      w/ agentRun receipt, target-design lifecycle w/ queue/eval-record
      bullets + "not wired" Direction callout); data-model overview
      index relabeled; corpus prose sweep 16 replacements (in-code/HTML
      comments untouched). CODE RENAME delegated to a Fable worker
      (no-codex rule stated): annotations-schema.ts (+ comments-schema
      compat re-export, exports-map key KEPT), sidecar annotations.json
      w/ comments.json read-fallback, legacy "comments" top-level key
      normalizes on read, /api/annotations canonical + /api/comments
      aliases, viewer/workbench strings + tests. TRANSIENT: links check
      1 stale (docs ref → annotations-schema.ts) until the worker
      lands; self-heals. Walk after this: 50-canonical-bytes, then the
      60-mutation-model SPLIT (subsection: op algebra overview +
      undo-redo + copy-paste children).
    - NO-LEGACY OVERRIDE (2026-07-21, Ford: "Comments is dead. Remove
      everything to do with it"): worker re-directed mid-run — NO
      comments-schema compat re-export (exports-map key REMOVED, freeze
      explicitly overridden by Ford), NO /api/comments aliases, NO
      comments.json read fallback, NO legacy "comments" sidecar key
      (now a clean validation error). Annotations doc's legacy-key note
      scrubbed.
    - SERIALIZATION RENAME + SPANS TO FAMILY + AGENT ADAPTER
      (2026-07-21, Ford's brainstorm answers): 50-canonical-bytes →
      50-SERIALIZATION ("how we say the document"; content read still
      pending). 30-data-model/30-rich-text DELETED — Ford: delta spans
      are the rich-text FAMILY'S internal state, like canvas/code own
      theirs — representation moved verbatim into the family overview
      (40-block-vocabulary/10-rich-text, "The state: delta spans"
      section; its type bullets also split per the bullet standard).
      Data-model = FOUR shapes + behavior (gap at 30 kept; Ford's pm
      "Five shapes" opener updated to Four). Corpus 53→52 (!— cascade
      target moved again: 52 docs, minus 30-rich-text, plus
      40-annotations/50-serialization renames). BLOCK-DESIGN CONTRACT
      grew the AGENT ADAPTER (6th element, target-design marked:
      default generic ops; canvas/sequence own agent + context loader +
      action writeback); annotations lifecycle gained "Execution is
      per-type" pointing at it. Goldens 52, backlinks 52/169, links 0
      stale.
    - ANNOTATIONS CODE RENAME LANDED (2026-07-21, Fable worker, no
      codex, ~175 tool uses): annotations-schema.ts (comments-schema
      DELETED, exports key removed per Ford's freeze override),
      annotations.json only (no fallback), /api/annotations only (no
      alias routes), agent tools annotation_list/resolve, viewer
      Plannotator + workbench ActionPane/DocPage strings "Annotations",
      all tests renamed + a comments-key-fails-cleanly test. Suites:
      viewer 459/0, cli 105/0, index 39/0, model 343/4 (all
      pre-existing parallel-owned), server 124/3 (assets-video 415s
      VERIFIED pre-existing via stash baseline), workbench 64/1 (export
      vite timeout, verified pre-existing). Spot-verified: zero comment
      remnants, exports map clean.
    - DATA-MODEL RENUMBERED (Ford): 40-annotations→30, 50-serialization
      →40, 60-mutation-model→50 (server moves, 11 inbound sources
      auto-rewritten). BLOCK-DESIGN SECTIONIFIED (Ford: 6 children;
      .tmp/blockdesign-sectionify.ts): 10-state-schema, 20-typed-actions,
      30-doc-renderer, 40-agent-renderer, 50-theming, 60-agent-adapter —
      each grounded in real code excerpts (structured-table state.ts +
      agent-view + descriptor + theme json, file-tree addEntry); overview
      contract bullets are now the child index + a per-family
      instantiation note (EACH FAMILY defines how every element works
      for it in its block-vocabulary doc — inline if short, subpages if
      deep; THAT restructure lands when the walk reaches
      40-block-vocabulary). Corpus 52→58. Cascade target now: 58 docs,
      data-model children 10/20(+6)/30/40/50. Goldens 58, backlinks
      58/179, links 0 stale. Remaining in data-model walk: Ford's
      content read of 40-serialization, then the 50-mutation-model
      SPLIT (op algebra overview + undo-redo + copy-paste children).
    - blockAction → componentAction (2026-07-21, Ford: the six generic
      ops say Block; the seventh is a CUSTOM action on a COMPONENT type;
      componentAction chosen — matches defineComponentAction). Full
      wire-format, NO legacy acceptance (precedent: flavour→type,
      comments→annotations). CODE rename delegated to a Fable worker
      (no-codex rule stated; rejected-legacy test specified; running).
      CORPUS swept: 11 replacements incl. an interaction-surface block
      title ("blockAction examples (2 of 13)" → "componentAction
      examples" — stale count died too); zero remain; goldens 60
      regen, links 0 stale. WORKER LANDED clean: doc-ops union +
      discovery + components compat vocabulary (BLOCK_ACTIONS→
      COMPONENT_ACTIONS etc.) + server forward-handlers + all tests;
      NEW rejected-legacy test ("blockAction" op → Unknown doc op type,
      typed issue). Suites: model 344/4-pre-existing, server 124/3-pre,
      viewer 459/0, cli 105/0, index 39/0, workbench 64/1-pre. Prose
      stragglers ("Typed block actions" heading, docs-server doc line)
      swept after.
    - MUTATION MODEL SPLIT LANDED (2026-07-21, Ford pinned both
      contracts): 50-mutation-model is a SECTION — overview (algebra/
      refusal/actions de-counted/events/discovery + interactions index)
      + 10-undo-redo (two layers: exact inverses, patch ledger undo-by-
      id across doc/canvas/sequence, redo = undoing the undo, local
      keystroke history) + 20-copy-paste (typed clipboard payloads,
      top-level block-run pastes, fresh ids, external HTML → blocks,
      validation gate). Corpus 58→60 (cascade target: 60 docs).
      DATA-MODEL WALK COMPLETE pending Ford's reads. Goldens 60,
      backlinks 60/179, links 0 stale.
    - SERIALIZATION TRIMMED (2026-07-21, Ford confused by the in-doc
      render section — rightly): per-type markdown-render table REMOVED
      (misplaced since block-design/40-agent-renderer exists; the stale
      mermaid row died with it), replaced by a one-para pointer to agent
      renderer + agent surface; serializer + key orders + hashes kept.
      Goldens 58, links 0 stale.
    - ANNOTATION TARGETS CANONICALIZED (2026-07-21, Ford: two kinds is
      outdated; one canonical shape, adapter handles special processing):
      the doc's target section now lists FOUR kinds from the REAL viewer
      targeting layer (block / text_range / visual_point /
      custom_element — canvas-object = custom_element's persisted form),
      plus the "shape never specializes" principle with an adapter
      pointer. Sidecar schema (code) still persists block+canvas-object
      only — doc says so; schema growth is additive, NOT landed as code
      in this pass. Goldens 58, backlinks 58/180, links 0 stale.
    - HEADING CONVENTION (2026-07-21, Ford): "How it's laid out" →
      "Structure" corpus-wide (10 swept; Ford had already hand-renamed
      cross-doc-linking + in-code-docs — zero remain). writingstyle.md
      records the shared flow: Structure → The rule → Why. Goldens 58
      regen, links 0 stale.
    - RENAMED → 20-TRANSLATION-LAYER (2026-07-21, Ford: "interaction
      surfaces" out — the idea is a TRANSLATION LAYER between humans and
      AI; non-gimmicky). /api/move rename + .tmp/rename-translation-
      layer.ts: title "Translation layer", opener reframed in the
      approved translation language ("each reader meets it through a
      renderer that speaks its language"), inside-section child ref
      paths re-swept (the known /api/move subtree gap), sd-overview H2 +
      link text → "Translation layer". Children keep human-surface/
      agent-surface names. Canvas board title "One state, two readers"
      unchanged. CORPUS_PATHS cascade target (parallel-owned) is now:
      53 docs, 10-doc-standards/* + 20-translation-layer/* paths.
      Goldens 53, backlinks 53/177, links 0 stale.
    - FOURTH SITTING (2026-07-20, read-through) IN PROGRESS: baseline was
      1086/4/0 after manifesto-golden regen. Ford rewrote the system-design
      overview three times with the agent (final: primer, H2 per piece +
      bullets, no in-doc H1). MID-SITTING RACE: a PARALLEL SESSION moved
      ALL section overviews to folder-level doc.json (00-overview dirs
      GONE: 10-system-design, 20-implementation, 20-doc-architecture,
      30-data-model, 40-block-vocabulary, 10-rich-text, 40-theming, …)
      and relaxed audit W3/W5 in docs-cli. Inbound refs were rewritten
      (links 0 stale), goldens regenerated to disk (this session), but
      CORPUS_PATHS in goldens.test.ts still pins old 00-overview paths →
      docs-model suite RED (2 ENOENT fails) until that session finishes
      its cascade. Ford chose: land v3 at the new folder-level path, leave
      the cascade to the mover. If the parallel session stalls, finishing
      CORPUS_PATHS + count here is safe and idempotent. Audit now 0 errors
      / 3 warnings (W1 manifesto 5 H1s, W4 interaction-surfaces canvas
      opener, W4 appendix heading opener). Open with Ford: rename
      "doc architecture" → "doc standards"?
    - SECTION REORDER (same sitting, Ford): doc-architecture now goes FIRST
      in system design — /api/move swapped 20-doc-architecture→10-doc-
      architecture and 10-interaction-surfaces→20-interaction-surfaces
      (failures:[] both); descendant-ref sweep (.tmp/sweep-docarch-
      renumber.ts) fixed the doc-arch overview's child refs; 30-numbering's
      example span order swapped; framework .md pointer paths swept (10
      files). System-design overview v4: doc-arch section first with Ford's
      rationale. Doc-arch overview OPENER REWRITTEN (.tmp/rewrite-docarch-
      opener.ts) with Ford's framing: docs define the function w/o code;
      hand docs to a stronger model → better system, code = output; the
      structure answers "this changes here, so it goes like this". Kept:
      three layers, obligation blocks, standards callout + body. Ledger
      re-pathed for renumber + folder-level moves. Pipeline: goldens 53
      regen, backlinks 129, links 0 stale, audit 0/3. docs-model suite:
      339 pass / 5 fail — 2 = stale CORPUS_PATHS (parallel session's
      cascade, now also needs my renumber), 3 = parallel session's
      IN-FLIGHT sequence-block registry work (buildBlocksDiscovery x2,
      collectRegistryIssues; external/sequence submodule + docs-model
      components/sequence appeared mid-sitting; transient module-resolve
      breakage cleared on its own).
    - MATTER-OF-FACT PASS (same sitting): Ford hand-rewrote the overview's
      Docs Architecture section as the style exemplar (short declarative
      sentences, fact bullets, no flourishes; opener paragraph deleted —
      page now starts at the H2, audit W4 flags it, his call). Agent
      matched the four remaining sections via .tmp/matter-of-fact-sd-tail
      .ts (splice from surfaces-H2 down; Ford's blocks untouched). His
      framing kept: "each doc is a canonical JSON object with two
      rendering surfaces, one per reader type". Grammar slip left in his
      para ("allowing every new piece of knowledge has one clear home") —
      flagged to him. NEW AUDIT ERRORS (parallel session): docs/assets +
      docs/assets/sequences fail E2/E4 (non-numbered, no doc.json) — the
      sequence workstream parked assets inside the corpus root; needs
      that session to move them or the audit to learn an assets exemption.
    - WRITING STYLE HOME (Ford's call, same sitting): writing style is
      AGENT GUIDANCE, NOT system design. Top-level writingstyle.md is the
      one home (register + structure + block conventions + anti-patterns
      + why, ported in full). DELETED: the corpus 70-writing-standards
      bundle (corpus 53→52; goldens 52 regen; backlinks 127; links 0
      stale) and framework 20-standards/60-writing-standards.md (existed
      ~minutes). Doc-arch overview: "Six standards", writing-standards
      list item dropped; sd-overview enumeration + SKILL.md L84 updated;
      20-standards/00-overview.md notes the writingstyle.md pointer.
      Cascade note: count assertion + CORPUS_PATHS now need 52/no-70-
      writing-standards (parallel session owns that file).
    - R2-D16 (2026-07-20, after D15): BLOCK PASTE STRUCTURE FIXED. Ford:
      pasted content lost layout — H1s died, everything merged into one
      giant block. Clipboard HTML was FINE (data-pm-slice intact); the
      structure died at PM's paste FITTING: text blocks' "docBlockText
      block*" content lets replaceSelection nest pasted siblings into
      the caret block's child slot (same schema trap as the D10
      staircase), and D15's open band slices even dropped a lone banded
      H1's type. FIX: new editor/input/block-paste.ts (DocBlockPaste —
      block-run pastes insert whole blocks at TOP LEVEL: empty caret
      replaced, start/end insert before/after, mid-text splits; inline/
      partial pastes keep PM default merge); drag-select transformCopied
      ships the band's CLOSED top-level slice; heading level now encoded
      by h1..h6 tag only and listItem ordered via data-doc-ordered
      (fixes latent string-typed level/ordered attr leak). External
      multi-block HTML pastes also improved (h2+p+p, ol/li land as
      separate blocks). 9 new tests (clipboard-block-paste.test.ts);
      no existing assertions changed. Suite 1086/4/0 after regen (below).
      Awaiting Ford's visual check.
    - GOLDEN REGEN (post-D16): manifesto + 20-implementation/00-overview
      + 30-save-pipeline + component-themes doc.json changed on disk =
      Ford's live edits during his copy/paste testing; goldens
      regenerated over disk truth (the standing convention), backlinks
      53/135, links 0 stale, audit 0 errors / 6 warnings.
    - R2-D15 (2026-07-20, same sitting): COPY-OUT BUG FIXED. Ford
      reported copy dead (paste-in fine). Root cause: the R2-D9 band
      multi-selection was decorations-only — no real PM selection, and
      the preventDefaulted mousedown left the editor unfocused, so Cmd+C
      copied a stale collapsed caret. Fix in drag-select.ts: new
      exported rangeSelection() (TextSelection.between walked to
      text bounds; NodeSelection fallback for atom-only runs); an
      appendTransaction on the plugin now backs EVERY range meta
      (band, grip multi-drop, dragstart) with a real selection;
      view.focus() on band mouseup; Escape collapses selection + clears
      state. Decorations/geometry/UX unchanged; cut works via PM
      defaults. Electron shell + R2-D2 clipboard serializers + the
      parallel session's structured-table diff all EXONERATED by
      diagnosis. 6 new tests (copied-slice regression). Suite 1077/4/0.
      NOTE (deliberate): shouldStartBand NOT loosened — off-glyph
      presses (run-out beside a line, empty paragraph, gaps) still start
      the band per Ford's R2-D9 screenshot-drag ask; now those band
      selections COPY correctly. If Ford wants off-glyph presses to do
      native text selection instead, that's a follow-up predicate
      change. Awaiting Ford's visual check.
    - THIRD SITTING (2026-07-20): R2-D13 + R2-D14 LANDED — the corpus was
      RESTRUCTURED to Ford's 6-step narrative flow and the framework
      standards were migrated into first-class system-design docs.
      NEW TREE: 10-system-design/{00-overview (NEW spine doc),
      10-interaction-surfaces (was 00), 20-doc-architecture/ (now a
      SECTION: 00-overview = ex-10-doc-architecture reworked + SEVEN new
      standards docs 10-hierarchy-layers, 20-directory-structure,
      30-numbering, 40-titles-and-openings, 50-doc-linking,
      60-code-linking, 70-writing-standards — each doc = rule + setup +
      rationale, authored from packages/framework/20-standards + cookbook
      + scattered type-page standards), 30-data-model/ (was 20; gained
      60-mutation-model, was top-level 40), 40-block-vocabulary/ (was 30),
      50-package-boundaries (NEW design doc: why seven, forcing
      constraints, 3 boundary-review callouts, schema authority)};
      20-implementation/10-packages/ (the nine ex-50-packages docs;
      00-overview reframed as "Package map"); 10-package-map DELETED
      (absorbed). Corpus 45→53. 34 bundle moves via /api/move (all
      failures:[] clean); all inbound refs auto-rewritten.
    - FRAMEWORK CONTRACT FLIPPED (R2-D13): the corpus standards docs are
      CANONICAL (rule AND rationale); packages/framework/20-standards/*
      are operational copies — every Rationale: line now reads
      "Canonical: docs/… — this file is the operational copy"; SKILL.md
      "Where the Why Lives" rewritten to match. Cookbook/workflows/
      templates unchanged (operational, per Ford). PHASE C (planned, not
      started): a context loader that renders standards straight from the
      corpus per phase, after which the copies die.
    - R2-D14: NEW `bun run docs audit docs` in docs-cli — E1-E4
      structural errors (dup prefixes, non-numbered entries, missing
      00-overview in multi-child sections [root exempt], invalid
      bundles; exit 1) + W1-W5 convention warnings (multi-H1, missing
      alt, 00-slot non-overview, non-paragraph opener, dense numbering;
      exit 0). 20 fixture tests; framework scripts/audit.py DELETED,
      30-workflows/70-audit.md rewritten. Live corpus: 0 errors,
      6 warnings (manifesto has FIVE H1s; interaction-surfaces opens
      with a canvas block; 99-appendix opener) — read-through fodder.
    - Suite state: make check 1071 pass / 4 skip / 0 fail (1075 tests;
      first run showed the documented stale-SPA 5000ms flake, cleared by
      make spa). Links 0 stale; backlinks 53 sources / 135 refs; goldens
      53 regenerated; CORPUS_PATHS + count assertion (fifty-three)
      updated. Ledger fully re-pathed with 53 rows + 9 new
      "needs Ford's read" rows.
    - PROCESS NOTE: all work by Fable sub-agents (mover, 2 authors,
      framework retargeter, audit builder, cascade). Two workers
      initially launched codex exec per global CLAUDE.md; both were
      stopped, reverted codex output, and redid the work directly —
      final diffs are 100% Fable-authored. Worker prompts must state the
      no-codex objective rule EXPLICITLY up front.
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
    - COMMITS LANDED (reconciled 2026-07-17 third sitting): Ford committed
      the sitting's work himself — docs-system 74209d8 "changes" (16:03)
      + 24dc1b7 "bump" (17:26) capture R2-D1..D12; canvas repo da2e096
      "updates" captures fit=content (static-svg.ts, types.ts,
      canvas-file-api.ts) plus an unrelated layout-lab app. STILL
      UNCOMMITTED: docs-system — a 2-line doc-comment edit in
      StyleRail.tsx (components override comment, likely the parallel
      theme session's); canvas repo — the D8 containment restructure of
      canvases/interaction-surfaces.canvas.json (the committed version is
      the older combined-label layout). Commit strategy is no longer
      overdue.
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
    - THE DOC-BY-DOC WALKTHROUGH (Ford + agent, the core of round 2).
      THE LOOP per doc: read from disk → short summary → INTERVIEW Ford
      (AskUserQuestion w/ concrete options + previews; thorough, he asked
      for it) → rewrite from his answers via canonical-serializer .tmp
      scripts → regen goldens over disk truth → backlinks rescan → links
      check → ledger verdict → next doc. His live workbench edits are
      disk truth (expect pm-* blocks appearing mid-loop; honor deletions).
    - POSITION: system design is DONE through data-model (all landed,
      most "Needs Ford read" in the ledger). NEXT: 40-block-vocabulary —
      section overview interview first; then per-family CONTRACT
      INSTANTIATION (Ford's directive: each family defines how each of
      the six block-design contract elements works FOR IT — state schema,
      typed actions, doc renderer, agent renderer, theme, agent adapter —
      inline if short, subpages if deep); reconcile mermaid→sequence
      doc-side (pin to target state, sequence session owns code); resolve
      the old "written primarily for agents" lead + wrong numbering-axis
      claim (flagged in ledger). After vocabulary: 50-package-boundaries,
      then 20-implementation (10-packages 9 docs, 20-workbench,
      30-save-pipeline vs docs-server dedupe, 40-theming 5, 99-appendix),
      and 00-manifesto (Ford believes current; audit W1 5 H1s stands).
    - CONVENTIONS NOW CANON (writingstyle.md): bullets/sub-bullets
      default, NO "lead — gloss" one-liners, bold-label parents, section
      flow "Structure → The rule → Why", titles/openings section,
      SCAN/SKIM/READ. Link objects: doc ref {kind,path} span-text=name;
      source refs typed + verified (dirs legal).
    - PARALLEL THREADS live in this repo (2026-07-21): sequence-block
      session (owns CORPUS_PATHS/counts cascade — target 60 docs + new
      paths — plus file-tree state.ts, docs/assets audit errors); three
      NEW threads Ford is spawning: structured-table inline styling,
      interaction-surface/schema-rendering rethink, code-block
      annotations-in-edit-mode bug. Watch for concurrent edits.
</in_progress>

<next_actions>
    - FIRST (next sitting): resume the read-through at 00-manifesto and
      walk the new tree in order. Per doc: Ford reads + rewords/rewrites
      (his live edits are disk truth — regen goldens over them at each
      close), issues directives, agent lands them, ledger row gets a
      verdict. Standing sub-decisions to collect as he passes: the
      50-doc-linking open call (strict top-down vs up-references), kept
      opening H1s (page title + H1 stack), the block-vocabulary
      overview's wrong numbering-axis claim, audit W1/W4 findings,
      70-framework "what it owns" wording (predates standards
      migration), save-pipeline vs 30-docs-server dedupe.
    - COMMIT (still pending, Ford's call): the ENTIRE third sitting is
      uncommitted — R2-D13 moves (git shows D + untracked pairs), 9 new
      + 1 deleted bundles, goldens, framework edits, docs-cli audit,
      D15/D16 viewer fixes — PLUS the parallel session's structured-
      table/viewer work. Do NOT blend them into one commit blindly;
      suggest: one commit for the restructure+standards+audit batch,
      one for D15+D16 clipboard fixes, structured-table rides with its
      own session.
    - PHASE C (approved direction, not scheduled): context loader that
      renders standards from the corpus per phase (authoring / code-
      writing); then delete the framework operational copies.
    - Audit warnings to resolve during read-through: manifesto 5 H1s,
      interaction-surfaces canvas opener, 99-appendix heading opener.
    - Carried: Ford re-tests the D12 title rename (click title → caret
      in; rename → sidebar follows, prefix kept; Escape reverts). If he
      renames a REAL corpus doc and keeps it, the agent must run the
      rename cascade: CORPUS_PATHS in goldens.test.ts, golden file
      rename/regen, backlinks rescan, links check.
    - THEN: resume the ledger read-through at 00-manifesto and walk
      forward. Per doc: Ford reads, issues directives, agent lands them,
      row gets a verdict. Also collect his per-doc call on kept opening
      H1s (page title + richer H1 now stack — retitle folder, reword H1,
      or leave).
    - COMMIT STRATEGY: resolved — Ford committed both repos 2026-07-17
      (docs-system 74209d8+24dc1b7, canvas da2e096). Leftovers: the D8
      canvas.json restructure is still uncommitted in the canvas repo,
      and a 2-line StyleRail.tsx comment edit sits in docs-system.
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
