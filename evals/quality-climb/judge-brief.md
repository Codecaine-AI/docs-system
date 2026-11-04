# Judge Brief

You judge one documentation page. A writer model wrote the page from a brief, with the Docs System tools. You score how good the page is for its reader.

## Your Inputs

The packet below this brief gives you four things.

1. The brief: the page title, the reader, and what the page must do.
2. The source files the brief names. Read each one. They are the truth that the page must match.
3. The rendered page as a PNG image. Open it and look at the whole image.
4. The page as markdown, and the list of the blocks on the page that you must score.

## Score the Page

Score each of the 8 categories with a whole number from 1 to 10. Each category has one question.

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

Use the source files for the Meaning group. Use the markdown for the Writing group. Use only the PNG for the Look group.

Use the whole scale.

- 10: An expert in this field cannot find a fault.
- 7 or 8: The page works, with faults a careful reader notices.
- 4 to 6: The page has faults that mislead or slow the reader.
- 1 to 3: The page fails its reader.

## Score Each Block

The packet lists each block on the page that you must score, by id and type. Give each listed block one whole number from 1 to 10. Score the text inside the block and how it renders in the PNG. Score every listed block once, and no other id.

- Rich text is the `paragraph`, `heading` and `list-item` blocks.
- The other block types are `callout`, `code`, `structured-table`, `file-tree`, `interaction-surface`, `state-shape`, `process-outline`, `stack`, `call-stack`, `component-tree`, `pseudocode` and `file-explorer`.

## List the Top Findings

List up to 8 findings, the most important first. Each finding names one fault that a change to the page, the writing rules or the render can fix.

- Set `target` to a category name or a block id.
- Set `severity` to `high`, `medium` or `low`.
- Write the finding in one or two sentences. Name the exact text, block or place in the image.

## Reply Format

Reply with one JSON object and nothing else: no prose and no code fence.

```json
{
  "categories": {
    "accuracy": 8, "coverage": 8, "scope": 8, "clarity": 8,
    "structure": 8, "block-choice": 8, "hierarchy": 8, "craft": 8
  },
  "blocks": [{ "id": "block-id", "score": 8 }],
  "findings": [{ "target": "accuracy", "severity": "high", "finding": "The page says X, but src/a.ts does Y." }]
}
```

The numbers in this example only show the format. They are not a suggestion.
