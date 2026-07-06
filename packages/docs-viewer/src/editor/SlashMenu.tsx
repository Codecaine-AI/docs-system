"use client";

import { Extension, posToDOMRect, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import {
  autoUpdate,
  flip,
  offset as offsetMiddleware,
  shift,
  useFloating,
  type ReferenceType,
} from "@floating-ui/react";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type Ref } from "react";
import {
  ChevronRight,
  ClipboardCheck,
  Code,
  Eye,
  Frame,
  Heading,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Image as ImageIcon,
  List,
  ListOrdered,
  Lock,
  Megaphone,
  Minus,
  Paperclip,
  Scale,
  TextQuote,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { DocBlockFlavour } from "@codecaine-ai/docs-model/doc-schema";
import {
  buildSlashMenuItems,
  filterSlashMenuItems,
  isSubMenuItem,
  type SlashMenuActionItem,
  type SlashMenuItem,
  type SlashMenuSubMenu,
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

/**
 * Local UI-layer extension of the vendored (MPL-2.0) slash-menu data model:
 * `icon` is a rendering concern the framework-free vendored model must not
 * know about, so it's intersected on here instead of edited into that file.
 */
type SlashCommandActionItem = SlashMenuActionItem<SlashMenuActionContext> & {
  icon?: LucideIcon;
};
type SlashCommandSubMenuItem = SlashMenuSubMenu<SlashMenuActionContext> & {
  icon?: LucideIcon;
  subMenu: SlashCommandItem[];
};
export type SlashCommandItem = SlashCommandActionItem | SlashCommandSubMenuItem;

/** `isSubMenuItem` re-typed for the icon-carrying local item union. */
function isSubMenuCommand(item: SlashCommandItem): item is SlashCommandSubMenuItem {
  return isSubMenuItem(item);
}

/**
 * Replaces the `/query` range with a block of the given flavour, Notion
 * style, landing the cursor inside/after it.
 *
 * This must NOT go through TipTap's `insertContent`: at a cursor inside a
 * text block, `insertContent` drops the new block node into the current
 * block's `block*` CHILD slot (the same `"docBlockText block*"` schema
 * footgun keymap.ts documents for Enter) — the "new block nests into the
 * previous one like a subpage" bug, slash-menu edition. Instead, after
 * deleting the `/query` text, exactly one of three block-level edits runs:
 *
 * - The line is now empty and the target is a wrapped text flavour →
 *   CONVERT the block in place (`setNodeMarkup`; same content shape), like
 *   Notion transforming the line you typed `/heading1` on.
 * - The line is now empty but the target has a different content shape
 *   (code's flat `text*`, atoms) → REPLACE the emptied block.
 * - The line still has text before the `/` → insert the new block as a
 *   true SIBLING right after the current block.
 */
function insertFlavourBlock(flavour: DocBlockFlavour, ctx: SlashMenuActionContext, extraAttrs?: Record<string, unknown>) {
  const nodeType = FLAVOUR_TO_NODE_TYPE[flavour];
  const { editor, from, to } = ctx;
  const node = editor.schema.nodes[nodeType];
  if (!node) return;
  const { state, view } = editor;
  const attrs = { blockId: null, blockProps: {}, ...extraAttrs };

  const tr = state.tr;
  tr.delete(from, to);
  const $pos = tr.doc.resolve(from);

  if ($pos.parent.type.name === "docBlockText" && $pos.depth >= 2) {
    const blockDepth = $pos.depth - 1;
    const block = $pos.node(blockDepth);
    const blockStart = $pos.before(blockDepth);
    // "Emptied" = the wrapper lost its only text to the delete and the block
    // has no nested children riding along.
    const emptied = $pos.parent.content.size === 0 && block.childCount === 1;
    const isWrappedTextFlavour = TEXT_BLOCK_FLAVOUR_SET.has(flavour) && flavour !== "code";

    if (emptied && isWrappedTextFlavour) {
      tr.setNodeMarkup(blockStart, node, {
        ...attrs,
        blockId: (block.attrs.blockId as string | null) ?? null,
      });
      // Cursor is already inside the (kept) wrapper.
      view.dispatch(tr.scrollIntoView());
      editor.commands.focus();
      return;
    }

    const created = node.createAndFill(attrs);
    if (!created) return;
    if (emptied) {
      // Different content shape (code / atoms): replace the emptied block.
      tr.replaceWith(blockStart, $pos.after(blockDepth), created);
      tr.setSelection(TextSelection.near(tr.doc.resolve(blockStart + 1), 1));
    } else {
      // Text remains on the line: the new block goes BELOW it, as a sibling.
      const after = $pos.after(blockDepth);
      tr.insert(after, created);
      tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1), 1));
    }
    view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
    return;
  }

  // Unexpected context (e.g. slash range inside a flat code block — the
  // trigger can't open there today, but stay safe): plain delete + append
  // after the parent block.
  const created = node.createAndFill(attrs);
  if (!created) return;
  const after = $pos.after(Math.max($pos.depth, 1));
  tr.insert(after, created);
  tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1), 1));
  view.dispatch(tr.scrollIntoView());
  editor.commands.focus();
}

