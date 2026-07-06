"use client";

import { Extension, posToDOMRect, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import {
  autoUpdate,
  flip,
  offset as offsetMiddleware,
  shift,
  useFloating,
  type ReferenceType,
} from "@floating-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DocBlockFlavour } from "@codecaine-ai/docs-model/doc-schema";
import {
  buildSlashMenuItems,
  filterSlashMenuItems,
  isSubMenuItem,
  type SlashMenuActionItem,
  type SlashMenuItem,
} from "../vendor/blocksuite/slash-menu-model";
import { FLAVOUR_TO_NODE_TYPE, TEXT_BLOCK_FLAVOURS } from "./schema";

const TEXT_BLOCK_FLAVOUR_SET = new Set<string>(TEXT_BLOCK_FLAVOURS);

/**
 * Slash-menu insertion context: enough for a command's `action` to replace
 * the `/query` text with whatever PM content the command wants.
 */
export type SlashMenuActionContext = {
  editor: Editor;
  /** Position where the triggering `/` was typed (start of the query range). */
  from: number;
  /** Current end of the query range (cursor position when the command runs). */
  to: number;
};

type SlashCommandItem = SlashMenuActionItem<SlashMenuActionContext>;

/**
 * Replaces the `/query` range with a freshly-inserted block of the given
 * flavour, landing the cursor inside it.
 *
 * Text-bearing flavours (`TEXT_BLOCK_FLAVOURS`) MUST be given explicit
 * `content: [{ type: "docBlockText" }]` here: their PM content expression is
 * `"docBlockText block*"` (see schema.ts's module doc comment), which
 * requires the wrapper node to be present — an empty/absent `content` fails
 * PM's node-content validation (`RangeError: Invalid content for node
 * docHeading: <>`) the moment `insertContent` tries to construct the node.
 * Atom flavours have no content slot at all, so they're inserted bare.
 */
function insertFlavourBlock(flavour: DocBlockFlavour, ctx: SlashMenuActionContext, extraAttrs?: Record<string, unknown>) {
  const nodeType = FLAVOUR_TO_NODE_TYPE[flavour];
  const { editor, from, to } = ctx;
  const node = editor.schema.nodes[nodeType];
  if (!node) return;
  const attrs = { blockId: null, blockProps: {}, ...extraAttrs };
  const content = TEXT_BLOCK_FLAVOUR_SET.has(flavour) ? [{ type: "docBlockText" }] : undefined;
  editor
    .chain()
    .focus()
    .deleteRange({ from, to })
    .insertContent({ type: nodeType, attrs, ...(content ? { content } : {}) })
    .run();
}

/** Fixed v1 command set (TG8.2.1) — Basic / Blocks / Semantic groups, sorted via the vendored group-index model. */
function buildV1Commands(): SlashCommandItem[] {
  const basic = (
    name: string,
    groupIndex: number,
    flavour: DocBlockFlavour,
    extraAttrs?: Record<string, unknown>,
    searchAlias?: string[],
  ): SlashCommandItem => ({
    name,
    group: `0_Basic@${groupIndex}`,
    searchAlias,
    action: (ctx) => insertFlavourBlock(flavour, ctx, extraAttrs),
  });
  const block = (
    name: string,
    groupIndex: number,
    flavour: DocBlockFlavour,
    searchAlias?: string[],
  ): SlashCommandItem => ({
    name,
    group: `1_Blocks@${groupIndex}`,
    searchAlias,
    action: (ctx) => insertFlavourBlock(flavour, ctx),
  });
  const semantic = (
    name: string,
    groupIndex: number,
    flavour: DocBlockFlavour,
  ): SlashCommandItem => ({
    name,
    group: `2_Semantic@${groupIndex}`,
    action: (ctx) => insertFlavourBlock(flavour, ctx),
  });

  return [
    basic("Text", 0, "paragraph"),
    basic("Heading 1", 1, "heading", { level: 1 }, ["h1", "title"]),
    basic("Heading 2", 2, "heading", { level: 2 }, ["h2", "subtitle"]),
    basic("Heading 3", 3, "heading", { level: 3 }, ["h3"]),
    basic("Bullet list", 4, "list-item", { ordered: false }, ["ul", "unordered"]),
    basic("Numbered list", 5, "list-item", { ordered: true }, ["ol", "ordered"]),
    basic("Code", 6, "code", undefined, ["```", "codeblock"]),
    basic("Quote", 7, "quote", undefined, [">", "blockquote"]),
    basic("Divider", 8, "divider", undefined, ["hr", "separator", "---"]),
    block("Callout", 0, "callout", ["note", "info", "tip"]),
    block("Canvas", 1, "canvas", ["diagram", "drawing"]),
    block("Image", 2, "image", ["picture", "photo"]),
    block("Attachment", 3, "attachment", ["file", "upload"]),
    semantic("Decision", 0, "decision"),
    semantic("Constraint", 1, "constraint"),
    semantic("Requirement", 2, "requirement"),
    semantic("Observation", 3, "observation"),
  ];
}

const V1_COMMANDS = buildV1Commands();

export type SlashMenuState = {
  open: boolean;
  from: number;
  to: number;
  query: string;
  selectedIndex: number;
  items: SlashCommandItem[];
};

const CLOSED_STATE: SlashMenuState = {
  open: false,
  from: 0,
  to: 0,
  query: "",
  selectedIndex: 0,
  items: [],
};

export const slashMenuPluginKey = new PluginKey<SlashMenuState>("docSlashMenu");

/** Transaction meta shape the plugin/popup use to force-close or patch (e.g. arrow-key navigation) the menu state out-of-band from doc changes. */
type SlashMenuMeta = Partial<SlashMenuState> & { forceClose?: boolean };

/**
 * TipTap extension: watches the doc for a `/` typed at the start of an
 * (otherwise-empty-so-far) inline run and tracks the live `/query` range as
 * plugin state — `SlashMenuPopover` (below) reads that state via
 * `slashMenuPluginKey.getState(editor.state)` and renders the floating list.
 * Arrow-key/Enter/Escape handling lives in `addKeyboardShortcuts` so it
 * composes correctly with TipTap's own keymap priority.
 */
export const SlashMenu = Extension.create({
  name: "docSlashMenu",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<SlashMenuState>({
        key: slashMenuPluginKey,
        state: {
          init: () => CLOSED_STATE,
          apply(tr, prev) {
            const meta = tr.getMeta(slashMenuPluginKey) as SlashMenuMeta | undefined;
            if (meta?.forceClose) return CLOSED_STATE;
            if (meta && prev.open) return { ...prev, ...meta };

            // A command's `action` (see `insertFlavourBlock`/reference-node's
            // mention insertion) runs its OWN `editor.chain()....run()` before
            // the caller (SlashMenuPopover's `choose`, or this plugin's own
            // `handleKeyDown` Enter branch) gets a chance to dispatch the
            // `forceClose` meta transaction. That first transaction can
            // structurally replace the tracked `/query` inline range with a
            // whole new block node (e.g. a heading), which invalidates
            // `prev.from`/`prev.to` — resolving a now-stale position against
            // the NEW doc can land at a depth/offset `Node.textBetween` never
            // expects (crashing with "Cannot read properties of undefined
            // (reading 'nodeSize')" deep inside `Fragment.nodesBetween`).
            // Since a structural edit that invalidates the tracked range means
            // the menu's context is gone regardless, any resolution failure
            // here is treated the same as "close the menu" rather than
            // crashing the whole transaction (and with it, the edit itself).
            try {
              const { selection } = tr;
              if (!selection.empty) return CLOSED_STATE;
              const pos = selection.from;
              const $pos = tr.doc.resolve(pos);
              const textBefore = $pos.parent.textBetween(0, $pos.parentOffset, undefined, "￼");

              if (!prev.open) {
                // Only open on a literal `/` at the start of the block (or
                // after whitespace) — never mid-word.
                const match = /(^|\s)\/([^\s/]*)$/.exec(textBefore);
                if (!match) return CLOSED_STATE;
                const query = match[2] ?? "";
                const from = pos - query.length - 1;
                return { open: true, from, to: pos, query, selectedIndex: 0, items: V1_COMMANDS };
              }

              // Already open: keep tracking the query range, or close if the
              // `/` was deleted / cursor moved before it / a space was typed.
              if (pos < prev.from) return CLOSED_STATE;
              const sliceStart = tr.doc.resolve(prev.from);
              const slashText = sliceStart.parent.textBetween(
                sliceStart.parentOffset,
                sliceStart.parentOffset + (pos - prev.from),
                undefined,
                "￼",
              );
              if (!slashText.startsWith("/") || /\s/.test(slashText.slice(1))) {
                return CLOSED_STATE;
              }
              return { ...prev, to: pos, query: slashText.slice(1), selectedIndex: 0 };
            } catch {
              return CLOSED_STATE;
            }
          },
        },
        props: {
          handleKeyDown(view, event) {
            const state = slashMenuPluginKey.getState(view.state);
            if (!state?.open) return false;
            // Derive the exact list SlashMenuPopover renders (build applies
            // `when` predicates + group sort BEFORE filtering) so keyboard
            // navigation and the visible popover can never diverge.
            const filtered = filterSlashMenuItems(
              buildSlashMenuItems(state.items, { editor, from: state.from, to: state.to }),
              state.query,
            );
            const flat = flattenForNav(filtered);
            if (event.key === "ArrowDown") {
              const next = { ...state, selectedIndex: Math.min(state.selectedIndex + 1, Math.max(flat.length - 1, 0)) };
              view.dispatch(view.state.tr.setMeta(slashMenuPluginKey, next));
              return true;
            }
            if (event.key === "ArrowUp") {
              const next = { ...state, selectedIndex: Math.max(state.selectedIndex - 1, 0) };
              view.dispatch(view.state.tr.setMeta(slashMenuPluginKey, next));
              return true;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              const chosen = flat[state.selectedIndex];
              if (chosen) {
                event.preventDefault();
                chosen.action({ editor, from: state.from, to: state.to });
                view.dispatch(view.state.tr.setMeta(slashMenuPluginKey, { forceClose: true }));
              }
              return true;
            }
            if (event.key === "Escape") {
              view.dispatch(view.state.tr.setMeta(slashMenuPluginKey, { forceClose: true }));
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

function flattenForNav(items: SlashMenuItem<SlashMenuActionContext>[]): SlashCommandItem[] {
  const out: SlashCommandItem[] = [];
  for (const item of items) {
    if (isSubMenuItem(item)) out.push(...flattenForNav(item.subMenu));
    else out.push(item);
  }
  return out;
}

const GROUP_LABELS: Record<string, string> = {
  Basic: "Basic",
  Blocks: "Blocks",
  Semantic: "Semantic",
};

function groupNameOf(item: SlashCommandItem): string {
  if (!item.group) return "";
  const name = item.group.split("_")[1]?.split("@")[0] ?? "";
  return GROUP_LABELS[name] ?? name;
}

/**
 * Floating popup for the slash menu — reads `SlashMenu`'s plugin state each
 * render, positions itself at the `/` trigger position via `posToDOMRect` +
 * floating-ui, and renders the fuzzy-filtered, grouped command list.
 * Mounted unconditionally by DocEditor; renders nothing when closed.
 */
export function SlashMenuPopover({ editor }: { editor: Editor }) {
  const [state, setState] = useState<SlashMenuState>(CLOSED_STATE);

  useEffect(() => {
    const update = () => {
      const pluginState = slashMenuPluginKey.getState(editor.state) ?? CLOSED_STATE;
      setState(pluginState);
    };
    editor.on("transaction", update);
    update();
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);

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

  const listRef = useRef<HTMLDivElement | null>(null);

  if (!state.open) return null;

  const filtered = filterSlashMenuItems(
    buildSlashMenuItems(state.items, { editor, from: state.from, to: state.to }),
    state.query,
  );
  const flat = flattenForNav(filtered);
  if (flat.length === 0) return null;

  let lastGroup = "";

  const choose = (item: SlashCommandItem) => {
    item.action({ editor, from: state.from, to: state.to });
    editor.view.dispatch(editor.view.state.tr.setMeta(slashMenuPluginKey, { forceClose: true }));
  };

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      data-doc-slash-menu="true"
      className="z-50 max-h-72 w-64 overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
    >
      <div ref={listRef}>
        {flat.map((item, index) => {
          const group = groupNameOf(item);
          const showHeader = group !== lastGroup;
          lastGroup = group;
          return (
            <div key={`${item.name}-${index}`}>
              {showHeader && group && (
                <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group}
                </div>
              )}
              <button
                type="button"
                data-selected={index === state.selectedIndex}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(item);
                }}
                className="flex w-full items-center rounded px-2 py-1.5 text-left hover:bg-muted data-[selected=true]:bg-muted"
              >
                {item.name}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
