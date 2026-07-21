"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { Extension, Node, type Editor } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { TableCell } from "@codecaine-ai/docs-model";
import { INLINE_CODE_CLASSES } from "../../../render/block-classes";
import { cn } from "../../../ui/cn";
import { DocItalic, DocStrike } from "../../rich-text/editor-marks";
import type { PMNode } from "../../../editor/core/convert";
import { pmDocToTableCell, tableCellEquals, tableCellToPMDoc } from "../cell-content";
import { renderTableCell } from "../cell-render";

export type CellNavigation = "next" | "previous" | "down";

const COMMIT_DEBOUNCE_MS = 300;

export type EditableCellProps = {
  value: TableCell;
  editable: boolean;
  ariaLabel: string;
  /**
   * Muted ghost label shown while the cell is EMPTY, edit mode only (header
   * cells pass "Column N"; body cells pass nothing). Driven by the mini
   * editor's isEmpty — it hides the instant a character lands and returns
   * the instant the cell clears.
   */
  placeholder?: string;
  onCommit: (value: TableCell) => void;
  onNavigate: (move: CellNavigation) => void;
  /** Focus/blur passthrough so the grid can report the focused cell (focus notches, whole-cell ring live on the enclosing th/td). */
  onFocusChange?: (focused: boolean) => void;
  /** Editor-history passthroughs: Mod-Z/Mod-Shift-Z/Mod-Y inside a cell commit any pending edit, then run these instead of dying inside the cell's own (history-less) editor. */
  onUndo?: () => void;
  onRedo?: () => void;
  registerElement: (element: HTMLDivElement | null) => void;
};

/**
 * Structured-table cell: a rich-text island inside the node view's
 * non-editable wrapper. In edit mode each cell hosts its OWN tiny TipTap
 * instance (single-paragraph doc; bold/italic/strike/inline-code/link marks —
 * the exact mark set and StarterKit config the main editor uses, so
 * shortcuts and markdown input rules behave identically); in read mode it
 * renders the cell statically through the shared inline-span renderer.
 * TipTap's default `stopEvent` keeps events from this editable island away
 * from the OUTER ProseMirror editor; the wrapper's React handlers
 * stopPropagation as well so editor-level listeners above the React root
 * (window keymaps, slash menu) never fire while typing here. Commits are
 * debounced while typing so the editor's auto-save catches mid-typing
 * changes, and flushed on blur/Tab/Enter/Escape.
 */
export function EditableCell(props: EditableCellProps) {
  return props.editable ? <EditingCell {...props} /> : <StaticCell {...props} />;
}

/** Mini-editor lookup by its registered (ProseMirror) element — used by the grid's programmatic focus routing and by tests. */
const CELL_EDITORS = new WeakMap<HTMLElement, Editor>();

export function getCellEditor(element: HTMLElement): Editor | undefined {
  return CELL_EDITORS.get(element);
}

/** The classes the plaintext island carried, now on the mini editor's ProseMirror element (the focus ring lives on the enclosing th/td via :focus-within). */
const CELL_TEXT_CLASSES =
  "min-h-[1.55em] whitespace-pre-wrap break-words rounded-sm outline-none cursor-text";

/** Single-paragraph document: a cell is one flow of rich text; in-cell newlines are hard breaks, never extra paragraphs. */
const CellDocument = Node.create({ name: "doc", topNode: true, content: "paragraph" });

type CellHandlers = {
  commit: () => void;
  navigate: (move: CellNavigation) => void;
  undo?: () => void;
  redo?: () => void;
};

/**
 * Cell keymap. Tab/Shift-Tab/Enter commit + hand navigation to the grid;
 * Escape commits + blurs; Shift-Enter stays with the HardBreak extension
 * (an in-cell newline, preserving the plaintext island's behavior).
 * Mod-Z/Mod-Shift-Z/Mod-Y commit the pending edit, then run the OUTER
 * editor's history — the mini editor registers no history of its own
 * (StarterKit `undoRedo: false`), so undo/redo stays document-level; the
 * bindings still return true so the browser's native contenteditable undo
 * never fires either. Mod-A needs no binding: TipTap core's own Mod-A
 * select-all is scoped to this editor's single-paragraph doc.
 */
