"use client";

import { Extension, Node, mergeAttributes, posToDOMRect, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  autoUpdate,
  flip,
  offset as offsetMiddleware,
  shift,
  useFloating,
  type ReferenceType,
} from "@floating-ui/react";
import { validateSpectreRef, type SpectreRef } from "@codecaine-ai/docs-model/spectre-ref";
import { FileTextIcon } from "lucide-react";
import { useDocsClient, type DocsClient, type DocsTreeNode } from "../../client";
import {
  DOC_REFERENCE_NAVIGATE_EVENT,
  type DocReferenceNavigateDetail,
  type DocReferenceNavigateIntent,
} from "../../peek/peek-state";

/**
 * Inline reference (mention) node — the doc.json `DeltaSpan.attributes.reference`
 * (D27, a `SpectreRef`) represented as its OWN embedded inline PM node, not a
 * text mark. This follows upstream BlockSuite's model (ported from
 * `reference/blocksuite-main/packages/affine/inlines/reference/src/inline-spec.ts`,
 * MPL-2.0 — see `lib/vendor/blocksuite/slash-menu-model.ts` header and NOTICE
 * for the vendoring convention; this file is an independent TypeScript+React
 * port of the SHAPE only — no Lit, no BlockSuite runtime deps — so it lives
 * here rather than under lib/vendor/blocksuite, matching how `gfx-types.ts`
 * was handled for pure reimplementations there): a reference carries its own
 * display text + full target identity (kind/path/symbol/line/section/label)
 * as node attrs, and renders as an atomic inline chip — because ProseMirror
 * marks can't own text independent of the surrounding run, but a mention
 * needs exactly that (its label is data, not literal document prose).
 *
 * `docReference` is `atom: true`, `inline: true` — a single leaf position in
 * the PM doc. `convert.ts` maps it 1:1 to/from a DeltaSpan whose `insert` is
 * the node's `label` and whose `attributes.reference` is the node's `ref`.
 */
export type DocReferenceAttrs = {
  ref: SpectreRef;
  label: string;
};

/**
 * Defensive parse of the JSON-encoded clipboard payload — null for missing,
 * malformed, or non-SpectreRef data, so a corrupted span can never re-enter
 * a doc as a junk reference. Validation is a GATE only: the parsed object is
 * returned as-is (validateSpectreRef's cleaned copy carries explicit
 * `undefined` optional keys, which would make diffToOps's key-counting
 * deepEqual flag every pasted reference as changed).
 */
function parseReferencePayload(raw: string | null): SpectreRef | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return validateSpectreRef(parsed).ok ? (parsed as SpectreRef) : null;
  } catch {
    return null;
  }
}

export const DocReference = Node.create({
  name: "docReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      ref: {
        default: null as SpectreRef | null,
        // The SpectreRef object must be explicitly JSON-encoded for the
        // clipboard round trip — TipTap's default attribute rendering wrote
        // it as `ref="[object Object]"`, which paste read back as that
        // literal string and corrupted the saved doc.json span (the doc then
        // failed validation on next load).
        parseHTML: (element: HTMLElement) =>
          parseReferencePayload(element.getAttribute("data-doc-reference-payload")),
        renderHTML: (attributes: Record<string, unknown>) => {
          const ref = attributes.ref as SpectreRef | null;
          return ref ? { "data-doc-reference-payload": JSON.stringify(ref) } : {};
        },
      },
      // Explicit parse keeps TipTap's default `fromString` coercion from
      // turning an all-numeric label into a number.
      label: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("label") ?? "",
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-doc-reference]",
        // A span whose payload is missing or malformed (e.g. HTML copied
        // before the JSON encoding existed) is NOT a reference — reject the
        // rule so the span's label text pastes as plain text instead of a
        // target-less chip.
        getAttrs: (element) =>
          parseReferencePayload(element.getAttribute("data-doc-reference-payload")) ? null : false,
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const ref = node.attrs.ref as SpectreRef | null;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-doc-reference": "true",
        "data-ref-kind": ref?.kind,
        "data-ref-path": ref?.path,
      }),
      (node.attrs.label as string) ?? ref?.label ?? ref?.path ?? "",
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ReferenceChipView);
  },
});

/**
 * The chip's compact, fast tooltip exposes the target path. Clicks dispatch
 * `DOC_REFERENCE_NAVIGATE_EVENT` on `document` with a
 * `DocReferenceNavigateDetail` (see ../../peek/peek-state): a plain click on
 * a doc ref carries intent "peek" (DocPeekPanel opens a read-only side
 * preview), while Cmd/Ctrl-click and source refs (no doc.json to preview)
 * carry intent "navigate" — the host performs full navigation.
 */