/**
 * Fixed v1 command set (TG8.2.1) — Basic / Blocks / Semantic groups, sorted
 * via the vendored group-index model. Icons/descriptions follow AFFiNE's
 * slash-menu metadata; "Other Headings" is a `subMenu` item holding the
 * lower heading levels (4-6), mirroring upstream.
 */
function buildV1Commands(): SlashCommandItem[] {
  const action = (
    group: `${number}_${string}@${number}`,
    name: string,
    icon: LucideIcon,
    description: string,
    flavour: DocBlockFlavour,
    extraAttrs?: Record<string, unknown>,
    searchAlias?: string[],
  ): SlashCommandActionItem => ({
    name,
    group,
    icon,
    description,
    searchAlias,
    action: (ctx) => insertFlavourBlock(flavour, ctx, extraAttrs),
  });

  const HEADING_ICONS: Record<number, LucideIcon> = {
    4: Heading4,
    5: Heading5,
    6: Heading6,
  };
  const otherHeading = (level: 4 | 5 | 6): SlashCommandActionItem => ({
    name: `Heading ${level}`,
    icon: HEADING_ICONS[level],
    description: `Headings in the ${level}th font size.`,
    searchAlias: [`h${level}`],
    action: (ctx) => insertFlavourBlock("heading", ctx, { level }),
  });

  return [
    action("0_Basic@0", "Text", Type, "Start typing with plain text.", "paragraph"),
    action("0_Basic@1", "Heading 1", Heading1, "Headings in the largest font.", "heading", { level: 1 }, ["h1", "title"]),
    action("0_Basic@2", "Heading 2", Heading2, "Headings in the 2nd font size.", "heading", { level: 2 }, ["h2", "subtitle"]),
    action("0_Basic@3", "Heading 3", Heading3, "Headings in the 3rd font size.", "heading", { level: 3 }, ["h3"]),
    {
      name: "Other Headings",
      group: "0_Basic@4",
      icon: Heading,
      subMenu: [otherHeading(4), otherHeading(5), otherHeading(6)],
    },
    action("0_Basic@5", "Bullet list", List, "Create a simple bulleted list.", "list-item", { ordered: false }, ["ul", "unordered"]),
    action("0_Basic@6", "Numbered list", ListOrdered, "Create a list with numbering.", "list-item", { ordered: true }, ["ol", "ordered"]),
    action("0_Basic@7", "Code Block", Code, "Code snippet with formatting.", "code", undefined, ["```", "codeblock", "code"]),
    action("0_Basic@8", "Quote", TextQuote, "Add a blockquote for emphasis.", "quote", undefined, [">", "blockquote"]),
    action("0_Basic@9", "Divider", Minus, "Visually divide blocks.", "divider", undefined, ["hr", "separator", "---"]),
    action("1_Blocks@0", "Callout", Megaphone, "Emphasize a block of text.", "callout", undefined, ["note", "info", "tip"]),
    action("1_Blocks@1", "Canvas", Frame, "Embed an editable canvas.", "canvas", undefined, ["diagram", "drawing"]),
    action("1_Blocks@2", "Image", ImageIcon, "Insert an image.", "image", undefined, ["picture", "photo"]),
    action("1_Blocks@3", "Attachment", Paperclip, "Attach a file.", "attachment", undefined, ["file", "upload"]),
    action("2_Semantic@0", "Decision", Scale, "Record a decision.", "decision"),
    action("2_Semantic@1", "Constraint", Lock, "Record a constraint.", "constraint"),
    action("2_Semantic@2", "Requirement", ClipboardCheck, "Record a requirement.", "requirement"),
    action("2_Semantic@3", "Observation", Eye, "Record an observation.", "observation"),
  ];
}

