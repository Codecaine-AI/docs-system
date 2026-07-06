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
import type { SpectreRef } from "@codecaine-ai/docs-model/spectre-ref";
import { useDocsClient, type DocsClient, type DocsTreeNode } from "../client";

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

export const DocReference = Node.create({
  name: "docReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      ref: { default: null as SpectreRef | null },
      label: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-doc-reference]" }];
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
 * Hover hook: shows a small popup with the reference's target info and a
 * "navigate" affordance. Navigation is a no-op stub in v1 (emits a
 * CustomEvent so a host page can opt in — CP8 scope doesn't include a
 * doc-to-doc router) but the target info + open affordance are real so
 * backlinks/mentions read as first-class citizens.
 */
function ReferenceChipView({ node }: ReactNodeViewProps) {
  const attrs = node.attrs as DocReferenceAttrs;
  const [open, setOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { refs, floatingStyles } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "top",
    whileElementsMounted: autoUpdate,
    middleware: [offsetMiddleware(6), flip(), shift({ padding: 8 })],
  });

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  const openSoon = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(true), 150);
  };
  const closeSoon = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(false), 100);
  };

  const navigate = (event: ReactMouseEvent) => {
    event.preventDefault();
    document.dispatchEvent(
      new CustomEvent("spectre:doc-reference-navigate", { detail: attrs.ref }),
    );
  };

  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        ref={refs.setReference}
        data-doc-reference="true"
        data-ref-kind={attrs.ref?.kind}
        data-ref-path={attrs.ref?.path}
        title={attrs.ref?.path}
        onMouseEnter={openSoon}
        onMouseLeave={closeSoon}
        onClick={navigate}
        className="inline-flex cursor-pointer items-center gap-1 rounded border border-primary/30 bg-primary/5 px-1 py-0.5 font-mono text-[0.85em] text-foreground"
      >
        {attrs.label || attrs.ref?.label || attrs.ref?.path}
      </span>
      {open && attrs.ref && (
        <span
          ref={refs.setFloating}
          style={floatingStyles}
          onMouseEnter={openSoon}
          onMouseLeave={closeSoon}
          className="z-50 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md"
        >
          <div className="font-medium">{attrs.ref.label ?? attrs.ref.path}</div>
          <div className="mt-0.5 text-muted-foreground">
            {attrs.ref.kind === "doc" ? "Doc" : "Source"}: {attrs.ref.path}
            {attrs.ref.line !== undefined ? `:${attrs.ref.line}` : ""}
            {attrs.ref.symbol ? ` (${attrs.ref.symbol})` : ""}
          </div>
          <button
            type="button"
            onClick={navigate}
            className="mt-1 rounded border px-1.5 py-0.5 text-[11px] font-medium hover:bg-muted"
          >
            Go to reference
          </button>
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
      insertReference(editor, state.from, state.to, { kind: "doc", path: entry.path, label: entry.label }, entry.label);
    },
    [editor, state.from, state.to],
  );
  const chooseCustomPath = useCallback(() => {
    insertReference(editor, state.from, state.to, { kind: "source", path: query, label: query }, query);
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
            className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-muted data-[selected=true]:bg-muted"
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
            className="flex w-full flex-col items-start rounded border-t px-2 py-1.5 text-left hover:bg-muted data-[selected=true]:bg-muted"
          >
            <span className="font-medium">Reference source path "{query}"</span>
            <span className="text-xs text-muted-foreground">Insert as a source reference</span>
          </button>
        )}
      </div>
    </div>
  );
}
