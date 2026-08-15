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

- Bullets are the default reading shape, and they carry prose meaning. A section opens with a lead sentence or short paragraph stating the design claim; the supporting material breaks into bullets at its natural seams, each bullet a complete sentence with its relationships, qualifiers, and consequences attached.
- The join test: reading the lead plus the bullets in order should reconstruct a well-written paragraph. Choppy fragments mean meaning was stripped; a bullet the reader cannot understand without guessing means context was stripped.
- Nest a sub-bullet under its parent instead of packing a second independent idea into the line — but never split one thought into fragments to manufacture nesting.
- A bullet never reads `lead — gloss` on one line. The lead — a bold label, a link, or a short phrase — is the parent bullet by itself; the gloss and every fact go in sub-bullets beneath it. This applies to index lists, why-sections, invariant lists — everywhere.
- Multi-step work is a numbered list; each step is one bounded action.
- Lists cap at about five items. Past that, split the list or rank it.
- Tangents move to their own home and get a link, not a sidebar.
- Headings carry the skim path; a section should scan in one screen.
- Headings are Title Case: the first letter of every word is capitalized, except minor words (a, an, and, as, at, but, by, for, in, nor, of, on, or, per, the, to, via, vs) which stay lowercase mid-heading. Only a word's first letter changes — acronyms, camelCase identifiers, and code-marked spans keep their exact form. Body text is unaffected: mid-sentence words are never capitalized for style.
- Standards and design docs share one section flow and one set of heading names: `Structure` (show the thing — a file tree or annotated code), then `The Rule`, then `Why`.

## Design Narrative

How to write about a designed system so the reader leaves with the model, not a pile of attributes. The shape can be bullets or prose; the meaning must be prose-complete either way.

- A concept section leads with what the thing is, where it sits among its neighbors (who owns it, what composes it, what it mirrors), and why it is shaped that way. Orientation comes first — "every workflow state object wears the same envelope; ProjectState composes those objects and marks which one is active" — then the specifics, as bullets or paragraphs.
- Relationships are the content. The state-shape block already enumerates the fields; the writing around it must add what the shape cannot say: the split of responsibilities, the invariant that makes the design work, the consequence for whoever builds against it.
- The atomization test: "The envelope carries identity." / "The envelope carries ordering." fails not because it is bulleted but because the sentence relating them was deleted. Fix it in bullet shape — state the relation in the lead ("The envelope is the part every state object shares, so any consumer can order, trace, and explain every object the same way:") and give each bullet one full thought ("identity — id, project_id, kind — names every object the same way, so a run, campaign, or session is addressed uniformly") — or fold it into one paragraph. Either passes; fragments do not.
- Never re-enumerate an adjacent structured block. Writing before a state-shape or table orients the reader; bullets that restate its rows are duplication that will drift.
- The test for done: could a reader rebuild the design's shape from the leads and bullets alone, with the structured blocks only filling in exact names? If they only list attributes, it fails.

## Titles and openings

- The title is bundle metadata, rendered as the page title on every surface. Make it differentiate the doc from its siblings at a glance — "Component themes", never "Themes, continued". It must work in a bare listing with no body in sight.
- Every doc opens with a 2–4 sentence paragraph a reader can judge relevance from alone: what this covers, what reading it gets you. It must work for a reader arriving mid-corpus with no surrounding context.
- The reading model is three cuts: SCAN takes the title and first line and answers "potentially relevant?"; SKIM takes the opening paragraph and answers "is this enough context?"; READ takes the full body, only when the task lives there. Titles serve SCAN; openers serve SKIM.
- A vague title forces SKIM on every scan; a missing opener forces READ on every visit. Both taxes are paid by every reader on every traversal.

## Block conventions

- Present-state prose: a finished doc describes what exists now. No change-log voice ("now", "previously", "no longer") unless the doc is explicitly about migration history.
- At most one level-1 heading per doc. The page title is furniture rendered above the body, so most docs need no H1; where one is kept it is the doc's thesis line, not a duplicate of the title. Sections use H2.
- Decisions and warnings are callouts: kind carries the semantic label ("Decision", "Open call", "Named deviation"), tone carries the register. This pair is how the corpus encodes decision records.
- A callout body is one or two sentences — the labeled fact itself. Mechanics, rationale, history, and examples are body content: give them a heading (H2/H3) after the callout and carry them in paragraphs. A callout that scrolls is a section wearing a border.
- The decision-record pattern is therefore two parts: a short dated callout stating the call ("Decision (2026-08-12) — sync publishes atomically."), then an H3 section such as `Why Sync Stages First` holding the reasoning and consequences.
- System behavior documents as state plus operations: a code block of real, annotated JSON shows the state, an interaction-surface block lists the typed operations. State first, then operations.
- Images always carry alt text. No empty-paragraph spacers — an empty paragraph renders as nothing on the agent surface, and spacing is the theme's job on the human one.

## Anti-patterns

- Essay prose: rhetorical setup, thesis paragraphs, "the idea here is that".
- Vague quantities ("several", "a few", "some work").
- Buried facts: a fact that only appears mid-paragraph instead of leading a sentence or bullet.
- Sidebars ("by the way", "note that also…") — file them where they belong.
- Multi-paragraph callouts: if the admonition needs more than two sentences, the overflow is a section, not callout body.
- Atomized bullets: consecutive fragments sharing one subject and verb shape ("X carries A." / "X carries B.") — the relating sentence was deleted. Bullets must carry prose-complete meaning, not stripped nouns.
- Row-echo prose: bullets that restate an adjacent table or state-shape one line per row.

## Why these hold

- Present-state voice is a decay rule: change-log narration goes stale the day it lands; describing what exists dates far more slowly.
- Heading discipline and labeled callouts serve the agent surface, where structure is only as real as it is greppable: `docs grep '> \*\*Decision'` enumerates every decision record; `docs grep '^## '` returns a clean outline because H1 stays scarce.
- Alt text is a two-reader obligation: the agent surface is text-first, and an image without alt is a blank line to half the audience.
- Every render is pinned by goldens, so a convention regression shows up as a diff, not a vibe.