function ReferenceChipView({ node }: ReactNodeViewProps) {
  const attrs = node.attrs as DocReferenceAttrs;
  const tooltipId = useId();
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { refs, floatingStyles } = useFloating({
    open: tooltipOpen,
    onOpenChange: setTooltipOpen,
    placement: "top",
    whileElementsMounted: autoUpdate,
    middleware: [offsetMiddleware(5), flip(), shift({ padding: 8 })],
  });

  useEffect(() => {
    return () => {
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    };
  }, []);

  const showTooltipSoon = () => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => setTooltipOpen(true), 50);
  };

  const hideTooltip = () => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    tooltipTimer.current = null;
    setTooltipOpen(false);
  };

  // stopPropagation alongside preventDefault so ProseMirror's click/selection
  // handling doesn't fight the chip click.
  const dispatchNavigate = (event: ReactMouseEvent, intent: DocReferenceNavigateIntent) => {
    event.preventDefault();
    event.stopPropagation();
    document.dispatchEvent(
      new CustomEvent<DocReferenceNavigateDetail>(DOC_REFERENCE_NAVIGATE_EVENT, {
        detail: { ref: attrs.ref, intent },
      }),
    );
  };

  const handleChipClick = (event: ReactMouseEvent) => {
    const wantsFullNavigation =
      event.metaKey || event.ctrlKey || attrs.ref?.kind !== "doc";
    dispatchNavigate(event, wantsFullNavigation ? "navigate" : "peek");
  };

  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        ref={refs.setReference}
        data-doc-reference="true"
        data-ref-kind={attrs.ref?.kind}
        data-ref-path={attrs.ref?.path}
        aria-describedby={tooltipOpen ? tooltipId : undefined}
        onBlur={hideTooltip}
        onClick={handleChipClick}
        onFocus={() => setTooltipOpen(true)}
        onMouseEnter={showTooltipSoon}
        onMouseLeave={hideTooltip}
        className="group inline-flex cursor-pointer items-center gap-[var(--docs-ref-icon-gap,2px)] [flex-direction:var(--docs-ref-icon-direction,row)] text-[color:var(--docs-ref-color,var(--muted-foreground))]"
      >
        <FileTextIcon
          aria-hidden
          className="shrink-0 text-[color:var(--docs-ref-icon-color,currentColor)] [height:var(--docs-ref-icon-size,12px)] [width:var(--docs-ref-icon-size,12px)]"
        />
        <span className="underline-offset-2 group-hover:underline group-hover:decoration-[color:var(--docs-ref-underline-color,color-mix(in_srgb,var(--foreground)_40%,transparent))]">
          {attrs.label || attrs.ref?.label || attrs.ref?.path}
        </span>
      </span>
      {tooltipOpen && attrs.ref?.path && (
        <span
          ref={refs.setFloating}
          id={tooltipId}
          role="tooltip"
          style={floatingStyles}
          className="pointer-events-none z-50 max-w-[min(32rem,calc(100vw-1rem))] break-all rounded-sm bg-foreground px-2 py-1 text-[11px] leading-tight text-background shadow-sm"
        >
          {attrs.ref.path}
        </span>
      )}
    </NodeViewWrapper>
  );
}

export type ReferencePickerEntry = {
  path: string;
  label: string;
};

/** Flattens the docs tree (bundle/file nodes only) into pickable entries for the "Reference" slash command / `@`-mention picker. */
function flattenDocsTree(nodes: DocsTreeNode[], out: ReferencePickerEntry[] = []): ReferencePickerEntry[] {
  for (const node of nodes) {
    if (node.kind === "bundle" || node.kind === "file") {
      out.push({ path: node.path, label: node.name });
    }
    if (node.children) flattenDocsTree(node.children, out);
  }
  return out;
}

/**
 * Loads pickable doc references for a project (used by the `@`-mention /
 * "Reference" slash command picker in SlashMenu.tsx and the inline `@`
 * trigger in DocEditor.tsx). Source refs are a plain path text input in v1
 * per the checkpoint spec — this only lists DOC targets. The docs tree comes
 * from the host's `DocsClient` (see ../client.tsx).
 */
export async function loadReferencePickerEntries(
  client: Pick<DocsClient, "getDocsTree">,
  projectId: string,
): Promise<ReferencePickerEntry[]> {
  const { tree } = await client.getDocsTree(projectId);
  return flattenDocsTree(tree);
}

// ---------------------------------------------------------------------------
// `@`-mention trigger + picker (TG8.2.3)
// ---------------------------------------------------------------------------

