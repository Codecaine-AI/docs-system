"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import type { ProcessOutlineNode } from "@codecaine-ai/docs-model";
import { renderProcessOutlineText } from "../ProcessOutlineDocsBlock";
import { setCaretOffset } from "./caret";
import { pathKey, type StepPath } from "./outline-edit";

/** Shared attribute + class contract for both faces, so queries and CSS don't care which is showing. */
const LINE_CLASSES = "outline-none whitespace-pre-wrap break-words cursor-text";

export type StepLineProps = {
  node: ProcessOutlineNode;
  path: StepPath;
  /** True while this step is the one being hand-edited (raw text, backticks visible). */
  focused: boolean;
  /** True while this step is inside the current LINE RANGE — the per-line selection highlight. */
  selected: boolean;
  /**
   * Bumped by the node view when an edit from OUTSIDE invalidated whatever the
   * island is holding. A change means "your uncommitted keystrokes are dead" —
   * the island adopts the model's text even though its DOM has drifted.
   */
  adoptRevision: number;
  onKeyDown: (path: StepPath, event: KeyboardEvent<HTMLSpanElement>) => void;
  onInput: (path: StepPath, element: HTMLSpanElement) => void;
  onBlur: (path: StepPath) => void;
  /** Hands the focused island's element up so the node view can focus it and place the caret. */
  registerElement: (path: StepPath, element: HTMLSpanElement | null) => void;
};

/**
 * One step's text, in the two faces hand-editing needs:
 *
 * - UNFOCUSED — the read surface's exact inline rendering (backtick chips,
 *   loop keywords) in a span tagged with the step's path. It listens for
 *   nothing: the node view hit-tests every pointer event on the whole block in
 *   one place (line-hit.ts), because a click in the padding beside this span
 *   has to land a caret here just the same.
 * - FOCUSED — a plaintext contenteditable island showing the RAW text with the
 *   backticks visible, which is what makes chips editable at all: the chip
 *   markup is `\`` characters in the step's text, and you retype them like any
 *   other character. Blurring re-renders the line as chips.
 *
 * The island's text is written imperatively, never as React children: once the
 * browser owns a contenteditable's DOM, re-rendering children into it fights
 * the caret. `appliedRef` tracks the last MODEL text written into the node, so
 * an external change (undo, an agent edit landing over SSE) is adopted only
 * while the island has no pending local edit.
 */
export function StepLine({
  node,
  path,
  focused,
  selected,
  adoptRevision,
  onKeyDown,
  onInput,
  onBlur,
  registerElement,
}: StepLineProps) {
  const elementRef = useRef<HTMLSpanElement | null>(null);
  const appliedRef = useRef<string | null>(null);
  const adoptedRef = useRef(adoptRevision);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!focused || !element) return;
    registerElement(path, element);
    return () => registerElement(path, null);
    // `path` is identity-unstable by design (a fresh array each render); the
    // key that matters is its string form, and the node view keys islands by
    // that too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, pathKey(path)]);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!focused || !element) {
      appliedRef.current = null;
      return;
    }
    if (appliedRef.current === null) {
      element.textContent = node.text;
      appliedRef.current = node.text;
      adoptedRef.current = adoptRevision;
      return;
    }
    // Forced adoption: the node view dropped this island's pending edit
    // because the tree moved underneath it, so the drifted DOM has to go
    // even though it does not match what we last wrote.
    if (adoptedRef.current !== adoptRevision) {
      adoptedRef.current = adoptRevision;
      if (element.textContent !== node.text) element.textContent = node.text;
      appliedRef.current = node.text;
      if (element.ownerDocument.activeElement === element) setCaretOffset(element, "end");
      return;
    }
    if (node.text === appliedRef.current) return;
    // The model moved. Adopt it only when the island still shows what we last
    // wrote (no uncommitted keystrokes); otherwise just re-baseline once the
    // island's own edit has come back through the model.
    if (element.textContent === appliedRef.current) {
      element.textContent = node.text;
      appliedRef.current = node.text;
    } else if (element.textContent === node.text) {
      appliedRef.current = node.text;
    }
  }, [focused, node.text, adoptRevision]);

  if (!focused) {
    return (
      <span
        // Distinct keys across the two faces are load-bearing, not cosmetic:
        // the island's text node is written imperatively, so React holds no
        // fiber for it. Reusing one host element across the swap would make
        // React APPEND the chips next to that orphan text node and the line
        // would read its own text twice. Different keys force a fresh element.
        key="read"
        className={LINE_CLASSES}
        data-process-outline-step={pathKey(path)}
        data-process-outline-step-editing="false"
        // Present ONLY while selected, so the edit DOM of an untouched outline
        // stays exactly what it was.
        {...(selected ? { "data-process-outline-step-selected": "true" } : {})}
      >
        {renderProcessOutlineText(node.text)}
      </span>
    );
  }

  return (
    <span
      // Pairs with `key="read"` above — see the note there.
      key="edit"
      ref={elementRef}
      className={LINE_CLASSES}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={`Step ${pathKey(path)}`}
      data-process-outline-step={pathKey(path)}
      data-process-outline-step-editing="true"
      // Keystrokes and pastes stop here: the outer ProseMirror never sees them
      // (the node view's default stopEvent), and editor-level window listeners
      // above the React root (slash menu, drag-select) must not either.
      onKeyDown={(event) => {
        event.stopPropagation();
        onKeyDown(path, event);
      }}
      onInput={(event) => onInput(path, event.currentTarget)}
      onPaste={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onBlur={() => onBlur(path)}
    />
  );
}
