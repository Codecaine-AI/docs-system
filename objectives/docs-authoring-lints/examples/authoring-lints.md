Authoring lints report writing and page structure problems through one docs-model engine. The corpus defines the rules; tools display findings and enforce only the checks assigned to their stage.

## Structure

Rule ownership follows the thing being checked.

- **Shared Engine**

  - lint/index.ts exports lintDocument and lintRules. lint/engine.ts collects findings, compares a baseline, and formats reports.

- **Writing Rules**

  - writing/rules.ts registers rule folders with checks and tests derived from Writing Style.

  - Authored prose includes descriptive metadata and document-owned prose fields. Code blocks, quote blocks, inline code, reference spans, paths, signatures, literal examples, and embedded Canvas or Sequence payloads are excluded.

- **Page Structure Rules**

  - page-structure/rules.ts registers rule folders with checks and tests derived from Structure.

  - The rules inspect the document's block order, heading levels, image alt text, and list nesting.

- **Other Owners**

  - Existing schema validators own valid block data. Component rules belong with the component whose state they inspect.

  - Canvas and Sequence own their embedded formats. The docs-model lint engine does not inspect those formats or duplicate their checks. Block usage guidance stays in Block Vocabulary.

## The Rule

Every registered rule has a stable ID, a corpus docsPath, a severity, enforcement phases, applicability, exclusions, and a repair suggestion. A finding identifies its field, evidence, and block when available. Optional audit metadata preserves legacy CLI labels and severities without moving rule decisions into the adapter.

- **Draft Checks**

  - Draft reports show findings while an author builds incomplete content. The current catalog does not block draft edits.

  - Direct UI saves and create-only blank tree operations remain draft or diagnostic operations. They do not create a general finalization workflow.

  - Full Docs Writer writes and Docs Lab proposal acceptance enforce introduced required findings. This policy does not gate every disk write.

- **Completion Checks**

  - A finding blocks completion only when it is introduced, has error severity, and its rule enforces the complete phase.

  - With a baseline, matching semantic evidence counts as existing even when block IDs change. Matching respects duplicate counts. Without a baseline, all findings count as introduced.

  - Existing findings remain visible. A baseline does not waive a different finding introduced by an edit.

  - Docs Writer retains the original valid document for the session after the first successful write. Later writes and docs_check compare against that original. Checking an untouched document runs an absolute audit. The baseline is session-local and does not persist across sessions.

- **Required Repairs**

  - Agents read the lint response, fix every blocking finding within the task, and check the result again before reporting completion.

  - If a required repair cannot be completed, report the remaining finding. Do not claim the document passed.

- **Editorial Review**

  - Warnings ask the author to inspect a passage. They do not block completion and do not prove the passage is wrong.

  - Human judgment still governs sentence clarity, purpose, the join test, Title Case, and most style patterns. A clean lint result does not certify every writing rule.

## Current Checks

The executable catalog is the source for exact applicability and exclusions. These checks cover only part of the corpus guidance.

- **Writing Error**

  - writing.no-em-dash flags em dashes in authored prose and descriptive metadata. It enforces completion and respects the writing exclusions above.

- **Writing Warnings**

  - writing.filler flags `in order to`, `due to the fact that`, `it is important to note that`, and `as mentioned above`.

  - writing.dense-paragraph flags paragraphs over 120 prose words. This threshold is separate from the sentence-length review guidance.

- **Page Structure Warnings**

  - structure.opening-paragraph requires a nonempty opening paragraph after an optional initial H1. It does not count opening sentences.

  - structure.single-h1 permits at most one H1. structure.heading-order flags skipped levels, with sections starting at H2.

  - structure.image-alt requires nonempty alt text on image blocks. These rules remain advisory, matching the existing audit policy. Promote a rule by changing its own severity and enforcement metadata after reviewing corpus impact.

- **Page Structure Warning**

  - structure.deep-list flags list nesting deeper than three list items. Nested supporting details remain valid; review whether a branch needs its own section.

## Why

Shared rules let CLI checks and agent tools report the same evidence and repair guidance. Completion checks require new errors to be repaired at the supported completion boundaries. Keeping warnings advisory prevents a phrase match from overruling a correct quotation, precise term, or useful explanation.