export type ReferenceMentionState = {
  open: boolean;
  from: number;
  to: number;
  query: string;
};

const CLOSED_MENTION_STATE: ReferenceMentionState = { open: false, from: 0, to: 0, query: "" };

export const referenceMentionPluginKey = new PluginKey<ReferenceMentionState>("docReferenceMention");

/**
 * TipTap extension mirroring SlashMenu's trigger-tracking plugin, but for
 * `@query`: tracks the live range as plugin state so `ReferenceMentionPopover`
 * can render a floating picker over the docs tree. Selecting an entry
 * replaces the `@query` range with a `docReference` inline atom node
 * (source refs remain a plain-path text affordance in v1 — see the "Custom
 * path…" entry `ReferenceMentionPopover` always offers at the bottom).
 */
export const ReferenceMention = Extension.create({
  name: "docReferenceMention",

  addKeyboardShortcuts() {
    // TipTap hoists every extension's keymap plugin ahead of all
    // addProseMirrorPlugins plugins (including its own core Enter→splitBlock
    // keymap), so the plugin-prop swallow below runs too LATE to stop other
    // keymaps (DocKeymap, core splitBlock) from ALSO acting on Enter/Tab
    // while the picker is open. These bindings swallow the picker's keys at
    // the front of the chain — the actual navigation/selection already
    // happened in ReferenceMentionPopover's capture-phase document listener,
    // which fires before ProseMirror sees the event at all.
    const swallowWhileOpen = () => {
      const state = referenceMentionPluginKey.getState(this.editor.state);
      return state?.open === true;
    };
    return {
      Enter: swallowWhileOpen,
      Tab: swallowWhileOpen,
      ArrowUp: swallowWhileOpen,
      ArrowDown: swallowWhileOpen,
      Escape: () => {
        const state = referenceMentionPluginKey.getState(this.editor.state);
        if (!state?.open) return false;
        this.editor.view.dispatch(
          this.editor.view.state.tr.setMeta(referenceMentionPluginKey, { forceClose: true }),
        );
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<ReferenceMentionState>({
        key: referenceMentionPluginKey,
        state: {
          init: () => CLOSED_MENTION_STATE,
          apply(tr, prev) {
            const meta = tr.getMeta(referenceMentionPluginKey) as
              | (Partial<ReferenceMentionState> & { forceClose?: boolean })
              | undefined;
            if (meta?.forceClose) return CLOSED_MENTION_STATE;
            if (meta && prev.open) return { ...prev, ...meta };

            const { selection } = tr;
            if (!selection.empty) return CLOSED_MENTION_STATE;
            const pos = selection.from;
            const $pos = tr.doc.resolve(pos);
            const textBefore = $pos.parent.textBetween(0, $pos.parentOffset, undefined, "￼");

            if (!prev.open) {
              const match = /(^|\s)@([^\s@]*)$/.exec(textBefore);
              if (!match) return CLOSED_MENTION_STATE;
              const query = match[2] ?? "";
              const from = pos - query.length - 1;
              return { open: true, from, to: pos, query };
            }

            if (pos < prev.from) return CLOSED_MENTION_STATE;
            const sliceStart = tr.doc.resolve(prev.from);
            const mentionText = sliceStart.parent.textBetween(
              sliceStart.parentOffset,
              sliceStart.parentOffset + (pos - prev.from),
              undefined,
              "￼",
            );
            if (!mentionText.startsWith("@") || /\s/.test(mentionText.slice(1))) {
              return CLOSED_MENTION_STATE;
            }
            return { ...prev, to: pos, query: mentionText.slice(1) };
          },
        },
        props: {
          handleKeyDown(view, event) {
            const state = referenceMentionPluginKey.getState(view.state);
            if (!state?.open) return false;
            // Escape closes here; ArrowUp/ArrowDown/Enter navigation is
            // handled by ReferenceMentionPopover itself (a capture-phase DOM
            // listener) since the filtered entry list + selectedIndex live
            // in that component's React state, not in PM plugin state.
            if (event.key === "Escape") {
              view.dispatch(view.state.tr.setMeta(referenceMentionPluginKey, { forceClose: true }));
              return true;
            }
            if (["ArrowUp", "ArrowDown", "Enter", "Tab"].includes(event.key)) {
              // Prevent PM's default handling (e.g. Enter creating a new
              // paragraph) while the picker is open — the popup's own
              // listener performs the actual navigation/selection.
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

function insertReference(editor: Editor, from: number, to: number, ref: SpectreRef, label: string) {
  editor
    .chain()
    .focus()
    .deleteRange({ from, to })
    .insertContent({ type: "docReference", attrs: { ref, label } })
    .run();
  editor.view.dispatch(editor.view.state.tr.setMeta(referenceMentionPluginKey, { forceClose: true }));
}

/**
 * Floating `@`-mention picker: lists matching doc-tree entries (fetched via
 * `loadReferencePickerEntries`) plus an always-present "insert as source
 * path" affordance for the plain-path v1 source-ref flow. Mounted
 * unconditionally by DocEditor; renders nothing when closed.
 */
export function ReferenceMentionPopover({
  editor,
  projectId,
}: {
  editor: Editor;
  projectId: string;
}) {
  const [state, setState] = useState<ReferenceMentionState>(CLOSED_MENTION_STATE);
  const [entries, setEntries] = useState<ReferencePickerEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // No DocsClient -> the picker still opens but lists no doc entries (the
  // "custom path" source-ref affordance keeps working).
  const client = useDocsClient();

  useEffect(() => {
    const update = () => {
      setState(referenceMentionPluginKey.getState(editor.state) ?? CLOSED_MENTION_STATE);
    };
    editor.on("transaction", update);
    update();
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);

  useEffect(() => {
    let cancelled = false;
    if (!client) {
      setEntries([]);
      return;
    }
    loadReferencePickerEntries(client, projectId)
      .then((loaded) => {
        if (!cancelled) setEntries(loaded);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client, projectId]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [state.query]);

  const virtualReference = useMemo<ReferenceType | null>(() => {
    if (!state.open) return null;
    return {
      getBoundingClientRect: () => posToDOMRect(editor.view, state.from, state.to),
    };
  }, [editor, state.open, state.from, state.to]);

  const { refs, floatingStyles } = useFloating({
    open: state.open,
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [offsetMiddleware(6), flip(), shift({ padding: 8 })],
  });

  useEffect(() => {
    refs.setReference(virtualReference);
  }, [refs, virtualReference]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const query = state.query.trim();
  // Memoized so the capturing document keydown listener below doesn't
  // detach/re-attach on every unrelated render (each editor transaction
  // re-renders this popover) — only when the inputs actually change.
  const filtered = useMemo(
    () =>
      query
        ? entries.filter((entry) => entry.label.toLowerCase().includes(query.toLowerCase()) || entry.path.toLowerCase().includes(query.toLowerCase()))
        : entries,
    [entries, query],
  );
  const showCustomPath = query.length > 0;
  const rowCount = filtered.length + (showCustomPath ? 1 : 0);

  const chooseDoc = useCallback(
    (entry: ReferencePickerEntry) => {
      insertReference(editor, state.from, state.to, { kind: "doc", path: entry.path }, entry.label);
    },
    [editor, state.from, state.to],
  );
  const chooseCustomPath = useCallback(() => {
    insertReference(editor, state.from, state.to, { kind: "source", path: query }, query);
  }, [editor, state.from, state.to, query]);

  useEffect(() => {
    if (!state.open || rowCount === 0) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, rowCount - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        if (selectedIndex < filtered.length) chooseDoc(filtered[selectedIndex]);
        else if (showCustomPath) chooseCustomPath();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [state.open, rowCount, selectedIndex, filtered, showCustomPath, chooseDoc, chooseCustomPath]);

  if (!state.open) return null;

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      data-doc-reference-picker="true"
      className="z-50 max-h-72 w-72 overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
    >
      <div ref={containerRef}>
        {filtered.length === 0 && !showCustomPath && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Type to search docs…</div>
        )}
        {filtered.map((entry, index) => (
          <button
            key={entry.path}
            type="button"
            data-selected={index === selectedIndex}
            onMouseDown={(event) => {
              event.preventDefault();
              chooseDoc(entry);
            }}
            className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left hover:bg-muted data-[selected=true]:bg-muted"
          >
            <span className="font-medium">{entry.label}</span>
            <span className="text-xs text-muted-foreground">{entry.path}</span>
          </button>
        ))}
        {showCustomPath && (
          <button
            type="button"
            data-selected={filtered.length === selectedIndex}
            onMouseDown={(event) => {
              event.preventDefault();
              chooseCustomPath();
            }}
            className="flex w-full flex-col items-start rounded-sm border-t px-2 py-1.5 text-left hover:bg-muted data-[selected=true]:bg-muted"
          >
            <span className="font-medium">Reference source path "{query}"</span>
            <span className="text-xs text-muted-foreground">Insert as a source reference</span>
          </button>
        )}
      </div>
    </div>
  );
}
