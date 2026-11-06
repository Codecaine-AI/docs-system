# call-stack

Generated from Docs System sources. Snapshot: `sha256:6b7ba2e2ea8dafb7e65d32388168d75f07c24855c58dcaaca4fabc8913d81b78`. Refresh the installation to regenerate these files.

Use Call Stack to show which function calls which on one code path, with the file and line where each call is written. Mark a condition with kind "branch" and a changed frame with change. Use Process Outline for prose steps and Component Tree for a render tree.

Example: Trace docs_apply_ops from the tool handler down to the atomic file write, marking the frames this change added.

Canonical document: `10-system-design/40-block-vocabulary/30-trees-and-paths/30-call-stack`.

The call-stack component owns one block type, `call-stack`, a tree of the calls on one code path. Each frame is one code row with its file and line. A `branch` frame marks a condition, and `change` marks a frame a diff added, modified, or removed. Use process outline for prose steps and component tree for a render tree.

## Example

This call stack follows one `docs_apply_ops` request from the MCP tool down to the file write. Each guard that returns early is a branch frame with its `return` nested under it. The stack leaves out the draft-lock guard and the lint guard in `applyDocOpsToBundle`.

```call-stack
docs_apply_ops({ path, expected_hash, ops })  # the MCP tool handler, one atomic op batch  @packages/docs-mcp/src/tools.ts:476
  apply(store, args, args.ops, ctx)  @packages/docs-mcp/src/tools.ts:476
    ? ops.some((op) => op.type === "componentAction" && …)  @packages/docs-mcp/src/tools.ts:270
      return failure("Sidecar actions require …")  # a sidecar action needs its typed component tool  @packages/docs-mcp/src/tools.ts:271
    priorDoc(store, args.path)  # the page before the write, for the reply's changed blocks  @packages/docs-mcp/src/tools.ts:273
    store.applyDocOps(args.path, ops, args.expected_hash)  # an argument of `applied` below, so it runs first  @packages/docs-mcp/src/tools.ts:274
      applyDocOpsToBundle(root, path, ops, expectedHash, sessionId)  @packages/docs-server/src/store.ts:662
        withPathLock(jsonAbs, async () => …)  # one write per doc.json at a time  @packages/docs-server/src/doc-ops.ts:82
          loadDocBundle(docsRoot, path)  # the current document and its docHash  @packages/docs-server/src/doc-ops.ts:83
          ? expectedHash && expectedHash !== loaded.docHash  @packages/docs-server/src/doc-ops.ts:87
            return { ok: false, status: 409, … }  # stale page, the caller reloads first  @packages/docs-server/src/doc-ops.ts:88
          applyOps(loaded.document, ops, () => randomUUID(), options)  # pure, returns the new document and the inverse ops  @packages/docs-server/src/doc-ops.ts:110
          validateDocDocument(result.doc)  @packages/docs-server/src/doc-ops.ts:125
          ? !validated.ok  @packages/docs-server/src/doc-ops.ts:126
            return { ok: false, status: 422, … }  # the file on disk stays as it was  @packages/docs-server/src/doc-ops.ts:127
          docsFs(docsRoot).atomicWrite(loaded.jsonAbs, serialized)  # canonical bytes, whose hash is the new expected_hash  @packages/docs-server/src/doc-ops.ts:162
    applied(store, args.path, …, { ctx, … })  # style findings and the new hash lead the reply  @packages/docs-mcp/src/tools.ts:274
```

## Writing the Frames

Each frame stands for one line of the source, so the reader can find that line and trust the tree. The rules below keep the tree and its two side columns true to the code.

- **The tree copies the code**

  - The stack starts at the entry frame the reader searches for and stops at the frame where the reader's task ends. A stack on a short page holds at most 20 frames, and logging, timing, and bookkeeping calls stay out.

  - A frame's children are the calls that its own body makes, in source order.

  - A call inside another call's arguments runs first, in the same caller, so it is an earlier sibling and never a child. Its comment names the call that takes its result, and that outer frame shows the argument as `…`.

  - A callback that calls a named function shows that function as its own frame. Under `judgeSlot(() => tier2(page))`, the frames of `tier2`'s body nest under a `tier2(page)` frame, not under `judgeSlot`.

  - A frame's text is the call as the source writes it, with only arguments shortened to `…` and no name or shorthand that the source does not write.

- **Control flow shows as branch frames**

  - Each guard on the path that returns or throws is a `branch` frame with the condition as the source writes it. The `return` or `throw` nests under it, and the frames after the guard stay outside it.

  - A loop, a `try` block, and a `catch` block are `branch` frames too, such as `for (const block of blocks)`. The calls of each body nest under its frame, and a `catch` frame sits right after its `try` frame.

  - A branch frame always holds the frames that run when its text is true. For an `else` arm, wrap the source condition in `!( … )`, such as `!(baseline === undefined)`, and cite the line where the `else` arm starts.

  - A branch frame tests a condition that the source tests. One call with a conditional argument, such as `writeFile(failed ? failedPath : path, …)`, stays one frame and never becomes two branches.

  - A guard or a `catch` block is in the stack only when the reader's task can reach it and needs it. Generic error handling around the path, such as argument validation and reply wrapping, stays out, and the text before the block names what it leaves out.

- **The columns point and explain**

  - A `source` is the line where the caller writes the call or the condition, not the line where the callee starts. Only the top frame cites the line where its own handler starts, and the page text never explains how the block cites lines.

  - A `return` or `throw` row cites the line where it is written, like every row for code that exists.

  - A frame for code that does not exist yet has `change: "added"`, no `source`, and a comment that says the frame is proposed.

  - A comment adds one fact the row does not show, such as what the frame refuses, returns, locks, or writes. A comment that only repeats the row or the function name is left out.

  - A comment says only what this frame's own body does, and a step that runs only sometimes keeps its condition, as in "up to one judge call".

  - Code inside a comment goes between backticks, such as ``!judgeUp``, and renders in the code font. Plain words, such as a finding's message, stay outside backticks.