const V1_COMMANDS = buildV1Commands();

export type SlashMenuState = {
  open: boolean;
  from: number;
  to: number;
  query: string;
  /** Index into the VISIBLE top-level rows (see `visibleItems`). */
  selectedIndex: number;
  /**
   * Top-level visible-row index whose submenu popover is open, or `null`.
   * Only ever a row for which `isSubMenuCommand` holds — a stale index (the
   * row disappeared, e.g. the query changed) is treated as closed.
   */
  subMenuOpenIndex: number | null;
  /** Index into the open submenu's rows; meaningless while no submenu is open. */
  subSelectedIndex: number;
  items: SlashCommandItem[];
};

const CLOSED_STATE: SlashMenuState = {
  open: false,
  from: 0,
  to: 0,
  query: "",
  selectedIndex: 0,
  subMenuOpenIndex: null,
  subSelectedIndex: 0,
  items: [],
};

export const slashMenuPluginKey = new PluginKey<SlashMenuState>("docSlashMenu");

/** Transaction meta shape the plugin/popup use to force-close or patch (e.g. arrow-key navigation) the menu state out-of-band from doc changes. */
type SlashMenuMeta = Partial<SlashMenuState> & { forceClose?: boolean };

/**
 * Derives the exact top-level row list `SlashMenuPopover` renders (build
 * applies `when` predicates + group sort BEFORE filtering) so keyboard
 * navigation and the visible popover can never diverge. While searching
 * (non-empty query) `filterSlashMenuItems` flattens submenu contents into
 * the result, so the rows are effectively flat action items.
 */
function visibleItems(state: SlashMenuState, editor: Editor): SlashCommandItem[] {
  return filterSlashMenuItems(
    buildSlashMenuItems<SlashMenuActionContext>(state.items, {
      editor,
      from: state.from,
      to: state.to,
    }),
    state.query,
  ) as SlashCommandItem[];
}

/** The currently-open submenu row, or `null` (also when the tracked index went stale). */
function openSubMenuOf(state: SlashMenuState, visible: SlashCommandItem[]): SlashCommandSubMenuItem | null {
  if (state.subMenuOpenIndex === null) return null;
  const row = visible[state.subMenuOpenIndex];
  return row && isSubMenuCommand(row) ? row : null;
}

/**
 * TipTap extension: watches the doc for a `/` typed at the start of an
 * (otherwise-empty-so-far) inline run and tracks the live `/query` range as
 * plugin state — `SlashMenuPopover` (below) reads that state via
 * `slashMenuPluginKey.getState(editor.state)` and renders the floating list.
 *
 * Keyboard model (AFFiNE parity):
 * - ArrowDown/ArrowUp (and Tab/Shift+Tab) move through the visible rows of
 *   the ACTIVE menu — the top-level list, or the open submenu's rows while
 *   `subMenuOpenIndex` points at a live submenu row — wrapping circularly.
 * - ArrowRight (or Enter) on a submenu row opens it with its first row
 *   selected; ArrowLeft inside a submenu closes it, selection returning to
 *   the parent row. ArrowLeft at the top level is NOT handled (returns
 *   false) so the caret can still move.
 * - Enter on an action row runs it and force-closes; Escape force-closes.
 * - No matching rows ("no_result"): nothing is handled — keys pass through
 *   to the editor — and any key but Backspace closes the menu (upstream
 *   parity).
 */
/**
 * The menu's keyboard model, shared by two entry points:
 *
 * 1. `addKeyboardShortcuts` bindings (below) — TipTap hoists every
 *    extension's keymap plugin AHEAD of all `addProseMirrorPlugins` plugins
 *    (including its own core Enter→splitBlock keymap), so the ONLY way the
 *    menu reliably sees Enter/Tab/arrows before something else consumes them
 *    is to be a keymap itself. SlashMenu must be registered before other
 *    keymap-bearing extensions (DocKeymap) in the editor's extension array.
 * 2. The plugin's `handleKeyDown` prop — kept as the catch-all for keys a
 *    keymap can't enumerate (the "no_result" any-key close behavior) and as
 *    a fallback for hosts with unusual extension ordering.
 *
 * Returns false whenever the menu is closed or the key isn't the menu's to
 * handle, so editor defaults still run.
 */
