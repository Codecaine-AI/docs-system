How content maps onto the block vocabulary: the voice a finished doc holds, the heading budget, callout discipline, the decision-record pattern, and media rules.

- Present-state prose: a finished doc describes what exists now. No change-log voice (“now”, “previously”, “no longer”) unless the doc is explicitly about migration history.

- At most one level-1 heading per doc. The page title is furniture rendered above the body, so most docs need no H1; where one is kept it is the doc's thesis line, not a duplicate of the title. Sections use H2.

- Decisions and warnings are callouts: kind carries the semantic label (“Decision”, “Open call”, “Named deviation”), tone carries the register. This pair is how the corpus encodes decision records.

- A callout body is one or two sentences — the labeled fact itself. Mechanics, rationale, history, and examples are body content: give them a heading (H2/H3) after the callout and carry them in paragraphs. A callout that scrolls is a section wearing a border.

- The decision-record pattern is therefore two parts: a short dated callout stating the call (“Decision (2026-08-12) — sync publishes atomically.”), then an H3 section such as `Why Sync Stages First` holding the reasoning and consequences.

- System behavior documents as state plus operations: a code block of real, annotated JSON shows the state, an interaction-surface block lists the typed operations. State first, then operations.

- Images always carry alt text. No empty-paragraph spacers — an empty paragraph renders as nothing on the agent surface, and spacing is the theme's job on the human one.