function cellKeymap(handlers: RefObject<CellHandlers | null>) {
  const run = (action: (h: CellHandlers) => void) => () => {
    const h = handlers.current;
    if (h) action(h);
    return true;
  };
  return Extension.create({
    name: "cellKeymap",
    addKeyboardShortcuts() {
      return {
        Tab: run((h) => {
          h.commit();
          h.navigate("next");
        }),
        "Shift-Tab": run((h) => {
          h.commit();
          h.navigate("previous");
        }),
        Enter: run((h) => {
          h.commit();
          h.navigate("down");
        }),
        Escape: ({ editor }) => {
          handlers.current?.commit();
          // Direct DOM blur, not commands.blur() — TipTap defers that a
          // frame (rAF), and the blur must land synchronously so focus
          // state is coherent for whatever the keystroke's caller does next
          // (matches the old island's elementRef.blur()).
          (editor.view.dom as HTMLElement).blur();
          return true;
        },
        "Mod-z": run((h) => {
          h.commit();
          h.undo?.();
        }),
        "Mod-Shift-z": run((h) => {
          h.commit();
          h.redo?.();
        }),
        "Mod-y": run((h) => {
          h.commit();
          h.redo?.();
        }),
      };
    },
  });
}

/**
 * The cell's extension set mirrors DocEditor's StarterKit config for the
 * shared pieces so mark behavior matches the main editor exactly:
 * - inline `code` gets the same Notion-style chip classes as the read surface;
 * - italic/strike re-register WITHOUT markdown typing shortcuts (DocItalic/
 *   DocStrike — bold + inline code are the only auto-converting marks, per
 *   the main editor's policy);
 * - link keeps autolink/openOnClick off like the main editor, but
 *   linkOnPaste ON: the main editor turns it off only because its own
 *   LinkEditor paste plugin owns paste-URL-over-selection, and cells have no
 *   link UI in v1 — the stock extension supplies the same Notion semantics.
 * Everything block-level is disabled; `undoRedo: false` is load-bearing (see
 * cellKeymap).
 */
function buildCellExtensions(handlers: RefObject<CellHandlers | null>) {
  return [
    CellDocument,
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      code: { HTMLAttributes: { class: INLINE_CODE_CLASSES } },
      codeBlock: false,
      document: false,
      dropcursor: false,
      gapcursor: false,
      heading: false,
      horizontalRule: false,
      italic: false,
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: true,
        HTMLAttributes: { class: "text-primary underline underline-offset-2" },
      },
      listItem: false,
      listKeymap: false,
      orderedList: false,
      strike: false,
      trailingNode: false,
      underline: false,
      undoRedo: false,
    }),
    DocItalic,
    DocStrike,
    cellKeymap(handlers),
  ];
}

/** Read-mode cell: static inline-mark rendering, same element contract (role/aria/classes) so grid measurement and queries keep working. */
function StaticCell({ value, ariaLabel, registerElement }: EditableCellProps) {
  return (
    <div
      ref={registerElement}
      role="textbox"
      aria-multiline="true"
      aria-readonly="true"
      aria-label={ariaLabel}
      className="min-h-[1.55em] whitespace-pre-wrap break-words rounded-sm outline-none"
    >
      {renderTableCell(value)}
    </div>
  );
}

