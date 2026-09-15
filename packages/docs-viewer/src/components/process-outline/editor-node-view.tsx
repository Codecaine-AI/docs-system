"use client";

import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { isRecord } from "../../editor/core/node-helpers";
// The process outline swaps in this editable view INSTEAD of the shared
// AtomBlockView, so it has to claim its page lane itself — the same wide-data
// lane its registry descriptor declares for the read surface (block-layout.ts).
import {
  WIDE_LEFT_BLOCK_LAYOUT,
  docBlockLaneName,
  docBlockLayoutClasses,
} from "../../render/block-layout";
import { blockAttrs } from "../../render/descriptor-helpers";
import {
  ProcessOutlineDocsBlock,
  type ProcessOutlineEditHooks,
} from "./ProcessOutlineDocsBlock";
import { hasRangeSelection, readCaretOffset, setCaretOffset } from "./editor/caret";
import { resolveLineHit, type LineHit } from "./editor/line-hit";
import {
  extendRangeHead,
  neighborPath,
  planRemoveRange,
  rangeKeys,
  rangePaths,
  serializeRange,
  type LineRange,
} from "./editor/line-range";
import { StepLine } from "./editor/StepLine";
import {
  noteMarkerTyped,
  pathKey,
  plainOffsetToRawOffset,
  planFirstStep,
  planIndent,
  planOutdent,
  planRemoveEmpty,
  planSetKind,
  planSetText,
  planSetTrace,
  planSplit,
  readNodesFromProps,
  readStepsFromProps,
  runOutlineActions,
  samePath,
  stepAt,
  traceMarkerTyped,
  type CaretTarget,
  type LineState,
  type OutlinePlan,
  type StepPath,
} from "./editor/outline-edit";

/** Same debounce the structured table's cells use, so auto-save catches mid-typing changes. */
const COMMIT_DEBOUNCE_MS = 300;

/**
 * Editor node view for `docProcessOutline`: the same rail the read surface
 * draws, edited like a bullet list. Only the step LINES change — the tree,
 * the rail geometry, the note cards and every `data-process-outline-*`
 * attribute come from `ProcessOutlineDocsBlock` itself, through its optional
 * `edit` hooks, so read mode and edit mode can never drift apart.
 *
 * Keys (all on the focused line):
 *
 * | Key                    | Effect                                            |
 * | ---------------------- | ------------------------------------------------- |
 * | typing                 | debounced `setStepText`                           |
 * | Enter                  | split at the caret into a new SIBLING below       |
 * | Tab                    | indent — last child of the previous sibling       |
 * | Shift+Tab              | outdent — next sibling of the parent              |
 * | Backspace at start     | note -> step; else delete the step if it's empty  |
 * | `> ` typed at start    | step -> note (the block's own note notation)      |
 * | `=> ` typed at start   | mark the step as a trace event                    |
 * | Escape                 | commit and leave the line                         |
 * | Mod-Z / Mod-Shift-Z    | commit, then the OUTER editor's history           |
 * | Shift+Up / Shift+Down  | grow a LINE RANGE out of the caret                |
 *
 * POINTING is handled for the WHOLE block in one capture-phase handler
 * (`handleMouseDownCapture`), not per line, because the block is a ProseMirror
 * ATOM: every pixel a click can land on that does not put a caret somewhere is
 * a pixel where ProseMirror selects the entire outline instead, and the
 * block-selection wash then paints over it. So:
 *
 * | Pointer                | Effect                                            |
 * | ---------------------- | ------------------------------------------------- |
 * | click a line's text    | caret on the clicked character                    |
 * | click past a line's end| caret at end of that line                         |
 * | click a gap / the rail | caret on the nearest line (never a block select)  |
 * | drag across lines      | a LINE RANGE — per-line highlight, not a wash     |
 * | Shift+click            | extend the range to the clicked line              |
 *
 * A line range is a selection of STEPS, so it answers to Copy (the block's own
 * `-> `/`> `/`=> ` notation), Cut, Delete/Backspace (one `removeStep` per
 * top-level selected step — a selected parent takes its subtree), Shift+Arrow
 * to grow, Arrow to collapse back to a caret, and Escape / a click away to
 * clear. Its keyboard and clipboard land on a hidden focused island holding
 * the serialized selection, so the browser fires real copy/cut events and
 * ProseMirror — which ignores events inside a contenteditable node view child
 * — never sees any of it.
 *
 * Every one of those is a plan of TYPED COMPONENT ACTIONS
 * (`process-outline.insertStep` / `.setStepText` / `.removeStep` /
 * `.moveStep`) run through the registry exactly as the docs-kernel
 * `outline_*` tools run them — same params, same TypeBox validation, same
 * note-is-a-leaf refusals. `setSteps` is never used. A plan that the actions
 * refuse (or that a planner blocks up front) is simply dropped: the keystroke
 * does nothing rather than writing a tree the schema would reject.
 *
 * Transport is the editor's existing pipeline, not a second one: the folded
 * result of a plan lands in ONE `updateAttributes({ blockProps })`, which
 * `convert.ts` diffs into a single `updateBlock` op and which ProseMirror's
 * history records as a single undo step.
 */
