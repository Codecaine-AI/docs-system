Editing is the default human surface: every document is always editable, with no separate read mode and no save button. Changes autosave as typed operation batches governed by the mutation model. This section defines the interaction contract for typing, insertion, structural selection, movement, and object editing — and the save loop that carries every edit out of the editor.

## The Editing Contract

- **Typing Model**

  - Enter, Backspace, list escape, and Markdown shortcuts preserve the block tree while matching learned Notion behavior.

- **Slash Menu**

  - A curated command surface converts the current block or inserts a true sibling without exposing every registered type.

- **Selection and Movement**

  - A contiguous block band is a real editor selection that copies, cuts, pastes, moves, and deletes as structure.

- **In-Place Editing**

  - Custom node views edit an object inside its rendered surface; types without one remain read-only atoms edited through typed actions.

## The Save Loop

The editor flushes on its own. A flush turns the current editor state into a typed op batch by diffing it against the last saved baseline — blocks keep their stable ids through the editor, so an in-place edit diffs to a single update rather than a delete-and-insert pair, and an edit that changes nothing diffs to zero ops and sends nothing. The batch carries the content hash the diff was computed against and the session's identity. The editor's diff emits only the six generic structural and text ops; it never emits a component action.

- **Flush triggers**

  - About one second of idle flushes, with a five-second ceiling under continuous typing. `Cmd/Ctrl+S`, focus loss, tab hiding, mode changes, navigating to another document, and closing the editor request the same flush — every trigger reaches the same diff and the same batch path.

- **Reconciliation**

  - A successful save hands back the authoritative document, and the editor adopts it as its next diff baseline without reseeding its content — a save never resets the cursor or selection. Keystrokes that land while a save is in flight keep the editor dirty, and the next flush saves the remainder against the new baseline. A semantically identical refetch also advances the baseline silently; only a genuinely different document reseeds the editor, clears dirty state, and releases a paused save error.

- **Failure keeps the draft**

  - A stale-hash or foreign-lock refusal pauses autosave without discarding anything: the draft stays intact in the editor, and automatic flushes hold while the conflict is known. The header indicator is the whole save UI — `Not saved` while work is dirty or refused (with the conflict named), `Saving...` in flight, `Saved` at rest.

- **Remote changes**

  - A change event reloads a clean editor. A dirty or saving editor suppresses the reload and leaves conflict ownership to its next hash-checked save, so remote work never clobbers local work. Changed blocks flash on arrival; inside the editor the flash renders through the editor's own decoration layer, because the editor owns its surface — the same animation as the read surface, by a different mechanism.
