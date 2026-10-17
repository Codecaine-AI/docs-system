"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Editor, Extension, Node, getSchema } from "@tiptap/core";
import { DOMSerializer, type Schema } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import type { TableCell } from "@codecaine-ai/docs-model";
import { INLINE_CODE_CLASSES } from "../../../render/block-classes";
import { cn } from "../../../ui/cn";
import { DocItalic, DocStrike } from "../../rich-text/editor-marks";
import type { PMNode } from "../../../editor/core/convert";
import { pmDocToTableCell, tableCellEquals, tableCellSpans, tableCellToPMDoc } from "../cell-content";
import { renderTableCell } from "../cell-render";
import { TABLE_CELL_MIN_HEIGHT_CLASS } from "../table-classes";

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
 *
 * The mini editor is LAZY: a big table would otherwise mount one ProseMirror
 * per cell (a 1,400-cell doc froze the page ~1 s on mount and ~650 ms on
 * teardown). An idle edit-mode cell is a focusable element holding the exact
 * markup the editor would render (renderStaticCellInto); the editor mounts
 * INTO that same element when the pointer rests on it for HOVER_DWELL_MS (a
 * sweep across the table mounts nothing), on pointerdown, or when it takes
 * focus (Tab, grid navigation, focusCellElement), and is
 * released at idle once the cell is neither focused nor hovered. The element
 * itself never changes, so the grid's registry, overlay measurements and
 * focus checks hold the same node throughout.
 */
export function EditableCell(props: EditableCellProps) {
  return props.editable ? <EditingCell {...props} /> : <StaticCell {...props} />;
}

/** Mini-editor lookup by its registered cell element — used by the grid's programmatic focus routing and by tests. Undefined while the cell is idle (no editor mounted). */
const CELL_EDITORS = new WeakMap<HTMLElement, Editor>();

/** Per-cell "mount your editor now" hooks, keyed by the same registered element. */
const CELL_ACTIVATORS = new WeakMap<HTMLElement, () => Editor | null>();

export function getCellEditor(element: HTMLElement): Editor | undefined {
  return CELL_EDITORS.get(element);
}

/**
 * The cell's live editor, mounting it first if the cell is idle. Returns
 * undefined for elements that are not edit-mode cells.
 */
export function ensureCellEditor(element: HTMLElement): Editor | undefined {
  const live = CELL_EDITORS.get(element);
  if (live && !live.isDestroyed) return live;
  return CELL_ACTIVATORS.get(element)?.() ?? undefined;
}

/**
 * The classes the plaintext island carried, on the cell element in both of
 * its states (the focus ring lives on the enclosing th/td via :focus-within).
 * `relative` restates the `.ProseMirror` rule's position for the idle cell.
 * `whitespace-pre-wrap` matches what a LIVE cell computes: TipTap's
 * `.ProseMirror [contenteditable="false"] [contenteditable="true"]` rule
 * (pre-wrap) outranks the `.ProseMirror` break-spaces rule for an editor
 * nested in the node view, so idle and live cells wrap spaces the same way.
 */
const CELL_TEXT_CLASSES = cn(
  TABLE_CELL_MIN_HEIGHT_CLASS,
  "relative whitespace-pre-wrap break-words rounded-[var(--radius)] outline-none cursor-text",
);

/** How long the pointer must rest on one idle cell before its editor mounts; leaving earlier cancels it. */
export const HOVER_DWELL_MS = 120;

/** How long after blur/leave an unused cell editor may wait for the browser to go idle before it is released anyway. */
const RELEASE_IDLE_TIMEOUT_MS = 1000;
/** Fallback delay where requestIdleCallback is missing (Safari). */
const RELEASE_FALLBACK_MS = 200;

/** Run `callback` when the main thread is idle; returns a cancel function. */
function scheduleIdle(callback: () => void): () => void {
  const requestIdle = globalThis.requestIdleCallback;
  if (typeof requestIdle === "function") {
    const handle = requestIdle(callback, { timeout: RELEASE_IDLE_TIMEOUT_MS });
    return () => globalThis.cancelIdleCallback?.(handle);
  }
  const handle = setTimeout(callback, RELEASE_FALLBACK_MS);
  return () => clearTimeout(handle);
}

function cellEditorAttributes(ariaLabel: string): Record<string, string> {
  return {
    class: CELL_TEXT_CLASSES,
    role: "textbox",
    "aria-multiline": "true",
    "aria-label": ariaLabel,
  };
}

let cellSchemaCache: { schema: Schema; serializer: DOMSerializer } | null = null;