function EditingCell({
  value,
  ariaLabel,
  placeholder,
  onCommit,
  onNavigate,
  onFocusChange,
  onUndo,
  onRedo,
  registerElement,
}: EditableCellProps) {
  const committedRef = useRef<TableCell>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorInstanceRef = useRef<Editor | null>(null);

  // Latest-render closures for callbacks referenced from stable contexts
  // (the editor's event handlers and the keymap extension).
  const latestRef = useRef({ onCommit, onNavigate, onFocusChange, onUndo, onRedo, registerElement });
  latestRef.current = { onCommit, onNavigate, onFocusChange, onUndo, onRedo, registerElement };

  const clearPending = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const commit = () => {
    clearPending();
    const editor = editorInstanceRef.current;
    if (!editor || editor.isDestroyed) return;
    const next = pmDocToTableCell(editor.getJSON() as PMNode);
    if (tableCellEquals(next, committedRef.current)) return;
    committedRef.current = next;
    latestRef.current.onCommit(next);
  };

  const scheduleCommit = () => {
    clearPending();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      commitRef.current();
    }, COMMIT_DEBOUNCE_MS);
  };

  const commitRef = useRef(commit);
  commitRef.current = commit;
  const scheduleCommitRef = useRef(scheduleCommit);
  scheduleCommitRef.current = scheduleCommit;

  const handlersRef = useRef<CellHandlers | null>(null);
  handlersRef.current = {
    commit,
    navigate: (move) => latestRef.current.onNavigate(move),
    undo: onUndo ? () => latestRef.current.onUndo?.() : undefined,
    redo: onRedo ? () => latestRef.current.onRedo?.() : undefined,
  };

  const extensions = useMemo(() => buildCellExtensions(handlersRef), []);

  const editor = useEditor(
    {
      extensions,
      content: tableCellToPMDoc(committedRef.current) as unknown as Record<string, unknown>,
      editorProps: {
        attributes: {
          class: CELL_TEXT_CLASSES,
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": ariaLabel,
        },
      },
      onUpdate: () => scheduleCommitRef.current(),
      onFocus: () => latestRef.current.onFocusChange?.(true),
      onBlur: () => {
        commitRef.current();
        latestRef.current.onFocusChange?.(false);
      },
    },
    [],
  );
  editorInstanceRef.current = editor;

  const isEmpty = useEditorState({
    editor,
    selector: (ctx) => ctx.editor?.isEmpty ?? true,
  });

  // Register the ProseMirror element as THE cell element: the grid focuses
  // it (Tab/Enter navigation, post-add caret routing) and the node view
  // measures it for the overlay furniture, exactly like the old island div.
  // Layout effect, not passive: the birth flash measures freshly added cells
  // in ITS layout effect within the same commit, and cells must already be
  // in the registry by then (child/earlier-sibling layout effects run first).
  useLayoutEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLDivElement;
    CELL_EDITORS.set(dom, editor);
    latestRef.current.registerElement(dom);
    return () => {
      CELL_EDITORS.delete(dom);
      latestRef.current.registerElement(null);
    };
  }, [editor]);

  // Keep the positional aria-label current (row moves renumber cells).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({
      editorProps: {
        attributes: {
          class: CELL_TEXT_CLASSES,
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": ariaLabel,
        },
      },
    });
  }, [editor, ariaLabel]);

  // External value changes never touch the content of a focused cell that
  // holds a PENDING local edit — typing and reconciliation can't fight over
  // the caret. A focused cell whose content still equals the previously
  // committed value is CLEAN, though: structural moves and undo/redo may
  // legitimately change its value out from under it, so sync the editor
  // anyway and drop the caret at the end of the new text.
  useEffect(() => {
    const previousCommitted = committedRef.current;
    committedRef.current = value;
    if (!editor || editor.isDestroyed) return;
    const current = pmDocToTableCell(editor.getJSON() as PMNode);
    if (tableCellEquals(current, value)) return;
    if (editor.view.hasFocus() && !tableCellEquals(current, previousCommitted)) return;
    clearPending();
    const wasFocused = editor.view.hasFocus();
    editor.commands.setContent(tableCellToPMDoc(value) as unknown as Record<string, unknown>, {
      emitUpdate: false,
    });
    if (wasFocused) editor.commands.focus("end");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <div
      className="relative cursor-text"
      // stopPropagation keeps the keystroke/paste/mousedown from
      // editor-level listeners above the React root (window keymaps, menus);
      // the OUTER ProseMirror never sees events from this editable island
      // thanks to the node view's default stopEvent.
      onKeyDown={(event) => event.stopPropagation()}
      onPaste={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {placeholder != null && isEmpty && (
        <span
          aria-hidden="true"
          data-cell-placeholder=""
          className={cn(
            "pointer-events-none absolute left-0 top-0 select-none text-muted-foreground/60",
          )}
        >
          {placeholder}
        </span>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
