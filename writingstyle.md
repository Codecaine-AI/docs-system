# Writing style

How every doc in this corpus is written. This is working guidance for whoever is writing — human or agent — not part of the system's design. Load it before authoring or editing docs.

## Register

Write matter-of-fact: short declarative sentences that state what is, in the order the reader needs it.

- Lead with the fact. The first sentence of a doc or section states the thing itself — no setup, no "the idea here is".
- One idea per sentence, one topic per block. A plain lead sentence plus fact bullets beats a paragraph of prose.
- Concrete over vague: real numbers, real paths, real names. "Fourteen types", never "several".
- No preamble, no recap, no closing remarks. Start at the answer; stop when it is stated.
- Assume no memory: a section stands alone or links to what it needs. Never "as mentioned above".

## Structure

- Bullets and sub-bullets are the default shape. Break material down until each line carries one fact; nest a sub-bullet under its parent instead of packing a second idea into the line. Prose paragraphs are for the few ideas that genuinely flow.
- A bold-lead bullet carries its label only. The facts go in sub-bullets beneath it — never `**Label** — content` on one line.
- Multi-step work is a numbered list; each step is one bounded action.
- Lists cap at about five items. Past that, split the list or rank it.
- Tangents move to their own home and get a link, not a sidebar.
- Headings carry the skim path; a section should scan in one screen.

## Titles and openings

- The title is bundle metadata, rendered as the page title on every surface. Make it differentiate the doc from its siblings at a glance — "Component themes", never "Themes, continued". It must work in a bare listing with no body in sight.
- Every doc opens with a 2–4 sentence paragraph a reader can judge relevance from alone: what this covers, what reading it gets you. It must work for a reader arriving mid-corpus with no surrounding context.
- The reading model is three cuts: SCAN takes the title and first line and answers "potentially relevant?"; SKIM takes the opening paragraph and answers "is this enough context?"; READ takes the full body, only when the task lives there. Titles serve SCAN; openers serve SKIM.
- A vague title forces SKIM on every scan; a missing opener forces READ on every visit. Both taxes are paid by every reader on every traversal.

## Block conventions

- Present-state prose: a finished doc describes what exists now. No change-log voice ("now", "previously", "no longer") unless the doc is explicitly about migration history.
- At most one level-1 heading per doc. The page title is furniture rendered above the body, so most docs need no H1; where one is kept it is the doc's thesis line, not a duplicate of the title. Sections use H2.
- Decisions and warnings are callouts: kind carries the semantic label ("Decision", "Open call", "Named deviation"), tone carries the register. This pair is how the corpus encodes decision records.
- System behavior documents as state plus operations: a code block of real, annotated JSON shows the state, an interaction-surface block lists the typed operations. State first, then operations.
- Images always carry alt text. No empty-paragraph spacers — an empty paragraph renders as nothing on the agent surface, and spacing is the theme's job on the human one.

## Anti-patterns

- Essay prose: rhetorical setup, thesis paragraphs, "the idea here is that".
- Vague quantities ("several", "a few", "some work").
- Buried facts: a fact that only appears mid-paragraph instead of leading a sentence or bullet.
- Sidebars ("by the way", "note that also…") — file them where they belong.

## Why these hold

- Present-state voice is a decay rule: change-log narration goes stale the day it lands; describing what exists dates far more slowly.
- Heading discipline and labeled callouts serve the agent surface, where structure is only as real as it is greppable: `docs grep '> \*\*Decision'` enumerates every decision record; `docs grep '^## '` returns a clean outline because H1 stays scarce.
- Alt text is a two-reader obligation: the agent surface is text-first, and an image without alt is a blank line to half the audience.
- Every render is pinned by goldens, so a convention regression shows up as a diff, not a vibe.
