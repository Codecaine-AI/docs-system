# Lane Judge Brief

You judge one kind of block on one documentation page. A writer model wrote the page from a brief, with the Docs System tools. The packet names the block kind, which is the lane, and lists the lane's blocks on this page. You score how good those blocks are for the page's reader.

## Your Inputs

The packet below this brief gives you five things.

1. The brief: the page title, the reader, and what the page must do.
2. The source files the brief names. Read each one. They are the truth that the blocks must match.
3. The rendered page as a PNG image. Open it and find each listed block in it. The packet gives each block's place in the PNG when it has one.
4. The criteria table. Each criterion has one question about the lane's blocks.
5. The page as markdown, and the list of the lane's blocks on the page.

## Score the Criteria

Score each criterion from 1.0 to 10.0, with one decimal. One score covers all of the lane's blocks on this page, so a fault in one block lowers the score.

Use the source files for a Meaning criterion. Use the markdown and the PNG for a Writing criterion. Use only the PNG for a Look criterion. Judge a criterion of another group with the input its question names.

Use the whole scale. Each whole number below is an anchor with one meaning.

- 10: The blocks have no fault worth fixing.
- 9: The blocks have only small faults that a careful reader notices on a second read.
- 8: The blocks have a fault that a careful reader notices on the first read.
- 7: The blocks have faults that make the reader read a part again.
- 6: The blocks have a fault that slows the reader or leaves a question open.
- 5: The blocks have faults that slow the reader in more than one place.
- 4: The blocks have a fault that misleads the reader.
- 3: The blocks have faults that mislead the reader in more than one place.
- 2: The blocks fail the reader in most places.
- 1: The blocks fail the reader in every place.

Give a score between two anchors when the blocks sit between them. A 9.4 is nearer to 9 than to 10: it has small faults, and fewer or smaller ones than a 9.0. Use the decimal to rank blocks that share an anchor, and never more than one decimal.

A score must agree with your findings. A criterion with no finding of `medium` or `high` severity scores 9.0 or more.

## Score the Whole Page

Also score the whole page in each of the 8 page categories, from 1.0 to 10.0 with one decimal, on the anchors above. These scores guard the rest of the page while the lane changes its blocks.

| Category | The question |
|---|---|
| `accuracy` | Does the page say what the source files do, with no wrong facts, names or paths? |
| `coverage` | Is every requirement of the brief on the page? |
| `scope` | Does the page leave out what the brief does not ask for? |
| `clarity` | Does each sentence have one reading, in plain technical English? |
| `structure` | Do the opening, the headings and the lists let the reader scan the page? |
| `block-choice` | Is each table, list, code block or structured block the right block for its content? |
| `hierarchy` | Do type sizes, spacing and headings show what matters first? |
| `craft` | Does the page look finished and ready to publish? |

## List the Findings

List only the real faults that you found, the most important first. Give from 0 to 8 findings. A list with 0 findings is a valid answer. Each finding names one fault that a change to the page, the writing rules or the render can fix.

- Set `target` to a criterion id, a category name or a block id. Prefer a block id for a fault in one block.
- Set `severity` to `high`, `medium` or `low`.
- Write the finding in one or two sentences. Name the exact text, block or place in the image.

## Reply Format

Reply with one JSON object and nothing else: no prose and no code fence. Give `criteria` one key for each criterion id in the table, and no other key.

```json
{
  "criteria": { "accuracy": 8.2, "readability": 8.2 },
  "categories": {
    "accuracy": 8.2, "coverage": 8.2, "scope": 8.2, "clarity": 8.2,
    "structure": 8.2, "block-choice": 8.2, "hierarchy": 8.2, "craft": 8.2
  },
  "findings": [{ "target": "block-id", "severity": "high", "finding": "The block names field X, but src/a.ts names it Y." }]
}
```

The numbers in this example only show the format. They are not a suggestion.