function handleSlashMenuKeyDown(editor: Editor, view: EditorView, event: KeyboardEvent): boolean {
  const state = slashMenuPluginKey.getState(view.state);
  if (!state?.open) return false;
  const visible = visibleItems(state, editor);
  if (visible.length === 0) {
    // No matching rows: the popover renders nothing, so no key may
    // be swallowed (Enter must still split the paragraph, arrows
    // must still move the caret). Upstream parity ("no_result"
    // state): any key except Backspace also closes the menu —
    // Backspace stays open so shortening the query can re-match.
    if (event.key !== "Backspace") {
      view.dispatch(view.state.tr.setMeta(slashMenuPluginKey, { forceClose: true }));
    }
    return false;
  }
  const openSubMenu = openSubMenuOf(state, visible);
  // The ACTIVE row list arrow keys traverse: the open submenu's
  // rows, or the top-level rows when no submenu is open.
  const rows: SlashCommandItem[] = openSubMenu ? openSubMenu.subMenu : visible;
  const index = openSubMenu ? state.subSelectedIndex : state.selectedIndex;

  const patch = (meta: SlashMenuMeta) =>
    view.dispatch(view.state.tr.setMeta(slashMenuPluginKey, meta));
  const move = (delta: 1 | -1) => {
    if (rows.length === 0) return;
    const next = (index + delta + rows.length) % rows.length;
    patch(openSubMenu ? { subSelectedIndex: next } : { selectedIndex: next });
  };
  const chooseItem = (item: SlashCommandItem, itemIndex: number) => {
    if (isSubMenuCommand(item)) {
      // Enter on a submenu row opens it (nested submenus don't
      // exist in the v1 data, so this is only ever top-level).
      if (!openSubMenu) patch({ subMenuOpenIndex: itemIndex, subSelectedIndex: 0 });
      return;
    }
    item.action({ editor, from: state.from, to: state.to });
    view.dispatch(view.state.tr.setMeta(slashMenuPluginKey, { forceClose: true }));
  };

  switch (event.key) {
    case "ArrowDown": {
      move(1);
      return true;
    }
    case "ArrowUp": {
      move(-1);
      return true;
    }
    case "Tab": {
      // Upstream parity: Tab = down, Shift+Tab = up.
      event.preventDefault();
      move(event.shiftKey ? -1 : 1);
      return true;
    }
    case "ArrowRight": {
      const row = rows[index];
      if (!openSubMenu && row && isSubMenuCommand(row)) {
        patch({ subMenuOpenIndex: index, subSelectedIndex: 0 });
        return true;
      }
      // Not a submenu row — let the caret move.
      return false;
    }
    case "ArrowLeft": {
      if (openSubMenu) {
        // Close the submenu; selection stays on the parent row
        // (selectedIndex is untouched).
        patch({ subMenuOpenIndex: null, subSelectedIndex: 0 });
        return true;
      }
      // Top level — let the caret move.
      return false;
    }
    case "Enter": {
      const chosen = rows[index];
      if (chosen) {
        event.preventDefault();
        chooseItem(chosen, index);
      }
      return true;
    }
    case "Escape": {
      view.dispatch(view.state.tr.setMeta(slashMenuPluginKey, { forceClose: true }));
      return true;
    }
    default:
      return false;
  }
}

