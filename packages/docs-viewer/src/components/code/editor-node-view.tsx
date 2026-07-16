"use client";

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { CODE_BLOCK_CLASSES } from "../../render/block-classes";
import { HIGHLIGHT_LANGUAGES } from "./highlight";

/**
 * Editor node view for `docCodeBlock`: the same `<pre><code>` shell the
 * read surface renders (CODE_BLOCK_CLASSES), plus a small language picker
 * floating in the top-right corner. The picker is non-editable furniture
 * (PM never sees it as content — NodeViewContent holds the editable text)
 * and stays invisible until the block is hovered or the cursor is inside,
 * Notion-style. Choosing a language writes the block's `language` attr
 * (persisted to props.language on save); "auto" clears it, which falls back
 * to highlight.ts's resolution (JSON sniff, else plain).
 */
export function CodeBlockNodeView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const language = (node.attrs.language as string | null) ?? "";
  return (
    <NodeViewWrapper as="pre" className={`group/code relative ${CODE_BLOCK_CLASSES}`}>
      <div
        // A plain layout wrapper is not enough: PM treats unknown children
        // inside its own DOM as drift unless they are contentEditable=false.
        contentEditable={false}
        className="absolute right-1.5 top-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/code:opacity-100"
      >
        <select
          aria-label="Code block language"
          value={language}
          disabled={!editor.isEditable}
          onChange={(event) => updateAttributes({ language: event.target.value || null })}
          className="rounded border border-border bg-background px-1 py-0.5 font-sans text-[10px] text-muted-foreground"
        >
          <option value="">auto</option>
          {HIGHLIGHT_LANGUAGES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {/* NodeViewContent's prop typing only admits "div", but it renders any
          tag at runtime — a <code> keeps the read surface's pre>code shape. */}
      <NodeViewContent as={"code" as unknown as "div"} />
    </NodeViewWrapper>
  );
}