/** The mini editor's schema (built once from the same extension set) and its DOM serializer. */
function cellSchema() {
  if (!cellSchemaCache) {
    const schema = getSchema(buildCellExtensions({ current: null }));
    cellSchemaCache = { schema, serializer: DOMSerializer.fromSchema(schema) };
  }
  return cellSchemaCache;
}

/**
 * Render a cell value into `element` as the mounted editor would: the same
 * schema's toDOM output (a `<p>` with the same mark elements and classes),
 * plus ProseMirror's trailing `<br>` hack for an empty paragraph or one that
 * ends in a hard break, so swapping the editor in or out moves no pixels.
 */
export function renderStaticCellInto(element: HTMLElement, value: TableCell) {
  const { schema, serializer } = cellSchema();
  const document = element.ownerDocument;
  const doc = schema.nodeFromJSON(tableCellToPMDoc(value));
  const fragment = serializer.serializeFragment(doc.content, { document });
  const paragraph = fragment.firstChild;
  if (paragraph && (!paragraph.lastChild || paragraph.lastChild.nodeName === "BR")) {
    const trailing = document.createElement("br");
    trailing.className = "ProseMirror-trailingBreak";
    paragraph.appendChild(trailing);
  }
  element.replaceChildren(fragment);
}

/** Put back the idle cell's attributes after ProseMirror (which leaves its own on a mounted element) is destroyed. */
function restoreIdleAttributes(element: HTMLElement, ariaLabel: string) {
  element.removeAttribute("contenteditable");
  element.removeAttribute("translate");
  element.className = CELL_TEXT_CLASSES;
  element.setAttribute("role", "textbox");
  element.setAttribute("aria-multiline", "true");
  element.setAttribute("aria-label", ariaLabel);
}

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
      className={cn(
        TABLE_CELL_MIN_HEIGHT_CLASS,
        "whitespace-pre-wrap break-words rounded-[var(--radius)] outline-none",
      )}
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
  const elementRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const committedRef = useRef<TableCell>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredRef = useRef(false);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelReleaseRef = useRef<(() => void) | null>(null);
  // The live editor's emptiness (drives the placeholder); null while idle,
  // when the committed value decides it.
  const [liveEmpty, setLiveEmpty] = useState<boolean | null>(null);

  // Latest-render closures for callbacks referenced from stable contexts
  // (the editor's event handlers and the keymap extension).
  const latestRef = useRef({ onCommit, onNavigate, onFocusChange, onUndo, onRedo, registerElement, ariaLabel });
  latestRef.current = { onCommit, onNavigate, onFocusChange, onUndo, onRedo, registerElement, ariaLabel };

  const clearPending = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const commit = () => {
    clearPending();
    const editor = editorRef.current;
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

  const cancelDwell = () => {
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
  };

  const cancelRelease = () => {
    cancelReleaseRef.current?.();
    cancelReleaseRef.current = null;
  };

  // Tear the editor down and put the idle markup back. Commits first, so an
  // edit made without focus (programmatic) is never dropped.
  const release = () => {
    cancelRelease();
    const editor = editorRef.current;
    const element = elementRef.current;
    if (!editor) return;
    commitRef.current();
    clearPending();
    editorRef.current = null;
    if (element) CELL_EDITORS.delete(element);
    editor.destroy();
    if (element) {
      restoreIdleAttributes(element, latestRef.current.ariaLabel);
      renderStaticCellInto(element, committedRef.current);
    }
    setLiveEmpty(null);
  };

  // Release once the browser is idle, unless the cell is focused or hovered
  // again by then (the next blur/leave schedules another try).
  const scheduleRelease = () => {
    cancelRelease();
    cancelReleaseRef.current = scheduleIdle(() => {
      cancelReleaseRef.current = null;
      const element = elementRef.current;
      if (!element || !editorRef.current) return;
      if (hoveredRef.current || element.ownerDocument.activeElement === element) return;
      release();
    });
  };

  // Mount the mini editor into the cell element (idempotent). The element
  // keeps its identity, so the grid registry and every measurement stay valid.
  const activate = (): Editor | null => {
    const existing = editorRef.current;
    if (existing && !existing.isDestroyed) return existing;
    const element = elementRef.current;
    if (!element) return null;
    cancelDwell();
    cancelRelease();
    element.replaceChildren();
    const editor = new Editor({
      element: { mount: element },
      extensions,
      content: tableCellToPMDoc(committedRef.current) as unknown as Record<string, unknown>,
      editorProps: { attributes: cellEditorAttributes(latestRef.current.ariaLabel) },
      onUpdate: () => scheduleCommitRef.current(),
      onTransaction: ({ editor: current }) => setLiveEmpty(current.isEmpty),
      onFocus: () => {
        cancelRelease();
        latestRef.current.onFocusChange?.(true);
      },
      onBlur: () => {
        commitRef.current();
        latestRef.current.onFocusChange?.(false);
        scheduleRelease();
      },
    });
    editorRef.current = editor;
    CELL_EDITORS.set(element, editor);
    setLiveEmpty(editor.isEmpty);
    return editor;
  };
  const activateRef = useRef(activate);
  activateRef.current = activate;

  // Register the cell element as THE cell element: the grid focuses it
  // (Tab/Enter navigation, post-add caret routing) and the node view measures
  // it for the overlay furniture. Layout effect, not passive: the birth flash
  // measures freshly added cells in ITS layout effect within the same commit,
  // and cells must already be in the registry by then (child/earlier-sibling
  // layout effects run first).
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    CELL_ACTIVATORS.set(element, () => activateRef.current());
    latestRef.current.registerElement(element);
    return () => {
      cancelReleaseRef.current?.();
      cancelReleaseRef.current = null;
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      const editor = editorRef.current;
      editorRef.current = null;
      CELL_ACTIVATORS.delete(element);
      CELL_EDITORS.delete(element);
      editor?.destroy();
      latestRef.current.registerElement(null);
    };
  }, []);

  // Keep the positional aria-label current (row moves renumber cells); the
  // idle element takes it from its React props.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({ editorProps: { attributes: cellEditorAttributes(ariaLabel) } });
  }, [ariaLabel]);

  // Idle cells redraw their markup from the value. A live cell never has its
  // content touched while it holds a PENDING local edit — typing and
  // reconciliation can't fight over the caret. A focused cell whose content
  // still equals the previously committed value is CLEAN, though: structural
  // moves and undo/redo may legitimately change its value out from under it,
  // so sync the editor anyway and drop the caret at the end of the new text.
  useLayoutEffect(() => {
    const previousCommitted = committedRef.current;
    committedRef.current = value;
    const element = elementRef.current;
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) {
      if (element) renderStaticCellInto(element, value);
      return;
    }
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
  }, [value]);

  const isEmpty = liveEmpty ?? tableCellSpans(value).length === 0;

  return (
    <div
      className="relative cursor-text"
      data-cell-live={liveEmpty === null ? undefined : ""}
      // stopPropagation keeps the keystroke/paste/mousedown from
      // editor-level listeners above the React root (window keymaps, menus);
      // the OUTER ProseMirror never sees events from this editable island
      // thanks to the node view's default stopEvent.
      onKeyDown={(event) => event.stopPropagation()}
      onPaste={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      // A mouse resting HOVER_DWELL_MS on the cell mounts the editor BEFORE
      // the click, so the click's caret placement, drag selection and
      // double-click are the browser's own. Passing over never mounts.
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        hoveredRef.current = true;
        if (editorRef.current) {
          cancelRelease();
          return;
        }
        cancelDwell();
        dwellTimerRef.current = setTimeout(() => {
          dwellTimerRef.current = null;
          if (hoveredRef.current) activateRef.current();
        }, HOVER_DWELL_MS);
      }}
      onPointerLeave={() => {
        hoveredRef.current = false;
        cancelDwell();
        const element = elementRef.current;
        if (editorRef.current && element?.ownerDocument.activeElement !== element) {
          scheduleRelease();
        }
      }}
      // No hover first (touch, pen, a table that appeared under a still
      // pointer): mount on pointerdown and place the caret at the press.
      onPointerDown={(event) => {
        cancelDwell();
        if (editorRef.current) return;
        const editor = activate();
        if (!editor) return;
        const at = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (at) editor.commands.setTextSelection(at.pos);
        else selectEnd(editor);
        editor.view.focus();
      }}
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
      <div
        ref={elementRef}
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        tabIndex={0}
        className={CELL_TEXT_CLASSES}
        // Keyboard or programmatic focus on an idle cell: mount the editor in
        // place and hand it the focus, caret at the end of the text.
        onFocus={() => {
          if (editorRef.current) return;
          const editor = activate();
          if (editor) focusEditorAtEnd(editor);
        }}
      />
    </div>
  );
}

/**
 * Caret to the end and focus. The cell element may ALREADY be the active
 * element (the focus that triggered the mount): ProseMirror missed that focus
 * event, so replay it for ProseMirror's own focus state and the onFocus hook.
 */
function focusEditorAtEnd(editor: Editor) {
  const dom = editor.view.dom as HTMLElement;
  selectEnd(editor);
  if (dom.ownerDocument.activeElement === dom) {
    dom.dispatchEvent(new FocusEvent("focus"));
  } else {
    editor.view.focus();
  }
}

function selectEnd(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setSelection(Selection.atEnd(editor.state.doc)));
}