export const SlashMenu = Extension.create({
  name: "docSlashMenu",

  addKeyboardShortcuts() {
    // See handleSlashMenuKeyDown's doc comment: these bindings exist so the
    // menu's keys beat every other keymap (DocKeymap, TipTap's core
    // Enter→splitBlock). Each synthesizes a minimal event carrying only what
    // the shared handler reads (`key`, `shiftKey`).
    const bind = (key: string, shiftKey = false) => () =>
      handleSlashMenuKeyDown(
        this.editor,
        this.editor.view,
        new KeyboardEvent("keydown", { key, shiftKey }),
      );
    return {
      Enter: bind("Enter"),
      Tab: bind("Tab"),
      "Shift-Tab": bind("Tab", true),
      ArrowUp: bind("ArrowUp"),
      ArrowDown: bind("ArrowDown"),
      ArrowLeft: bind("ArrowLeft"),
      ArrowRight: bind("ArrowRight"),
      Escape: bind("Escape"),
    };
  },

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
                return {
                  open: true,
                  from,
                  to: pos,
                  query,
                  selectedIndex: 0,
                  subMenuOpenIndex: null,
                  subSelectedIndex: 0,
                  items: V1_COMMANDS,
                };
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
              const query = slashText.slice(1);
              if (query === prev.query) return { ...prev, to: pos };
              // A changed query re-filters the rows, so every index resets
              // (and any open submenu closes — its row may not survive).
              return {
                ...prev,
                to: pos,
                query,
                selectedIndex: 0,
                subMenuOpenIndex: null,
                subSelectedIndex: 0,
              };
            } catch {
              return CLOSED_STATE;
            }
          },
        },
        props: {
          handleKeyDown(view, event) {
            // Catch-all path — see handleSlashMenuKeyDown's doc comment for
            // why the primary path is the addKeyboardShortcuts bindings.
            return handleSlashMenuKeyDown(editor, view, event);
          },
        },
      }),
    ];
  },
});

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

/** Zero rect fallback: happy-dom (tests) can't compute PM caret coords. */
const ZERO_RECT = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  bottom: 0,
  right: 0,
  width: 0,
  height: 0,
};

/**
 * AFFiNE-style popover container + row chrome, shared by the top-level menu
 * and submenus: 280px wide, max 390px tall (scrolling), 8px/4px padding on
 * the overlay-panel background.
 */
const PANEL_CLASS =
  "max-h-[390px] w-[280px] overflow-y-auto rounded-lg border bg-popover py-2 pl-2 pr-1 text-popover-foreground shadow-lg";

/**
 * One 44px menu row: 28px bordered icon box, name + single-line truncated
 * description column, and (for submenu rows) a trailing chevron. Hover and
 * keyboard selection share the same `bg-muted` state — mousemove routes
 * hover through the same selection state the keyboard uses, so they can't
 * disagree.
 */