export function ProcessOutlineNodeView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const blockId = (node.attrs.blockId as string | null) ?? "";
  const attrProps = useMemo(
    () => (isRecord(node.attrs.blockProps) ? node.attrs.blockProps : {}),
    [node.attrs.blockProps],
  );
  const nodes = useMemo(() => readNodesFromProps(attrProps), [attrProps]);
  const committedSteps = useMemo(() => readStepsFromProps(attrProps), [attrProps]);
  const editable = editor.isEditable;

  // The two selection states, mutually exclusive by construction: a caret in
  // ONE line, or a RANGE of whole lines. Both mean "the user is working inside
  // this block", which is what the block-selection wash keys off.
  const [focusedPath, setFocusedPath] = useState<StepPath | null>(null);
  const [range, setRange] = useState<LineRange | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const holderRef = useRef<HTMLSpanElement | null>(null);
  // Mirrors `range` for the window-level drag listeners, which are installed
  // once per drag and would otherwise close over a stale value.
  const rangeRef = useRef<LineRange | null>(range);
  rangeRef.current = range;
  // The line a drag started on; null when no button is down.
  const dragAnchorRef = useRef<StepPath | null>(null);
  // Removes the in-flight drag's window listeners — on mouseup, on a second
  // drag, and on unmount (a block deleted mid-drag must not leave them behind).
  const dragTeardownRef = useRef<(() => void) | null>(null);

  const lineRef = useRef<HTMLSpanElement | null>(null);
  const pendingCaretRef = useRef<CaretTarget | null>(null);
  const pendingTextRef = useRef<{ path: StepPath; text: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set by a click on another line so the outgoing line's blur doesn't undo
  // the focus move that click just requested.
  const focusRequestRef = useRef<StepPath | null>(null);

  const clearPending = () => {
    pendingTextRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Freshest committed props: updated when the ATTRS change and synchronously
  // inside `commit`, so a debounced text flush and the structural key that
  // follows it in the same tick compose instead of the second dropping the
  // first. The identity guard matters — a local re-render (focus change) sees
  // the same memoized attrs and must not roll the ref back.
  const propsRef = useRef<Record<string, unknown>>(attrProps);
  const attrPropsRef = useRef(attrProps);
  // The exact props object the last `commit` handed to `updateAttributes`.
  // Attrs coming back with that identity are this view's OWN edit echoing
  // through ProseMirror; anything else moved the tree from OUTSIDE.
  const echoRef = useRef<Record<string, unknown> | null>(null);
  // Bumped whenever an outside edit invalidated local keystrokes; the focused
  // island hard-adopts the model's text when it changes.
  const adoptRevisionRef = useRef(0);
  if (attrPropsRef.current !== attrProps) {
    attrPropsRef.current = attrProps;
    propsRef.current = attrProps;
    // An outside edit landed — an undo, an agent edit over SSE, a
    // collaborator. Debounced text still in flight was typed against a tree
    // that no longer exists, so flushing it would silently clobber the new
    // one. Drop it; the island adopts the incoming text instead.
    if (echoRef.current !== attrProps && pendingTextRef.current) {
      clearPending();
      // The dropped keystrokes are still sitting in the island's DOM, which
      // normally refuses to adopt while it holds uncommitted text. Bumping
      // the revision tells it those keystrokes are dead and the model wins.
      adoptRevisionRef.current += 1;
    }
    echoRef.current = null;
  }

  useEffect(
    () => () => {
      clearPending();
      dragTeardownRef.current?.();
    },
    [],
  );

  /**
   * The single commit funnel. Folds the plan's actions over the freshest
   * props, writes the result as one attr update, and records where the caret
   * has to reappear. Returns false when the plan was blocked or an action
   * refused it — callers use that to fall back (a blocked `> ` conversion
   * leaves the marker as literal text).
   */
  const commit = (plan: OutlinePlan | null): boolean => {
    if (!plan) return false;
    clearPending();
    const result = runOutlineActions(propsRef.current, plan.actions);
    if (!result.ok) return false;
    propsRef.current = result.props;
    echoRef.current = result.props;
    updateAttributes({ blockProps: result.props });
    if (plan.caret === "clear") {
      pendingCaretRef.current = null;
      setFocusedPath(null);
    } else if (plan.caret !== "keep") {
      // A plan that repositions the caret rewrote the line under the island
      // (a stripped marker, a split, a re-parent). The island holds the text
      // the user typed, which may equal the PREVIOUS model text — so its own
      // "did the model move?" check cannot see the change. Tell it directly.
      adoptRevisionRef.current += 1;
      pendingCaretRef.current = plan.caret;
      focusRequestRef.current = plan.caret.path;
      setFocusedPath(plan.caret.path);
    }
    return true;
  };

  const flushPendingText = () => {
    const pending = pendingTextRef.current;
    if (!pending) return;
    clearPending();
    commit(planSetText(readStepsFromProps(propsRef.current), pending.path, pending.text));
  };

  const scheduleTextCommit = (path: StepPath, text: string) => {
    clearPending();
    pendingTextRef.current = { path, text };
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flushPendingText();
    }, COMMIT_DEBOUNCE_MS);
  };

  // Focus + caret land after the committed attrs have rendered the target
  // line as an island. Layout effect, not passive: the caret must be in place
  // before the browser paints, or the user sees it jump.
  useLayoutEffect(() => {
    const target = pendingCaretRef.current;
    const element = lineRef.current;
    if (!target || !element) return;
    if (!samePath(focusedPath, target.path)) return;
    pendingCaretRef.current = null;
    focusRequestRef.current = null;
    element.focus();
    setCaretOffset(element, target.offset);
  });

  const registerElement = (path: StepPath, element: HTMLSpanElement | null) => {
    lineRef.current = element;
    if (element) focusRequestRef.current = null;
    void path;
  };

  const handleFocusRequest = (path: StepPath, offset: number | "end") => {
    flushPendingText();
    focusRequestRef.current = path;
    pendingCaretRef.current = { path, offset };
    setFocusedPath(path);
  };

  const handleBlur = (path: StepPath) => {
    flushPendingText();
    if (focusRequestRef.current === null && samePath(focusedPath, path)) setFocusedPath(null);
  };

  /* ------------------------------------------------------------ pointing -- */

  const clearRange = () => {
    rangeRef.current = null;
    setRange(null);
  };

  /** Put the caret where the pointer landed; a caret always replaces a range. */
  const focusHit = (hit: LineHit) => {
    clearRange();
    const step = stepAt(readStepsFromProps(propsRef.current), hit.path);
    // The hit offset counts RENDERED characters (the line was showing chips);
    // the island shows raw text, so the backticks have to be counted back in.
    const offset =
      hit.offset === "end" || !step ? "end" : plainOffsetToRawOffset(step.text, hit.offset);
    handleFocusRequest(hit.path, offset);
  };

  /**
   * Switch from "editing one line" to "selecting whole lines". The line island
   * goes away, so its pending text is flushed first — a range delete must not
   * resurrect keystrokes typed into a line it is about to remove.
   */
  const startRange = (anchor: StepPath, head: StepPath) => {
    flushPendingText();
    pendingCaretRef.current = null;
    focusRequestRef.current = null;
    rangeRef.current = { anchor, head };
    setFocusedPath(null);
    setRange({ anchor, head });
  };

  /**
   * Track the pointer for as long as the button is down. Staying inside the
   * line the drag started on is a plain TEXT selection (the browser's own,
   * inside the island); the moment the pointer reaches another line it becomes
   * a line range, and it keeps following the pointer from there.
   */
  const beginDrag = (anchor: StepPath | null) => {
    const view = rootRef.current?.ownerDocument.defaultView;
    dragTeardownRef.current?.();
    if (!anchor || !view) return;
    dragAnchorRef.current = anchor;
    const onMove = (event: globalThis.MouseEvent) => {
      const anchorPath = dragAnchorRef.current;
      const root = rootRef.current;
      if (!anchorPath || !root) return;
      const hit = resolveLineHit(root, event.target as Element | null, event.clientX, event.clientY);
      if (!hit) return;
      if (rangeRef.current === null && samePath(hit.path, anchorPath)) return;
      if (rangeRef.current && samePath(rangeRef.current.head, hit.path)) return;
      startRange(anchorPath, hit.path);
    };
    const onUp = () => {
      dragAnchorRef.current = null;
      dragTeardownRef.current = null;
      view.removeEventListener("mousemove", onMove);
      view.removeEventListener("mouseup", onUp);
    };
    dragTeardownRef.current = onUp;
    view.addEventListener("mousemove", onMove);
    view.addEventListener("mouseup", onUp);
  };

  /**
   * The block's ONE pointer entry point, in the CAPTURE phase so it runs
   * before ProseMirror's own mousedown listener on the editor root and can
   * stop the event from ever reaching it. That is the whole fix for the
   * block-selection wash: ProseMirror turns a click on a selectable atom into
   * a NodeSelection over the entire block, and a flag that suppresses the wash
   * only helps for clicks that already landed a caret. Here, no click inside
   * the outline reaches ProseMirror at all, and every one of them lands a
   * caret or a range.
   */
  const handleMouseDownCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const root = rootRef.current;
    const target = event.target as HTMLElement | null;
    if (!root || !target) return;
    // The empty-outline placeholder seeds the first step itself.
    if (target.closest("[data-process-outline-seed]")) return;

    const hit = resolveLineHit(root, target, event.clientX, event.clientY);
    const anchor = range?.anchor ?? focusedPath;
    if (event.shiftKey && anchor && hit) {
      event.preventDefault();
      event.stopPropagation();
      startRange(anchor, hit.path);
      return;
    }

    // Inside the line that already has the caret: leave the browser alone, so
    // selecting part of a line's text still works. Only a drag that LEAVES the
    // line turns into a range.
    if (target.closest('[data-process-outline-step-editing="true"]')) {
      beginDrag(hit?.path ?? focusedPath);
      return;
    }

    if (!hit) return;
    event.preventDefault();
    event.stopPropagation();
    focusHit(hit);
    beginDrag(hit.path);
  };

  /* ------------------------------------------------------- line ranges --- */

  const selectedPaths = useMemo(() => rangePaths(committedSteps, range), [committedSteps, range]);
  const selectedKeys = useMemo(() => rangeKeys(selectedPaths), [selectedPaths]);
  const rangeText = useMemo(() => serializeRange(committedSteps, range), [committedSteps, range]);

  // A range aimed at steps that no longer exist (an undo, an agent edit) is
  // gone, not stale.
  useEffect(() => {
    if (range && selectedPaths.length === 0) clearRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, selectedPaths]);

  // Clicking anywhere OUTSIDE the block drops the range. Capture phase, and on
  // the document, because the click may land on something that never takes
  // focus (a page margin) and so would never blur the holder.
  useEffect(() => {
    const root = rootRef.current;
    const doc = root?.ownerDocument;
    if (!range || !root || !doc) return;
    const onAway = (event: Event) => {
      if (!root.contains(event.target as Node)) clearRange();
    };
    doc.addEventListener("mousedown", onAway, true);
    return () => doc.removeEventListener("mousedown", onAway, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // The hidden island holds the serialized selection and holds FOCUS, so the
  // browser has something to fire copy/cut at and the keys below land
  // somewhere. Selecting its contents is what makes the copy event fire at all
  // in browsers that refuse to copy an empty selection.
  useLayoutEffect(() => {
    const holder = holderRef.current;
    if (!range || !holder) return;
    const doc = holder.ownerDocument;
    if (doc.activeElement !== holder) holder.focus({ preventScroll: true });
    const selection = doc.defaultView?.getSelection?.();
    if (!selection) return;
    try {
      const domRange = doc.createRange();
      domRange.selectNodeContents(holder);
      selection.removeAllRanges();
      selection.addRange(domRange);
    } catch {
      // Selecting the holder is an affordance for the clipboard, not a
      // requirement: the copy handler writes the text itself.
    }
  }, [range, rangeText]);

  /** Copy/Cut over a range: the block's own notation, written explicitly. */
  const writeRangeToClipboard = (event: ClipboardEvent<HTMLElement>): boolean => {
    const current = rangeRef.current;
    if (!current) return false;
    const text = serializeRange(readStepsFromProps(propsRef.current), current);
    event.preventDefault();
    event.clipboardData?.setData("text/plain", text);
    return true;
  };

  const removeRange = () => {
    const current = rangeRef.current;
    if (!current) return;
    const plan = planRemoveRange(readStepsFromProps(propsRef.current), current);
    clearRange();
    commit(plan);
  };

  /** Collapse a range back to a caret at one of its ends. */
  const collapseRange = (edge: "start" | "end") => {
    const paths = selectedPaths;
    const path = edge === "start" ? paths[0] : paths[paths.length - 1];
    clearRange();
    if (path) handleFocusRequest(path, "end");
  };

  const handleRangeKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    const current = rangeRef.current;
    if (!current) return;
    const history = editor.commands as Partial<{ undo: () => boolean; redo: () => boolean }>;

    if (event.metaKey || event.ctrlKey) {
      const key = event.key.toLowerCase();
      // Copy and Cut ride the browser's own events (handled below); undo/redo
      // leave the selection and hand over to the outer editor's history.
      if (key === "z" || key === "y") {
        event.preventDefault();
        clearRange();
        if (key === "y" || event.shiftKey) history.redo?.();
        else history.undo?.();
      }
      return;
    }

    switch (event.key) {
      case "Escape": {
        event.preventDefault();
        clearRange();
        if (!editor.isDestroyed) editor.view.focus();
        return;
      }
      case "Backspace":
      case "Delete": {
        event.preventDefault();
        removeRange();
        return;
      }
      case "ArrowUp":
      case "ArrowDown": {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        if (event.shiftKey) {
          const grown = extendRangeHead(readStepsFromProps(propsRef.current), current, delta);
          if (grown) {
            rangeRef.current = grown;
            setRange(grown);
          }
          return;
        }
        collapseRange(delta === 1 ? "end" : "start");
        return;
      }
      default:
        // The holder is a clipboard target, never a text field: anything that
        // would type into it is dropped.
        if (event.key.length === 1 || event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
        }
    }
  };

  const handleInput = (path: StepPath, element: HTMLSpanElement) => {
    const text = element.textContent ?? "";
    const steps = readStepsFromProps(propsRef.current);
    const step = stepAt(steps, path);
    if (step && step.kind !== "note") {
      const line: LineState = { text, caret: readCaretOffset(element) };
      // `=> ` is checked FIRST: `> ` is its suffix, and a step typed as
      // `=> foo` must become a trace step, never a note called "> foo".
      const traced = traceMarkerTyped(line);
      if (traced && commit(planSetTrace(steps, path, true, traced))) return;
      const stripped = noteMarkerTyped(line);
      // A step that owns children can't become a note (notes are leaves), so
      // the conversion is refused and the marker just stays as typed text.
      if (stripped && commit(planSetKind(steps, path, "note", stripped))) return;
    }
    scheduleTextCommit(path, text);
  };

  const handleKeyDown = (path: StepPath, event: KeyboardEvent<HTMLSpanElement>) => {
    const element = event.currentTarget;
    const line: LineState = { text: element.textContent ?? "", caret: readCaretOffset(element) };
    const steps = readStepsFromProps(propsRef.current);
    const history = editor.commands as Partial<{ undo: () => boolean; redo: () => boolean }>;

    if (event.metaKey || event.ctrlKey) {
      const key = event.key.toLowerCase();
      if (key === "z" || key === "y") {
        event.preventDefault();
        commit(planSetText(steps, path, line.text));
        if (key === "y" || event.shiftKey) history.redo?.();
        else history.undo?.();
      }
      return;
    }

    // Shift+Arrow leaves single-line editing and starts selecting WHOLE lines,
    // anchored on the line the caret is in — the keyboard twin of dragging.
    if (event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      commit(planSetText(steps, path, line.text));
      const next = neighborPath(readStepsFromProps(propsRef.current), path, delta);
      startRange(path, next ?? path);
      return;
    }

    switch (event.key) {
      case "Enter": {
        event.preventDefault();
        commit(planSplit(steps, path, line));
        return;
      }
      case "Tab": {
        event.preventDefault();
        commit(event.shiftKey ? planOutdent(steps, path, line) : planIndent(steps, path, line));
        return;
      }
      case "Backspace": {
        if (line.caret !== 0 || hasRangeSelection(element)) return;
        const step = stepAt(steps, path);
        // At the start of a note, Backspace peels the note marker off first
        // (note -> step); a second Backspace then deletes the now-empty step,
        // so the two conversions and the delete stack the way they do in any
        // block editor.
        if (step?.kind === "note") {
          event.preventDefault();
          commit(planSetKind(steps, path, "step", line));
          return;
        }
        // Backspace peels the trace mark off the same way it peels a note
        // marker: the mark is notation, so deleting it is deleting the `=>`.
        if (step?.trace) {
          event.preventDefault();
          commit(planSetTrace(steps, path, false, line));
          return;
        }
        if (line.text.length === 0) {
          event.preventDefault();
          commit(planRemoveEmpty(steps, path));
        }
        return;
      }
      case "Escape": {
        event.preventDefault();
        commit(planSetText(steps, path, line.text));
        setFocusedPath(null);
        element.blur();
        if (!editor.isDestroyed) editor.view.focus();
        return;
      }
      default:
    }
  };

  const edit: ProcessOutlineEditHooks | undefined = editable
    ? {
        renderLine: (stepNode, path) => (
          <StepLine
            key={pathKey(path)}
            node={stepNode}
            path={path}
            focused={samePath(focusedPath, path)}
            selected={selectedKeys.has(pathKey(path))}
            adoptRevision={adoptRevisionRef.current}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onBlur={handleBlur}
            registerElement={registerElement}
          />
        ),
        // An empty outline needs one way in; clicking the placeholder seeds
        // the first root step and drops the caret into it.
        renderEmpty: () => (
          <div
            className="docs-process-outline__empty cursor-text"
            data-process-outline-empty="true"
            data-process-outline-seed="true"
            role="button"
            tabIndex={0}
            onMouseDown={(event) => {
              event.preventDefault();
              commit(planFirstStep());
            }}
          >
            empty process outline — no steps yet
          </div>
        ),
      }
    : undefined;

  const block = { id: blockId, type: "process-outline" as const, props: attrProps, children: [] };

  const working = focusedPath !== null || range !== null;

  return (
    <NodeViewWrapper
      as="div"
      ref={rootRef}
      data-doc-node={node.type.name}
      data-doc-lane={docBlockLaneName(WIDE_LEFT_BLOCK_LAYOUT)}
      data-doc-block-type="process-outline"
      // The outline is an ATOM that is edited IN PLACE, so ProseMirror would
      // answer a click inside it with a NodeSelection on the WHOLE block, and
      // the generic block-selection wash (docs-workbench index.css) would then
      // paint over the outline for the entire edit. `handleMouseDownCapture`
      // stops those clicks from reaching ProseMirror at all; this flag is the
      // second line of defence, saying "the user is working inside this block,
      // not holding it" for a selection that arrived some other way (a
      // keyboard selection, an undo). Written on the same element PM puts
      // .ProseMirror-selectednode on, and true for a LINE RANGE too — a range
      // is a selection of steps, not of the block.
      data-process-outline-editing={working ? "true" : "false"}
      className={docBlockLayoutClasses(WIDE_LEFT_BLOCK_LAYOUT)}
      contentEditable={false}
      {...(editable ? { onMouseDownCapture: handleMouseDownCapture } : {})}
    >
      {/* Same wrapper attrs the registry descriptor emits, so anything that
          LOCATES blocks by id works over the editor's DOM too. */}
      <div {...blockAttrs(block)}>
        <ProcessOutlineDocsBlock id={blockId} steps={nodes} edit={edit} />
      </div>
      {range ? (
        <span
          ref={holderRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Selected steps"
          data-process-outline-range="true"
          data-process-outline-range-lines={selectedPaths.length}
          // Off-screen but REAL: it holds focus and a live DOM selection so the
          // browser fires copy/cut, and 1px/fixed/transparent so it can never
          // shift the page or show up. `preventScroll` on focus keeps it from
          // pulling the viewport to the corner.
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: 1,
            height: 1,
            opacity: 0,
            overflow: "hidden",
            pointerEvents: "none",
          }}
          onKeyDown={handleRangeKeyDown}
          onCopy={(event) => {
            event.stopPropagation();
            writeRangeToClipboard(event);
          }}
          onCut={(event) => {
            event.stopPropagation();
            if (writeRangeToClipboard(event)) removeRange();
          }}
          onPaste={(event) => {
            event.stopPropagation();
            event.preventDefault();
          }}
          onBlur={(event) => {
            // Focus moving to something else on the page ends the selection;
            // the WINDOW losing focus (relatedTarget null) does not.
            const next = event.relatedTarget as Node | null;
            if (next && !rootRef.current?.contains(next)) clearRange();
          }}
        >
          {rangeText}
        </span>
      ) : null}
    </NodeViewWrapper>
  );
}
