# Judge Brief

You judge one documentation page. A writer model wrote the page from a brief, with the Docs System tools. You score how good the page is for its reader.

## Your Inputs

The packet below this brief gives you four things.

1. The brief: the page title, the reader, and what the page must do.
2. The source files the brief names. Read each one. They are the truth that the page must match.
3. The rendered page as a PNG image. Open it and look at the whole image.
4. The page as markdown, and the list of the blocks on the page that you must score.

## Score the Page

Score each of the 8 categories from 1.0 to 10.0, with one decimal. Each category has one question.

| Group | Category | The question |
|---|---|---|
| Meaning | `accuracy` | Does the page say what the source files do, with no wrong facts, names or paths? |
| Meaning | `coverage` | Is every requirement of the brief on the page? |
| Meaning | `scope` | Does the page leave out what the brief does not ask for? |
| Writing | `clarity` | Does each sentence have one reading, in plain technical English? |
| Writing | `structure` | Do the opening, the headings and the lists let the reader scan the page? |
| Writing | `block-choice` | Is each table, list, code block or structured block the right block for its content? |
| Look | `hierarchy` | Do type sizes, spacing and headings show what matters first? |
| Look | `craft` | Does the page look finished and ready to publish? |

`accuracy` counts only a statement on the page that the source files contradict.
A fact that the page leaves out counts under `coverage`, not under `accuracy`.

Use the source files for the Meaning group. Use the markdown for the Writing group. Use only the PNG for the Look group.

Use the whole scale. Each whole number below is an anchor with one meaning.

- 10: The page has no fault worth fixing.
- 9: The page has only small faults that a careful reader notices on a second read.
- 8: The page has a fault that a careful reader notices on the first read.
- 7: The page has faults that make the reader read a part again.
- 6: The page has a fault that slows the reader or leaves a question open.
- 5: The page has faults that slow the reader in more than one place.
- 4: The page has a fault that misleads the reader.
- 3: The page has faults that mislead the reader in more than one place.
- 2: The page fails its reader in most places.
- 1: The page fails its reader in every place.

Give a score between two anchors when the page sits between them. A 9.4 is nearer to 9 than to 10: it has small faults, and fewer or smaller ones than a 9.0. Use the decimal to rank pages that share an anchor, and never more than one decimal.

A score must agree with your findings. A category with no finding of `medium` or `high` severity scores 9.0 or more. A finding on a block counts for the category that it is about.

## Score Each Block

The packet lists each block on the page that you must score, by id and type. Give each listed block one score from 1.0 to 10.0, with one decimal, on the same anchors. Score the text inside the block and how it renders in the PNG. Score every listed block once, and no other id.

- Rich text is the `paragraph`, `heading` and `list-item` blocks.
- The other block types are `callout`, `code`, `structured-table`, `file-tree`, `interaction-surface`, `state-shape`, `process-outline`, `stack`, `call-stack`, `component-tree`, `pseudocode` and `file-explorer`.

## List the Findings

List only the real faults that you found, the most important first. Give from 0 to 8 findings. A list with 0 findings is a valid answer. Each finding names one fault that a change to the page, the writing rules or the render can fix.

- Set `target` to a category name or a block id.
- Set `severity` to `high`, `medium` or `low`.
- Write the finding in one or two sentences. Name the exact text, block or place in the image.

## Reply Format

Reply with one JSON object and nothing else: no prose and no code fence.

```json
{
  "categories": {
    "accuracy": 8.2, "coverage": 8.2, "scope": 8.2, "clarity": 8.2,
    "structure": 8.2, "block-choice": 8.2, "hierarchy": 8.2, "craft": 8.2
  },
  "blocks": [{ "id": "block-id", "score": 8.2 }],
  "findings": [{ "target": "accuracy", "severity": "high", "finding": "The page says X, but src/a.ts does Y." }]
}
```

The numbers in this example only show the format. They are not a suggestion.