function SlashMenuRow({
  item,
  selected,
  rowRef,
  onMouseDown,
  onMouseMove,
}: {
  item: SlashCommandItem;
  selected: boolean;
  rowRef?: Ref<HTMLButtonElement>;
  onMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onMouseMove: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      ref={rowRef}
      type="button"
      data-doc-slash-menu-row={item.name}
      data-selected={selected}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      className="flex h-11 w-full cursor-pointer items-center justify-start gap-2.5 rounded-md px-2 py-[2px] text-left hover:bg-muted data-[selected=true]:bg-muted"
    >
      <span
        data-doc-slash-menu-icon="true"
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded border bg-popover"
      >
        {Icon ? <Icon className="h-[18px] w-[18px]" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start overflow-hidden">
        <span className="text-sm text-foreground">{item.name}</span>
        {item.description ? (
          <span className="w-full truncate text-xs text-muted-foreground">{item.description}</span>
        ) : null}
      </span>
      {isSubMenuCommand(item) ? (
        <ChevronRight aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
      ) : null}
    </button>
  );
}

/**
 * Submenu panel, floating to the right of its parent row (right-start,
 * 12px offset, flipping to the other right/left corners when cramped),
 * stacked above the parent panel.
 */
function SlashSubMenuPopover({
  anchor,
  items,
  selectedIndex,
  onSelect,
  onChoose,
}: {
  anchor: HTMLElement;
  items: SlashCommandItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onChoose: (item: SlashCommandItem) => void;
}) {
  const { refs, floatingStyles } = useFloating({
    open: true,
    placement: "right-start",
    whileElementsMounted: autoUpdate,
    middleware: [
      offsetMiddleware(12),
      flip({ fallbackPlacements: ["right-end", "left-start", "left-end"] }),
      shift({ padding: 8 }),
    ],
  });

  useEffect(() => {
    refs.setReference(anchor);
  }, [refs, anchor]);

  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = panelRef.current?.querySelector('[data-selected="true"]');
    el?.scrollIntoView?.({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <div
      ref={(el) => {
        panelRef.current = el;
        refs.setFloating(el);
      }}
      style={floatingStyles}
      data-doc-slash-submenu="true"
      // Keep the editor focused, matching the row-level handlers.
      onMouseDown={(event) => event.preventDefault()}
      className={`z-[60] ${PANEL_CLASS}`}
    >
      {items.map((item, index) => (
        <SlashMenuRow
          key={`${item.name}-${index}`}
          item={item}
          selected={index === selectedIndex}
          onMouseMove={() => {
            if (index !== selectedIndex) onSelect(index);
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            onChoose(item);
          }}
        />
      ))}
    </div>
  );
}

/**
 * Floating popup for the slash menu — reads `SlashMenu`'s plugin state each
 * render, positions itself at the `/` trigger position via `posToDOMRect` +
 * floating-ui, and renders the fuzzy-filtered, grouped command list in
 * AFFiNE's visual style (group headers hidden while searching; submenu rows
 * open a second panel to the right). Mounted unconditionally by DocEditor;
 * renders nothing when closed.
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
      getBoundingClientRect: () => {
        try {
          return posToDOMRect(editor.view, state.from, state.to);
        } catch {
          return ZERO_RECT;
        }
      },
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
  // Parent-row elements, indexed like the visible rows — the open submenu's
  // floating panel anchors to its parent row's element.
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keep the keyboard-selected top-level row scrolled into view.
  useEffect(() => {
    if (!state.open || state.subMenuOpenIndex !== null) return;
    const el = listRef.current?.querySelector('[data-selected="true"]');
    el?.scrollIntoView?.({ block: "nearest" });
  }, [state.open, state.selectedIndex, state.query, state.subMenuOpenIndex]);

  if (!state.open) return null;

  const searching = state.query.length > 0;
  const visible = visibleItems(state, editor);
  if (visible.length === 0) return null;
  const openSubMenu = openSubMenuOf(state, visible);
  const subMenuAnchor =
    openSubMenu && state.subMenuOpenIndex !== null
      ? (rowRefs.current[state.subMenuOpenIndex] ?? null)
      : null;

  const dispatchMeta = (meta: SlashMenuMeta) =>
    editor.view.dispatch(editor.view.state.tr.setMeta(slashMenuPluginKey, meta));

  const choose = (item: SlashCommandItem) => {
    if (isSubMenuCommand(item)) return;
    item.action({ editor, from: state.from, to: state.to });
    dispatchMeta({ forceClose: true });
  };

  let lastGroup = "";

  return (
    <>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        data-doc-slash-menu="true"
        // preventDefault so clicks on padding/headers never blur the editor.
        onMouseDown={(event) => event.preventDefault()}
        className={`z-50 ${PANEL_CLASS}`}
      >
        <div ref={listRef}>
          {visible.map((item, index) => {
            // Group headers are hidden entirely while searching (upstream
            // `searching` behavior) — the filtered rows render flat.
            const group = searching ? "" : groupNameOf(item);
            const showHeader = !searching && group !== lastGroup && group !== "";
            lastGroup = group;
            const isSub = isSubMenuCommand(item);
            return (
              <div key={`${item.name}-${index}`}>
                {showHeader && (
                  <div
                    data-doc-slash-menu-group={group}
                    className="px-2 py-[2px] text-xs font-medium text-muted-foreground"
                  >
                    {group}
                  </div>
                )}
                <SlashMenuRow
                  item={item}
                  selected={index === state.selectedIndex}
                  rowRef={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  onMouseMove={() => {
                    // Hovering a submenu row opens it; hovering any other
                    // row closes whatever submenu was open.
                    const wantSubMenu = isSub ? index : null;
                    if (state.selectedIndex === index && state.subMenuOpenIndex === wantSubMenu) {
                      return;
                    }
                    dispatchMeta({
                      selectedIndex: index,
                      subMenuOpenIndex: wantSubMenu,
                      subSelectedIndex: 0,
                    });
                  }}
                  onMouseDown={(event) => {
                    // preventDefault keeps the editor focused so the
                    // command's insert lands at the tracked range.
                    event.preventDefault();
                    if (isSub) {
                      dispatchMeta({
                        selectedIndex: index,
                        subMenuOpenIndex: index,
                        subSelectedIndex: 0,
                      });
                    } else {
                      choose(item);
                    }
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      {openSubMenu && subMenuAnchor && (
        <SlashSubMenuPopover
          anchor={subMenuAnchor}
          items={openSubMenu.subMenu}
          selectedIndex={state.subSelectedIndex}
          onSelect={(index) => dispatchMeta({ subSelectedIndex: index })}
          onChoose={choose}
        />
      )}
    </>
  );
}
