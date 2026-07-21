"use client";

import { useState } from "react";
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { ChevronDown } from "lucide-react";
import { CODE_BLOCK_CLASSES } from "../../render/block-classes";
import { cn } from "../../ui/cn";
import { annotationLineRuns, parseCodeAnnotations } from "./annotations";
import {
  CODE_CELL_CLASSES,
  CODE_FRAME_GRID_CLASSES,
  CODE_LANG_LABEL_CLASSES,
  CODE_LANG_SELECT_CLASSES,
} from "./classes";
import { CodeShell } from "./CodeShell";
import { HIGHLIGHT_LANGUAGES, resolveDisplayLanguage } from "./highlight";

/**
 * Editor node view for `docCodeBlock`: the same frame + header band + gutter
 * + zebra shell the read surface renders (CodeShell), with the editable text
 * as the code cell (NodeViewContent inside a <pre>). All shell furniture is
 * contentEditable={false} (PM treats unknown editable children in its DOM as
 * drift); the schema's renderHTML (editor-nodes.ts, pre>code) is untouched,
 * so clipboard serialization is unaffected.
 *
 * The header's language label IS the picker — a <select> styled with the
 * quiet label classes (affordance appears on block hover only). Choosing a
 * language writes the block's `language` attr
 * (persisted to props.language on save); "auto" clears it, which falls back
 * to highlight.ts's resolution (JSON sniff, else plain) — and the "auto"
 * option shows the sniffed language when one resolves. The copy button
 * copies node.textContent (the raw stored text — edit mode's WYSIWYG).
 *
 * When the block carries `props.annotations` (riding the `blockProps` attr),
 * annotated line runs render as absolute overlay tints behind the text plus
 * accent gutter numbers, and the notes become a right aside (stacked below
 * at narrow widths) — same geometry as the read surface. Clicking a note
 * activates its pair (stronger tint + ring) and scrolls the range's first
 * line into view; clicking the active note again clears it. Clicks on the
 * code side just place the PM cursor — no pairing from there.
 */
export function CodeBlockNodeView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const language = (node.attrs.language as string | null) ?? "";
  const blockProps = node.attrs.blockProps as Record<string, unknown> | null;
  const annotations = parseCodeAnnotations(blockProps?.annotations);
  const text = node.textContent;
  const lineCount = text.split("\n").length;
  const runs = annotations ? annotationLineRuns(lineCount, annotations) : [];
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const resolved = resolveDisplayLanguage(text, language || undefined);

  const languageSelect = (
    <span className="relative inline-flex items-center">
      <select
        aria-label="Code block language"
        value={language}
        disabled={!editor.isEditable}
        onChange={(event) => updateAttributes({ language: event.target.value || null })}
        className={cn(CODE_LANG_LABEL_CLASSES, CODE_LANG_SELECT_CLASSES)}
      >
        <option value="">{!language && resolved ? resolved : "auto"}</option>
        {HIGHLIGHT_LANGUAGES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {/* Picker affordance: hidden at rest, revealed on block hover alongside
          the select's --docs-code-lang-fg text color (keeps that rail token real). */}
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-1 h-3 w-3 text-[color:var(--docs-code-lang-fg,var(--color-text-blue))] opacity-0 transition-opacity group-hover/code:opacity-100"
      />
    </span>
  );

  return (
    <NodeViewWrapper
      as="div"
      className={cn("group/code", CODE_BLOCK_CLASSES, annotations && CODE_FRAME_GRID_CLASSES)}
    >
      <CodeShell
        languageLabel={resolved}
        languageSelect={languageSelect}
        copyText={() => node.textContent}
        lineCount={lineCount}
        annotations={annotations}
        annotationRuns={runs}
        activeIndex={activeIndex}
        onNoteClick={(index) => setActiveIndex((current) => (current === index ? null : index))}
        nonEditableFurniture
      >
        <pre className={CODE_CELL_CLASSES}>
          {/* NodeViewContent's prop typing only admits "div", but it renders
              any tag at runtime — a <code> keeps the read surface's pre>code
              shape. Its injected contentDOM div inherits white-space, and it
              MUST be `pre` (not the default pre-wrap): soft wrap would break
              every 20px line-geometry computation. */}
          <NodeViewContent
            as={"code" as unknown as "div"}
            className="block"
            style={{ whiteSpace: "pre" }}
          />
        </pre>
      </CodeShell>
    </NodeViewWrapper>
  );
}
