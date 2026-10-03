# STE Style Sweep: A-B Runs

This folder holds the A-B report for the STE style pipeline in `packages/docs-style`. Open `index.html` in a browser. Every run below is a dry run, so no page in `docs/` changed.

## How a Run Works

- **Tier 1 and autofix** run on all 114 pages.
- **Tier 2 (Jev) and Tier 3 (model rewrites)** run on 15 pilot pages: the 10 worst pages, plus 5 pages from other layers.
- **Guardrails** reject any rewrite that loses content or adds slop.
- **Two independent reviewers** label every accepted change afterward.

## Run History

| Run | Rewrites Accepted | Rejected | Structure Findings on Deep Pages | Words |
| --- | --- | --- | --- | --- |
| 1 | 145 of 210 | 65 | 564 to 200 | +1.4% |
| 2 | 160 of 193 | 24 | 561 to 218 | +0.5% |
| 3 | 114 of 130 | 8 | 476 to 82 | +0.4% |

The reviewers labelled run 2 harshly. They would reject 36 of 160 rewrites (22%), mostly for readability, with 0 slop and 7 subtle meaning losses. Run 3 holds every fix that came out of that review.

## Fixes Between Runs

- **Run 1 to run 2.**
  - Rewrites became structure-only. Word suggestions no longer reach the model, which had swapped "AI" to "agent" and "could" to "can".
  - List items keep at most 2 sentences, and label openers such as "Why:" stay.
- **Run 2 to run 3.**
  - Deterministic `Link: gloss` and `Applies to: X. Rule.` fixes replace 56 model rewrites.
  - New guardrails reject "So" and "And" bullets, fragments, dropped content words, and added links or code spans.
  - The fact check is required, and it reads link targets.
  - The manifesto and the style-guide pages are exempt.
  - Blocks with old ". lowercase" corruption are held for a person.
  - Autofix keeps only 46 swaps that cannot change meaning, and it never deletes a word.

## Reproduce

Run these from the `docs-system` folder.

```sh
bun run docs style lint
bun run docs style sweep --pilot
bun run docs style report <sweep.json> --review <a.json,b.json>
```
