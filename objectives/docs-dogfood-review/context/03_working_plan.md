<working_plan>
    <overview>
        1. session_boot - Load state, launch the app, confirm green baseline.
        2. interactive_review_loop - Ford-driven directives, section by
           section through the corpus.
        3. sitting_close - Validate, record, hand off.
    </overview>

    <operating_principles>
        - This is an interactive harness: Ford supplies the next directive;
          the agent never batch-processes docs ahead of him unless he asks for
          a batch.
        - Small diffs, verified live. HMR means most component tweaks are
          visible in the Electron window in seconds — use that loop.
        - When a directive is ambiguous ("make this look better"), propose one
          concrete change and show it rendered rather than asking abstract
          questions.
        - Verification split (Ford, 2026-07-16, HARD RULES): the agent
          implements and runs MACHINE verification only (targeted tests,
          typecheck, make spa + make check). The agent does NOT verify UI
          by looking at it — no browser-pane screenshots, no driving the
          preview, no reading the rendered page to judge a change. Ford is
          the only UI verifier. Every UI-affecting change ships with a
          concrete TEST PLAN (numbered steps, what to look at, what
          good/bad looks like) so Ford can provide feedback and
          screenshots. The agent must NEVER type into real corpus docs
          through any browser — auto-save writes to disk immediately and
          has polluted live docs before.
        - Corpus mechanics (canonical bytes, goldens, counts, backlinks) are a
          single pipeline — script it once per sitting, don't hand-walk it.
        - Delegation: mechanical multi-file sweeps go to sub-agents; Ford has
          at times authorized direct Fable implementation for docs work and at
          other times requires codex exec delegation (see
          ~/.claude/CLAUDE.md) — confirm which mode applies if it matters.
    </operating_principles>

    <phase id="1" name="session_boot">
        <objective>
            - Be ready to take directives with a trustworthy baseline.
        </objective>
        <inputs>
            - This bundle's required_files; `git status` for tree state.
        </inputs>
        <process>
            - Read current_state.md and review-ledger.md; announce where the
              review left off.
            - `make dev` for Ford's window (if not already running); note the
              stale-SPA test-flake rule before any test runs.
            - If the tree or suite state differs from current_state.md,
              reconcile and update the state file before proceeding.
        </process>
        <outputs>
            - A one-paragraph "where we are / what's next" opener to Ford.
        </outputs>
        <gate>
            - Baseline suite state known (green, or divergence explained).
        </gate>
        <failure_handling>
            - If make dev fails: check ports 4803/4804 for leaked processes
              (`lsof -nP -iTCP:4803 -sTCP:LISTEN`), kill strays, relaunch; the
              lifecycle fixes live in run-serve.ts + electron/main.cjs.
        </failure_handling>
    </phase>

    <phase id="2" name="interactive_review_loop">
        <objective>
            - Work through the corpus with Ford: review pages, land directives.
        </objective>
        <inputs>
            - Ford's directive; review-ledger.md for the current position.
        </inputs>
        <process>
            - Per doc review: Ford reads in the workbench; agent verifies the
              page's claims against code when flagged; findings become either
              an immediate directive or a parked follow-up.
            - Per directive: locate the surface (doc.json vs component vs
              editor vs theme) -> implement the smallest change that resolves
              it -> targeted test + HMR visual check -> ledger row updated.
            - Doc edits run the corpus pipeline: serialize round-trip,
              regenerate that doc's golden, links check if references changed.
            - Component/editor changes: `bun test packages/docs-viewer`,
              update per-block tests when markup changes (they assert on
              structure, not decoration).
        </process>
        <outputs>
            - review-ledger.md rows: date, verdict (clean / edited /
              follow-up), actions.
        </outputs>
        <gate>
            - No directive left half-landed; tests never red between
              directives.
        </gate>
        <failure_handling>
            - If a directive balloons (needs model/server changes), park it in
              current_state.md as a scoped follow-up and tell Ford instead of
              expanding silently.
        </failure_handling>
    </phase>

    <phase id="3" name="sitting_close">
        <objective>
            - Leave the repo and the state file ready for the next sitting.
        </objective>
        <inputs>
            - The sitting's ledger rows and any parked follow-ups.
        </inputs>
        <process>
            - `make spa` if viewer changed, then `make check`; `bun run docs
              links check docs`; backlinks rescan if references changed.
            - Update current_state.md: completed, in-progress, next actions,
              open risks.
            - Commits only when Ford asks; note uncommitted scope in the state
              file either way.
        </process>
        <outputs>
            - Updated current_state.md + green suite.
        </outputs>
        <gate>
            - A fresh agent could resume from the bundle alone.
        </gate>
        <failure_handling>
            - If closing with red tests is unavoidable, record the exact
              failures and cause hypothesis in current_state.md as the top
              next action.
        </failure_handling>
    </phase>
</working_plan>
