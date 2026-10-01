Authoring lints report writing and page structure problems through one docs-model engine. The corpus defines the rules. Tools display findings and enforce only the checks assigned to their stage.

## Structure

Rule ownership follows the thing being checked.

- **Shared Engine**

  - lint/index.ts exports lintDocument and lintRules. lint/engine.ts collects findings, compares a baseline, and formats reports.

- **Writing Rules**

  - writing/rules.ts registers rule folders with checks and tests derived from Writing Style.

  - Authored prose includes descriptive metadata and document-owned prose fields. Code blocks, inline code, reference spans, paths, signatures, literal examples, and embedded Canvas or Sequence payloads are excluded.

- **Page Structure Rules**

  - page-structure/rules.ts registers rule folders with checks and tests derived from Structure.

  - The rules inspect the opening paragraph and its length, heading levels and Title Case, and image alt text. They also inspect list nesting, list length, list-item sentences, and label-colon openers.

- **Other Owners**

  - Existing schema validators own valid block data. Component rules belong with the component whose state they inspect.

  - Canvas and Sequence own their embedded formats. The docs-model lint engine does not inspect those formats or duplicate their checks.

  - Block usage guidance stays in Block Vocabulary.

## The Rule

Every registered rule has a stable ID, a corpus docsPath, a severity, enforcement phases, applicability, exclusions, and a repair suggestion. A finding identifies its field, evidence, and block when available. Optional audit metadata preserves legacy CLI labels and severities without moving rule decisions into the adapter.

- **Draft Checks**

  - Draft reports show findings while an author builds incomplete content. The current catalog does not block draft edits.

  - Direct UI saves and create-only blank tree operations remain draft or diagnostic operations. They do not create a general finalization workflow.

  - Full Docs Writer writes and Docs Lab proposal acceptance enforce introduced required findings. This policy does not gate every disk write.

- **Completion Checks**

  - In the lint engine, a finding blocks completion only when it is introduced, has error severity, and its rule enforces the complete phase.

  - With a baseline, matching semantic evidence counts as existing even when block IDs change. Matching respects duplicate counts.

  - Without a baseline, all findings count as introduced.

  - Existing findings remain visible. A baseline does not waive a different finding introduced by an edit.

  - Docs Writer retains the original valid document for the session after the first successful write.

    - Later writes and docs_check compare against that original. Checking an untouched document runs an absolute audit.

    - The Docs Writer baseline is session-local and does not persist across sessions.

- **Docs MCP Style Gate**

  - `docs_check` with `task_id` fails when the task introduced a gated warning on the page. Its `style_gate` field lists each one.

  - `STYLE_RULE_POLICY` in lint-feedback.ts sets which warnings are gated. `writing.sentence-length`, `writing.filler`, and unlisted rules stay editorial.

  - The docs MCP baseline is the page as it stood before the task's first successful write to it. Each task keeps one per page until `docs_end`.

  - Write results list up to 5 `style_findings` that the write introduced or that sit on blocks it touched. `style_gate_open` counts the gated violations the task still has open on the page.

  - Judgment Rules findings at 0.85 or higher on blocks the task changed also enter `style_gate`.

- **Required Repairs**

  - Agents read the lint response, fix every blocking finding within the task, and check the result again before reporting completion.

  - If a required repair cannot be completed, report the remaining finding. Do not claim the document passed.

- **Editorial Review**

  - Warnings ask the author to inspect a passage and do not prove the passage is wrong. Only the docs MCP style gate blocks completion on them.

  - Human judgment still governs sentence clarity, purpose, the join test, Title Case, and most style patterns. A clean lint result does not certify every writing rule.

## Current Checks

The executable catalog is the source for exact applicability and exclusions. These checks cover only part of the corpus guidance.

- **Writing Error**

  - writing.no-em-dash flags em dashes in authored prose and descriptive metadata. It enforces completion and respects the writing exclusions above.

- **Writing Warnings**

  - writing.filler flags `in order to`, `due to the fact that`, `it is important to note that`, and `as mentioned above`.

  - writing.dense-paragraph flags paragraphs over 120 prose words. This threshold is separate from the sentence-length review guidance.

  - writing.semicolon flags a semicolon in authored prose. Semicolons in code spans, URLs, and HTML entities are literal and do not count.

  - writing.sentence-length flags a prose sentence over 30 words and reports its word count. Review the sentence and split it only at a second thought.

