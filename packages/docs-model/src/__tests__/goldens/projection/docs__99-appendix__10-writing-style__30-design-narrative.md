How to write about a designed system so the reader leaves with the model, not a pile of attributes. The shape can be bullets or prose; the meaning must be prose-complete either way.

- A concept section leads with what the thing is, where it sits among its neighbors (who owns it, what composes it, what it mirrors), and why it is shaped that way. Orientation comes first — “every workflow state object wears the same envelope; ProjectState composes those objects and marks which one is active” — then the specifics, as bullets or paragraphs.

- Relationships are the content. The state-shape block already enumerates the fields; the writing around it must add what the shape cannot say: the split of responsibilities, the invariant that makes the design work, the consequence for whoever builds against it.

- The atomization test: “The envelope carries identity.” / “The envelope carries ordering.” fails not because it is bulleted but because the sentence relating them was deleted. Fix it in bullet shape — state the relation in the lead (“The envelope is the part every state object shares, so any consumer can order, trace, and explain every object the same way:”) and give each bullet one full thought (“identity — id, project_id, kind — names every object the same way, so a run, campaign, or session is addressed uniformly”) — or fold it into one paragraph. Either passes; fragments do not.

- Never re-enumerate an adjacent structured block. Writing before a state-shape or table orients the reader; bullets that restate its rows are duplication that will drift.

- The test for done: could a reader rebuild the design's shape from the leads and bullets alone, with the structured blocks only filling in exact names? If they only list attributes, it fails.
