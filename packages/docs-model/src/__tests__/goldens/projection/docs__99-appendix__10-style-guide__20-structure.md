Page structure carries meaning through bullets, lists, headings, titles, and openings. The join test keeps bullet groups complete enough to read as prose.

- **Bullets Carry Prose Meaning**

  - Use bullets as the default reading shape. A lead sentence states the claim, and each bullet is a complete sentence with its relationships and qualifiers attached.

  - Apply the join test. The lead plus the bullets, read in order, should reconstruct a well-written paragraph.

  - Consecutive fragments with the same subject, such as "X carries A" and "X carries B", can mean that the sentence relating the facts was deleted.

- **Separate the Lead From Its Gloss**

  - Put a bold label, a link, or a short phrase in a parent bullet that has 3 or more facts in sub-bullets. Write 1 or 2 facts as plain bullets, and name a section of the page with a heading, not a bullet.

  - Nest a second independent idea instead of packing the line. Never split one thought into fragments to manufacture nesting.

- **Avoid Duplicating Structured Blocks**

  - Writing before a table or state-shape orients the reader. Bullets that restate its rows are duplication that will drift.

  - A structured block draws only what the source does. A step that returns early is a branch, an arrow is a real import or call, and a count in the prose equals the count in the block.

- **Number Sequential Actions**

  - Use a numbered list for multi-step work, with one bounded action per step through the last action.

    - A child item of a step adds detail to that step only. A later action, such as the closing call, is the next numbered step.

    - Bullets that open with order words, such as "Start with" and "Then", are a sequence. Number them.

  - A code block, note, or callout that belongs to a step is a child of that step. It renders inside the step, and the next step keeps its number. Between two steps, it restarts the numbering at 1.

  - A numbered procedure holds only the steps of its one task, in order. A step that applies only after a later change, such as a rebuild or an undo, goes after the procedure under its own heading.

  - Lists cap at about five items. Split or rank longer lists.

- **Make Headings Useful for Scanning**

  - Keep a section short enough to scan in one screen. Use Title Case headings, leaving minor words lowercase and preserving acronyms and code-marked spans.

  - The display title and body headings are separate.

    - H1 headings are allowed in the body. Do not begin the body with an H1 that repeats the display title.

  - Preserve meaningful heading levels.

  - Standards and design docs share the flow Structure, The Rule, and Why.

- **Give Each Page a Distinct Title and Opening**

  - The title differentiates the doc from its siblings in a bare listing. Use "Component Themes", not "Themes, Continued".

  - Open the body with a paragraph of 2 to 4 sentences so a reader arriving mid-corpus can judge relevance without reading the rest.

## Keep the Skim Path Clear

Headings and lists expose the order in which a reader needs information.

- Use a bare verb phrase for a task heading and a noun phrase for a concept heading. Do not skip heading levels.

- Introduce a list with a complete sentence and keep its items parallel.

- Preserve the established page template. Supporting reasons or reference details can serve the page's primary purpose, as defined in Document Purpose.

- Give every image nonempty alt text that describes the information it contributes.

## Show the Shape in a Typed Block

Typed blocks are the main value of this docs system. A typed block shows a shape that bullets can only describe. Before you write a section as prose or bullets, check whether it describes one of the shapes in this table.

**Shapes and the typed block for each**

| Shape in the section | Typed block |
| --- | --- |
| Data fields and an example instance | `state-shape` |
| Files and folders | `file-tree` |
| Expected execution path of a system | `process-outline` |
| Operations on a state | `interaction-surface` |
| Layers and the rule at each line | `stack` |
| Connections, ownership, or a pipeline | `canvas` |
| Calls and returns between participants | `sequence` |
| Rows that compare the same fields | `structured-table` |
| A screen or a physical layout | `html` |
| Two or more images of one thing from different angles or stages | `image-grid` |

- **Use the Typed Block When the Shape Is There**

  - If the section describes a shape, use its typed block. Put one or two sentences around the block to orient the reader.

  - Specs, plans, and design pages need typed blocks most. Readers align on these pages, and they align faster when they can see the shape.

  - A spec that lists the nine fields of a record as bullets breaks this rule. One `state-shape` block with the fields and a JSON example follows it.

  - Put related images side by side in one `image-grid` with a heading on each image, such as a sketch and the result or a before and after view. Never stack single image blocks for them.

- **Keep Lists Where Lists Fit**

  - Keep a short list of plain facts as a list. Never force a fact into a diagram only to have one.

  - Keep steps that the reader follows as a numbered list, as Number Sequential Actions says.
