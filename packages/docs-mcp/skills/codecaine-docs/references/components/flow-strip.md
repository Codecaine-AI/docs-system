# flow-strip

Generated from Codecaine Docs sources. Snapshot: `sha256:df48bff505633507af34872daf2950bc392aeeae845c9eb67ff4956ad352fb08`. Refresh the installation to regenerate these files.

Use Flow Strip to show a short linear loop or pipeline at a glance, three to six steps. Use Process Outline when steps nest or need notes, and Sequence when the exact messages between parties matter.

Example: Show the docs MCP edit loop: begin, read, apply ops, check, end.

Canonical document: `10-system-design/40-block-vocabulary/50-flow-and-diagrams/20-flow-strip`.

The flow strip component owns one block type, `flow-strip`, a row of numbered step cards joined by arrows. It shows a short linear loop or pipeline of three to six steps at a glance. Use process outline when steps nest or need notes, and sequence when the messages between parties matter.

## Example

This strip is the edit loop that `packages/docs-mcp/src/service.ts` and `packages/docs-mcp/src/tools.ts` enforce for every page edit.

**Docs MCP edit loop**

1. docs_discover — Lists the workspace's projects.
2. docs_begin — Pins the guidance snapshot and returns `task_id`.
3. docs_guidance — Reads topic `style` once per task. Writes are refused until then.
4. docs_apply_ops — Applies typed ops atomically against `expected_hash`.
5. docs_check — Fails on style violations this task introduced.
6. docs_end — Releases the snapshot. Edits stay saved.

When `docs_check` fails, fix the findings in its `style_gate` and check again.

## State Schema

All state lives in three props, defined by `FlowStripState` in `packages/docs-model/src/components/flow-strip/state.ts`. The type carries no delta text (`carriesText: false`). Backticks in any text field mark code.

**FlowStripState** — packages/docs-model/src/components/flow-strip/state.ts#FlowStripState

```
title?: string  # Short label above the cards.
steps: FlowStripStep[]  # One card per step, in order.
  name: string  # Step name on the card. Must be nonempty.
  detail?: string  # One line under the name.
caption?: string  # One line under the cards.
```

## Typed Actions

The flow strip has no named actions. An `updateBlock` op replaces `title`, `steps`, or `caption` whole, and the write is validated against `FlowStripState`.

## Doc Renderer

`FlowStripBlock` in `packages/docs-viewer/src/components/flow-strip/FlowStripBlock.tsx` draws the strip in the standard text lane:

- Each step is a bordered card with a two-digit number, the name in code font, and the detail line in body font.

- Cards sit in a grid with a 150px minimum width and wrap to a new row when the lane is narrow. An arrow joins each card to the one before it on the same row.

- The title and the caption render in muted text above and below the cards.

- Every visual value reads a `--docs-flow-strip-*` token with a literal fallback.

## Agent Renderer

The projection in `packages/docs-model/src/components/flow-strip/agent-view.ts` is three paragraphs, each omitted when empty:

- The title renders in bold.

- Each step renders as one numbered line, `N. name — detail`, with the detail omitted when absent.

- The caption renders as plain text.