## State Schema

All state lives in one prop, `frames`, defined by `CallStackState` in `packages/docs-model/src/components/call-stack/state.ts`. The row schema is shared with component tree through `outlineRowSchema` in `shared/outline-rows.ts`. The type carries no delta text (`carriesText: false`).

**CallStackState** — packages/docs-model/src/components/call-stack/state.ts#CallStackState

```
frames: CallStackRow[]  # Top-level frames, drawn top to bottom.
  text: string  # The call, written as code. Nonempty.
  kind?: "call" | "branch"  # "call" is the default. A branch is a condition, loop, try or catch row that may own frames.
  comment?: string  # Short note in the aligned comment column. Code goes between backticks.
  change?: "added" | "modified" | "removed"  # Diff state: gutter marker and row tint.
  source?: string  # The line where the caller writes this call, condition or exit, "path:line". A frame marked added has none.
  frames?: CallStackRow[]  # The calls this frame's own body makes, in source order.
```

## Typed Actions

Five actions edit `frames` in place instead of replacing the whole tree. Each action is also an MCP tool named from its key, such as `docs_call_stack_insert_row`.

- **Index paths address rows**

  - `path` is an integer array whose last element is the position among the addressed siblings.

  - The earlier elements of `path` walk `frames` down from the root.

- **Each action has one job**

  - `insertRow` and `removeRow` add or delete a row together with its nested `frames`.

  - `updateRow` patches the row's own fields, and `null` clears an optional field.

  - `moveRow` resolves `to` after the row is removed from `from`.

  - `setRows` replaces the whole tree.

- **Every result is revalidated**

  - Each action returns the props patch `{ frames }`. The whole state is checked against `CallStackState` before it persists.

```
[action] call-stack.insertRow(path: integer[], row: CallStackRow) -> Props patch { frames }, revalidated against CallStackState  # Insert a frame row (with optional nested `frames`) at an index path: the last element is the insert position among the addressed sibling list, preceding elements walk `frames` from the root.
  path: integer[]  # Index path. [i] inserts at position i among the roots, [a, ..., i] at position i under the frame addressed by the prefix.
  row: CallStackRow
[action] call-stack.updateRow(path: integer[], patch: object) -> Props patch { frames }, revalidated against CallStackState  # Patch the frame row at an index path. Omitted fields stay. Null clears an optional field. Nested `frames` are untouched.
  path: integer[]  # Index path of the frame, e.g. [0, 2] for the third child of the first root.
  patch: object  # Partial row. Null clears an optional field.
    text?: string  # Replacement row text, written as code.
    kind?: "call" | "branch" | null  # Row kind ("call" | "branch"). Null clears it.
    comment?: string | null  # Aligned comment. Null clears it.
    change?: "added" | "modified" | "removed" | null  # Diff state ("added" | "modified" | "removed"). Null clears it.
    source?: string | null  # Source location "path:line". Null clears it.
[action] call-stack.removeRow(path: integer[]) -> Props patch { frames }, revalidated against CallStackState  # Remove the frame row at an index path, together with its nested `frames`.
  path: integer[]  # Index path of the frame to remove, e.g. [0, 2].
[action] call-stack.moveRow(from: integer[], to: integer[]) -> Props patch { frames }, revalidated against CallStackState  # Move the frame row at `from` (with its nested `frames`) to the insert position `to`. `to` is interpreted against the tree AFTER the row is removed.
  from: integer[]  # Index path of the frame to move.
  to: integer[]  # Insertion index path (last element = insert position), resolved after the row is detached.
[action] call-stack.setRows(rows: CallStackRow[]) -> Props patch { frames }, revalidated against CallStackState  # Bulk replace: swap the entire frame tree for the given rows.
  rows: CallStackRow[]  # Complete replacement frame tree (nested via `frames`). An empty array empties the block.
```

## Doc Renderer

`OutlineRows` in `packages/docs-viewer/src/components/outline-rows/OutlineRows.tsx` draws the tree in the wide left lane, one row per frame, in a panel that shrinks to its content:

- **The panel is a code surface**

  - It stays dark on both the light and the dark page, and bright guides show depth.

- **Colors follow the code theme, VS Code Dark+ by default**

  - The first call in a frame is its callee, drawn bold in the function color.

  - Receivers, arguments, and properties take the variable color, and literals keep their syntax colors.

  - A branch's `?` and a `return` or `throw` keyword take the control-flow color.

  - A loop branch, such as `for (…)` or `jobs.map(…)`, leads with a repeat icon in place of the `?`.

- Comments share one aligned column, and `source` renders as a muted `file:line` column at the right edge. When the comments do not fit beside the code, each comment moves under its frame, and the source stays on the frame's line.

  - A backtick span in a comment renders in the code font.

- A changed frame gets a `+`, `-`, or `~` gutter mark and a row tint. Every color reads a `--docs-outline-rows-*` token with a literal fallback.

- A frame too long for the panel wraps with a hanging indent and is never cut off.

## Agent Renderer

The projection is one fenced block tagged `call-stack`, with one line per frame and two spaces of indent per depth:

- A branch frame leads with `? `.

- A comment trails as `# comment` and a source as `@path:line`.

- When any frame has a `change`, every line gets a diff column of `+`, `-`, `~`, or a blank ahead of the indent. A stack with no changes has no column.