- **Page Structure Warnings**

  - structure.opening-paragraph requires a nonempty opening paragraph after an optional initial H1. structure.opening-length checks its length.

  - structure.opening-length flags an opening paragraph with more than four sentences. A one-sentence opener is not flagged.

  - H1 headings are permitted in the document body, including multiple H1 sections. The former structure.single-h1 warning is no longer active. structure.heading-order still flags skipped heading levels.

  - structure.image-alt requires nonempty alt text on standalone images and every image-grid entry. Grid headings and captions also pass through the shared prose checks.

  - These rules are warnings in the lint engine, matching the existing audit policy. Promote a rule by changing its own severity and enforcement metadata after reviewing corpus impact.

- **List and Heading Warnings**

  - structure.deep-list flags list nesting deeper than three list items.

    - Nested supporting details remain valid. Review whether a branch needs its own section.

  - structure.list-length flags more than six consecutive sibling list items, or more than six sibling Process Outline steps. Notes do not count, and the item count is part of the evidence.

  - structure.list-item-sentences flags a list item whose own text has three or more sentences. Nested items are checked separately.

  - structure.heading-title-case flags heading words that break Title Case. Minor words such as "of" and "the" stay lowercase unless first or last, and code-marked spans are skipped.

  - structure.label-colon-opener flags text that opens with a short label and a colon, or a short lead-in that ends in a colon. A plain label has up to three words and a bold label up to five.

- process-outline.single-parent requires one named, non-note root with at least one action child in every completed Process Outline.

  - Empty outlines, childless roots, and multiple roots produce errors.

  - Draft edits remain writable. New violations block completion.

  - Nest related phases under one parent, or split independent processes into separate blocks.

- bundle-relative-src rejects bare assets/... src values on completed canvas, sequence, image, and video blocks. Prefix bundle assets with ./, or use a docs-root-relative path or URL.

## Judgment Rules

Judgment rules are style checks that a model answers. Jev, the TypeSafe System One model, returns a calibrated probability for each typed question about a block.

- **Rule IDs**

  - `judgment.packed-bullet` asks whether a bullet without sub-bullets holds one point, unrelated points, a dense paragraph, or a bare label. Each diagnosis carries its own fix.

  - `judgment.flat-hierarchy` asks whether a run of three or more flat top-level bullets is a wall of text that needs bold-label parents. It judges the run once, on its first item.

  - `judgment.join-test` asks whether a paragraph and the list right after it fail to read as prose.

- **Thresholds**

  - Write results report a judged finding at 0.6 for packed-bullet, 0.7 for flat-hierarchy, and 0.5 for join-test.

  - `docs_check` with `task_id` blocks only at 0.85 or higher. A finding the task's baseline already had on the same block does not block.

- **Failure and the Kill Switch**

  - A missing `TYPESAFE_API_KEY`, no answer within 4 seconds, or an HTTP error makes judgment unavailable. Writes then report deterministic findings only.

  - `docs_check` then adds `judgment` with `available` set to false and a `reason`. It does not block on judgment.

  - `CODECAINE_DOCS_JUDGMENT=off` in the environment or the shared env file turns judgment off. The engine reads the setting on every call.

- **Ownership**

  - The rules live in `packages/docs-mcp/src/lint-feedback.ts`, and the engine lives in `jev-engine.ts` beside it.

  - docs-model holds deterministic rules only, so its lint engine never calls a network service.

## Why

structure.title-heading detects only an opening H1 that repeats the display title. Every document save removes that duplicate before linting and persistence, preserving its children. Distinct opening H1s and later H1s remain unchanged. Heading levels are never demoted by cleanup. The edit and correction share one undo patch, and the response returns the final document and revision. Ordinary edits need no repair-tool call.

Shared rules let CLI checks and agent tools report the same evidence and repair guidance. Completion checks require new errors to be repaired at the supported completion boundaries. The docs MCP gates only warnings a task introduced, so an agent repairs its own violations without inheriting existing findings. Filler and sentence length stay ungated so a phrase match or word count cannot overrule a correct quotation, precise term, or useful explanation.
