# call-stack

Generated from Codecaine Docs sources. Snapshot: `sha256:df48bff505633507af34872daf2950bc392aeeae845c9eb67ff4956ad352fb08`. Refresh the installation to regenerate these files.

Use Call Stack to show which function calls which on one code path, with the file and line each frame lives at. Mark a condition with kind "branch" and a changed frame with change. Use Process Outline for prose steps and Component Tree for a render tree.

Example: Trace docs_apply_ops from the tool handler down to the atomic file write, marking the frames this change added.

Canonical document: `10-system-design/40-block-vocabulary/30-trees-and-paths/30-call-stack`.

The call-stack component owns one block type, `call-stack`, a tree of the calls on one code path. Each frame is one code row with its file and line. A `branch` frame marks a condition, and `change` marks a frame a diff added, modified, or removed. Use process outline for prose steps and component tree for a render tree.

## Example

This call stack follows one `docs_apply_ops` request from the MCP tool down to the file write. The branch frame is the stale-hash check, and its child is the early return.

```call-stack
docs_apply_ops({ path, expected_hash, ops })  # MCP tool, one atomic op batch  @packages/docs-mcp/src/tools.ts:383
  apply(store, args, args.ops, ctx)  # refuses sidecar actions in a batch  @packages/docs-mcp/src/tools.ts:223
    priorDoc(store, args.path)  # document before the write  @packages/docs-mcp/src/tools.ts:186
    store.applyDocOps(path, ops, expected_hash)  @packages/docs-server/src/store.ts:584
      applyDocOpsToBundle(root, path, ops, …)  # runs inside withPathLock  @packages/docs-server/src/doc-ops.ts:67
        loadDocBundle(docsRoot, path)  # current document and docHash  @packages/docs-server/src/bundle.ts:65
        ? expectedHash !== loaded.docHash  @packages/docs-server/src/doc-ops.ts:85
          return { status: 409, … }  # stale bundle, reload first
        applyOps(loaded.document, ops, …)  # pure, collects the inverse ops  @packages/docs-server/src/doc-ops.ts:108
        validateDocDocument(result.doc)  # whole document again, else 422  @packages/docs-server/src/doc-ops.ts:123
        atomicWriteFile(loaded.jsonAbs, serialized)  # canonical bytes, new hash  @packages/docs-server/src/doc-ops.ts:158
    applied(store, path, result, write)  # style findings first, then the new hash  @packages/docs-mcp/src/tools.ts:197
```

## State Schema

All state lives in one prop, `frames`, defined by `CallStackState` in `packages/docs-model/src/components/call-stack/state.ts`. The row schema is shared with component tree through `outlineRowSchema` in `shared/outline-rows.ts`. The type carries no delta text (`carriesText: false`).

**CallStackState** — packages/docs-model/src/components/call-stack/state.ts#CallStackState

```
frames: CallStackRow[]  # Top-level frames, drawn top to bottom.
  text: string  # The call, written as code. Nonempty.
  kind?: "call" | "branch"  # "call" is the default. A branch is a condition row that may own frames.
  comment?: string  # Short note in the aligned comment column.
  change?: "added" | "modified" | "removed"  # Diff state: gutter marker and row tint.
  source?: string  # Where the frame lives, "path:line".
  frames?: CallStackRow[]  # The calls this frame makes.
```

## Typed Actions

The call stack has no named actions. An `updateBlock` op replaces `frames` whole, and the write is validated against `CallStackState`.

## Doc Renderer

`OutlineRows` in `packages/docs-viewer/src/components/outline-rows/OutlineRows.tsx` draws the tree in the wide left lane, one row per frame:

- Box-drawing guides show depth, and the call text is colored by token: calls, keywords, strings, and numbers.

- A branch frame renders as a muted condition row.

- Comments share one aligned column, and `source` renders as a `file:line` chip at the right edge.

- A changed frame gets a `+`, `-`, or `~` gutter mark and a row tint. Every color reads a `--docs-outline-rows-*` token with a literal fallback.

## Agent Renderer

The projection is one fenced block tagged `call-stack`, with one line per frame and two spaces of indent per depth:

- A branch frame leads with `? `.

- A comment trails as `# comment` and a source as `@path:line`.

- When any frame has a `change`, every line gets a diff column of `+`, `-`, `~`, or a blank ahead of the indent. A stack with no changes has no column.

