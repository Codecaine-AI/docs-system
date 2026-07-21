"use client";

import { useEffect, useRef } from "react";
import { cn } from "../../../ui/cn";
import { placeCaretAtEnd, selectAllContents } from "./caret";

export type CellNavigation = "next" | "previous" | "down";

const COMMIT_DEBOUNCE_MS = 300;

/**
 * Plain-text editable cell for the structured-table grid. The schema is
 * `string[][]` — no rich text — so this is an uncontrolled
 * `contenteditable="plaintext-only"` island inside the node view's
 * non-editable wrapper (TipTap's default `stopEvent` already keeps events
 * from editable targets away from ProseMirror; the handlers below
 * stopPropagation as well so editor-level DOM listeners — keymap, slash
 * menu — never fire while typing here). Commits are debounced while typing
 * so the editor's auto-save catches mid-typing changes, and flushed on
 * blur/Tab/Enter/Escape.
 */
export function EditableCell({
  value,
  editable,
  ariaLabel,
  placeholder,
  onCommit,
  onNavigate,
  onFocusChange,
  onUndo,
  onRedo,
  registerElement,
}: {
  value: string;
  editable: boolean;
  ariaLabel: string;
  /**
   * Muted ghost label shown while the cell is EMPTY, edit mode only (header
   * cells pass "Column N"; body cells pass nothing). Pure CSS via `:empty`,
   * so it hides the instant a character lands and returns the instant the
   * cell clears — no debounce lag — and the caret simply types over it.
   */
  placeholder?: string;
  onCommit: (value: string) => void;
  onNavigate: (move: CellNavigation) => void;
  /** Focus/blur passthrough so the grid can report the focused cell (focus notches, whole-cell ring live on the enclosing th/td). */
  onFocusChange?: (focused: boolean) => void;
  /** Editor-history passthroughs: Mod-Z/Mod-Shift-Z/Mod-Y inside a cell commit any pending edit, then run these instead of dying at the island's stopPropagation. */
  onUndo?: () => void;
  onRedo?: () => void;
  registerElement: (element: HTMLDivElement | null) => void;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const committedRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  // External value changes never touch the DOM of a focused cell that holds a
  // PENDING local edit — React never renders the text as children, so typing
  // and reconciliation can't fight over the caret. A focused cell whose DOM
  // still equals the previously committed text is CLEAN, though: structural
  // moves and undo/redo may legitimately change its value out from under it,
  // so sync the DOM anyway and drop the caret at the end of the new text.
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const previousCommitted = committedRef.current;
    committedRef.current = value;
    if (element.textContent === value) return;
    if (element.ownerDocument.activeElement === element) {
      if (element.textContent !== previousCommitted) return;
      element.textContent = value;
      placeCaretAtEnd(element);
      return;
    }
    element.textContent = value;
  }, [value]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const clearPending = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const commit = () => {
    clearPending();
    const element = elementRef.current;
    if (!element) return;
    const text = element.textContent ?? "";
    if (text === committedRef.current) return;
    committedRef.current = text;
    onCommitRef.current(text);
  };

  const scheduleCommit = () => {
    clearPending();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      commit();
    }, COMMIT_DEBOUNCE_MS);
  };

  const handleInput = () => {
    // Clearing a plaintext-only island can leave a stray <br> (select-all +
    // delete): textContent reads "" but `:empty` no longer matches, so the
    // ghost placeholder would never come back. Normalize to a truly empty
    // element before the debounce.
    const element = elementRef.current;
    if (element && element.firstChild && element.textContent === "") {
      element.replaceChildren();
    }
    scheduleCommit();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    // Undo/redo must still reach the editor's history: commit any pending
    // edit synchronously (so it lands as its own history step), then hand off.
    if (event.metaKey || event.ctrlKey) {
      const key = event.key.toLowerCase();
      // Mod-A: stopPropagation blocks PM's keymap, but the browser's NATIVE
      // select-all applies to the outer editing host and would select the
      // whole document through this island — typing afterward replaces it
      // all. Scope the selection to this cell instead (mirrors AFFiNE's
      // table-cell selectAll); repeated presses just keep the cell selection.
      if (key === "a") {
        event.preventDefault();
        if (elementRef.current) selectAllContents(elementRef.current);
        return;
      }
      const history =
        key === "z" ? (event.shiftKey ? onRedo : onUndo) : key === "y" ? onRedo : null;
      if (history) {
        event.preventDefault();
        commit();
        history();
        return;
      }
    }
    if (event.key === "Tab") {
      event.preventDefault();
      commit();
      onNavigate(event.shiftKey ? "previous" : "next");
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commit();
      onNavigate("down");
      return;
    }
    // Shift-Enter falls through: plaintext-only contenteditable inserts a
    // literal newline, which `whitespace-pre-wrap` renders.
    if (event.key === "Escape") {
      event.preventDefault();
      commit();
      elementRef.current?.blur();
    }
  };

  return (
    <div
      ref={(element) => {
        elementRef.current = element;
        registerElement(element);
      }}
      contentEditable={editable ? "plaintext-only" : false}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      className={cn(
        // The focus treatment lives on the enclosing th/td (whole-cell accent
        // ring via :focus-within in TableGrid), not on this inner island.
        "min-h-[1.55em] whitespace-pre-wrap break-words rounded-sm outline-none",
        editable && "cursor-text",
        editable &&
          placeholder != null &&
          "empty:before:text-muted-foreground/60 empty:before:content-[attr(data-placeholder)]",
      )}
      data-placeholder={editable && placeholder != null ? placeholder : undefined}
      onInput={handleInput}
      onFocus={() => onFocusChange?.(true)}
      onBlur={() => {
        commit();
        onFocusChange?.(false);
      }}
      onKeyDown={handleKeyDown}
      onPaste={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    />
  );
}
