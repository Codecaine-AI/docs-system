<current_state>
<last_updated>2026-07-22</last_updated>

<status>
    - Phases 1-4 implemented, reviewed, and committed on branch
      style-rail-f-restructure (7558842, e522573, a160f1b, a85dec2,
      7aa9ead widths, f63f720 phase 4). Ford approved phases 1-3 + widths
      in live reviews 2026-07-22 (final geometry 46rem panel / 13rem
      rail). Phase-4 matrix committed: 9 closed / 17 open / 1 waiver —
      awaiting Ford's per-row decisions. All codex work at xhigh per Ford
      directive 2026-07-22.
</status>

<completed>
    - Layout exploration (A–H); F accepted, G fallback (never needed).
    - Bundle authored: goal.md + context/00–04; compat fixtures captured
      (commit 9d72219): examples/settings-blob-pre-restructure.json +
      settings-vars-pre-restructure.json (176 resolved vars).
    - Phase 1 chassis (codex xhigh, 7558842): two-pane split
      (StyleRail.tsx / style-rail-nav.tsx / style-rail-panes.tsx),
      29-item rail, selection under docs-style-rail-selected,
      docs-style-rail-section:* retired. Ford approved.
    - Phase 2 override state (codex xhigh, e522573):
      style-rail-overrides.ts one-pane-per-leaf attribution, row dots,
      rail dots/counts, header N, per-block resets. 87/0 tests.
    - Phase 3 rail previews (codex xhigh, a160f1b): Colors 4-swatch strip
      (one-shot probe, memoized), Typography "Sans · 16px"; passive.
      90/0 tests.
    - Width amendments (Ford; codex xhigh, a85dec2 + 7aa9ead): panel
      36→44→46rem, rail 10→11→13rem; detail width preserved; no clip
      vector found. goal.md's "36rem fixed" superseded.
    - Phase 4 audit + sequence closure (codex xhigh, f63f720): sequence
      registry entry (border: --docs-sequence-border), picker entry +
      icon, themes/default/components/sequence.json, SequenceEmbed frames
      consume the token — sequence styleable from the panel end-to-end.
      context/05_coverage_matrix.md: 27 rows, 9 closed / 17 open (each
      with file:line evidence + one-line proposal) / 1 waiver question.
      Also landed the pending mermaid registry-entry removal (shared hunk;
      registry now mirrors the 16-type vocabulary). 96 tests, 0 fail;
      fixture compat 176/176 original vars identical (+1 new sequence
      var).
</completed>

<in_progress>
    - Ford decision round on the matrix: 17 open rows (bucket A: wire
      existing tokens into consuming styles, incl. flagged docs-viewer
      edits; bucket B: new tokens/controls = vocabulary growth; see the
      matrix Resolution column) + the sequence deep-tokenization waiver +
      the outside-scope --primary/--secondary/--status-* follow-up.
</in_progress>

<next_actions>
    - After Ford's calls: run the gap-closure codex pass(es) for approved
      rows (docs-viewer edits individually flagged), update matrix rows to
      closed/waived-by-Ford + date, then decide phase 5 (specimen strip)
      vs defer, then report.md per 04_validation_and_handoff.md.
</next_actions>

<risks_or_open_questions>
    - Matrix open rows needing Ford: callout tone classes don't consume
      the registered callout border/fill vars (visual change when wired);
      code block has four unregistered syntax colors + a null/boolean
      routing bug; structured-table editor accent (--docs-editor-accent)
      and removal state unregistered; file-tree diff palettes hardcoded;
      interaction-surface noteFg is a dead token (unused class constant);
      several surfaces bypass --docs-font-code via font-mono.
    - Sequence: frame-only theming closed; deep diagram tokenization lives
      in external/sequence — waiver or separate scoping.
    - Outside matrix scope: viewer annotation/menu/status UI consume
      --primary, --secondary, --destructive, --status-* families with no
      registry/knob ownership — needs a shell-vs-status-file decision.
    - Specimen strip (phase 5) may hit heavy/circular imports —
      explicitly deferrable.
    - Pre-existing repo typecheck error (packages/docs-server/src/
      fs-watch.ts:140, FSWatcher .on) predates this work; left untouched.
    - Codex runs doing surgical edits on objectives/ state files hung
      twice; full-file-replacement prompts are the reliable pattern.
    - A concurrent Claude session was running codex in this repo
      2026-07-22 evening; branch commits stage explicit paths only.
</risks_or_open_questions>

<important_paths>
    - objectives/style-rail-restructure/context/05_coverage_matrix.md (the decision surface)
    - objectives/style-rail-restructure/context/03_working_plan.md (phase gates)
    - objectives/style-rail-restructure/examples/settings-blob-pre-restructure.json
      + settings-vars-pre-restructure.json (compat fixtures)
    - packages/docs-workbench/web/src/shell/StyleRail.tsx (+ style-rail-nav.tsx,
      style-rail-panes.tsx, style-rail-overrides.ts)
    - packages/docs-workbench/web/src/theme/theme-folders.ts (registry, 21 files)
    - themes/default/components/ (21 json)
    - packages/docs-model/src/doc-schema.ts (DOC_BLOCK_TYPES, read-only)
</important_paths>
</current_state>
