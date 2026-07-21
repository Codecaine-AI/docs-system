"use client";

import { Extension, posToDOMRect, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import {
  autoUpdate,
  flip,
  offset as offsetMiddleware,
  shift,
  useFloating,
  type ReferenceType,
} from "@floating-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { handleVideoUrlPaste } from "../input/video-embed";

/**
 * Minimal Notion-style link authoring (Cmd/Ctrl+K + paste-URL-over-selection)
 * for the block editor. The `link` mark itself already round-trips end-to-end
 * (schema via StarterKit, convert.ts's DeltaSpan `attributes.link` <-> mark
 * bridge, read-surface rendering in DocBlockRenderer) — what was missing was
 * any way to AUTHOR one. `autolink` and `openOnClick` stay deliberately off
 * (see DocEditor's StarterKit config): typing behavior must not change, and
 * clicking a link in edit mode places the cursor instead of navigating.
 *
 * Two affordances, both Notion-modeled:
 *
 * 1. Mod-K with a non-empty text selection opens a small floating popover
 *    anchored at the selection (same plugin-state + `LinkEditorPopover`
 *    pattern as SlashMenu/ReferenceMention): one URL input, prefilled when
 *    the selection already carries a link. Enter applies the mark to the
 *    tracked range (an empty input removes it), the "Remove" button (shown
 *    only when a link exists) removes it, Escape closes without changes and
 *    returns focus to the editor, clicking outside closes. With no/empty
 *    selection Mod-K is not handled (returns false) — the popover never
 *    opens on nothing, matching Notion.
 *
 * 2. Pasting a single plausible http(s) URL over a non-empty single-block
 *    text selection wraps the selection in a link instead of replacing the
 *    text (Notion's paste-link-on-selection). The same URL at a COLLAPSED
 *    cursor inserts as plain unlinked text (handled here too — see the
 *    handlePaste comment on TipTap's unconditional link paste rule) — UNLESS
 *    it is a known video-provider URL, which becomes a docVideo block via
 *    input/video-embed.ts's handleVideoUrlPaste (checked first in the
 *    collapsed branch). Any other clipboard content — multiple lines, prose
 *    containing a URL, non-http schemes — falls through to the default paste.
 */

export type LinkEditorState = {
  open: boolean;
  /** Selection range the link will be applied to (mapped through doc edits while open). */
  from: number;
  to: number;
  /** href the selection already carried when opened ("" when none) — prefills the input and gates the Remove button. */
  href: string;
};

const CLOSED_LINK_STATE: LinkEditorState = { open: false, from: 0, to: 0, href: "" };

export const linkEditorPluginKey = new PluginKey<LinkEditorState>("docLinkEditor");

/** Transaction meta shape: open with a fresh range, or force-close. */
type LinkEditorMeta = Partial<LinkEditorState> & { forceClose?: boolean };

/** First link href carried by any text node in the range, or "". */
function hrefInRange(state: EditorState, from: number, to: number): string {
  let href = "";
  state.doc.nodesBetween(from, to, (node) => {
    if (href) return false;
    const mark = node.marks.find((m) => m.type.name === "link");
    if (mark) href = String(mark.attrs.href ?? "");
    return !href;
  });
  return href;
}

/**
 * A "single plausible URL": exactly one http(s) URL and nothing else — no
 * internal whitespace (so prose that merely CONTAINS a URL never matches)
 * and parseable by `new URL`. Deliberately scheme-restricted: `javascript:`
 * and friends must never become an href via paste.
 */
export function isPlausibleUrl(text: string): boolean {
  if (!/^https?:\/\/\S+$/i.test(text)) return false;
  try {
    new URL(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the link popover for the current selection. Returns false (key not
 * handled, popover not opened) unless the selection is a non-empty text
 * selection whose blocks can carry a link mark at all.
 */
export function openLinkEditor(editor: Editor): boolean {
  const { state, view } = editor;
  const { selection } = state;
  if (selection.empty || !(selection instanceof TextSelection)) return false;
  const linkType = state.schema.marks.link;
  if (!linkType) return false;
  // A selection wholly inside a mark-less block (docCodeBlock's `marks: ""`)
  // has nothing a link could attach to — treat like no selection.
  if (!selection.$from.parent.type.allowsMarkType(linkType)) return false;
  const { from, to } = selection;
  view.dispatch(
    state.tr.setMeta(linkEditorPluginKey, {
      open: true,
      from,
      to,
      href: hrefInRange(state, from, to),
    } satisfies LinkEditorMeta),
  );
  return true;
}

/**
 * Applies `href` as a link mark over the tracked range (replacing any
 * existing link there), or removes the link when `href` is empty — then
 * closes the popover and returns the cursor to the end of the range,
 * Notion-style. Exported for the popover and tests.
 */
export function applyLinkAtRange(editor: Editor, from: number, to: number, rawHref: string): void {
  const href = rawHref.trim();
  const { state, view } = editor;
  const linkType = state.schema.marks.link;
  if (!linkType) return;
  const tr = state.tr;
  if (href) tr.addMark(from, to, linkType.create({ href }));
  else tr.removeMark(from, to, linkType);
  tr.setMeta(linkEditorPluginKey, { forceClose: true } satisfies LinkEditorMeta);
  view.dispatch(tr.scrollIntoView());
  editor.chain().focus().setTextSelection(to).run();
}

export const LinkEditor = Extension.create({
  name: "docLinkEditor",

  addKeyboardShortcuts() {
    return {
      "Mod-k": () => openLinkEditor(this.editor),
      // Escape closes the popover even while the EDITOR holds focus (the
      // input's own onKeyDown covers the focused-input case) — same split as
      // ReferenceMention's Escape binding.
      Escape: () => {
        const state = linkEditorPluginKey.getState(this.editor.state);
        if (!state?.open) return false;
        this.editor.view.dispatch(
          this.editor.view.state.tr.setMeta(linkEditorPluginKey, {
            forceClose: true,
          } satisfies LinkEditorMeta),
        );
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<LinkEditorState>({
        key: linkEditorPluginKey,
        state: {
          init: () => CLOSED_LINK_STATE,
          apply(tr, prev) {
            const meta = tr.getMeta(linkEditorPluginKey) as LinkEditorMeta | undefined;
            if (meta?.forceClose) return CLOSED_LINK_STATE;
            if (meta?.open) return { ...CLOSED_LINK_STATE, ...meta, open: true };
            if (!prev.open) return prev;
            if (meta) return { ...prev, ...meta };
            if (!tr.docChanged) return prev;
            // The doc changed under the open popover (e.g. a host-driven
            // transaction): keep the anchored range pointing at the same
            // text. If the mapping collapsed it, the context is gone — close
            // rather than link an empty range.
            const from = tr.mapping.map(prev.from, 1);
            const to = tr.mapping.map(prev.to, -1);
            if (from >= to) return CLOSED_LINK_STATE;
            return { ...prev, from, to };
          },
        },
        props: {
          // Paste-URL-over-selection (Notion): only when the clipboard is a
          // single plausible http(s) URL AND the selection is a non-empty
          // text range within ONE textblock that allows link marks. Every
          // other case returns false → default paste.
          handlePaste(view, event) {
            const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
            if (!isPlausibleUrl(text)) return false;
            const { state } = view;
            const { selection } = state;
            if (!(selection instanceof TextSelection)) return false;
            if (selection.empty) {
              // A known VIDEO-provider URL at a collapsed cursor becomes a
              // docVideo block instead (Notion's paste-an-embed) — checked
              // FIRST, from inside this handler, because this plugin is the
              // one already positioned ahead of TipTap Link's paste rule (see
              // below); a separate plugin couldn't reliably beat this
              // plain-text branch. handleVideoUrlPaste declines (returns
              // false) when the schema has no docVideo node or the cursor
              // isn't in a wrapped text block — those fall through to plain
              // text, as does every non-provider URL.
              if (handleVideoUrlPaste(view, text)) return true;
              // A URL at a collapsed cursor inserts as PLAIN text. This must
              // be handled here (not left to the default): TipTap Link's
              // `addPasteRules` linkifies pasted URLs UNCONDITIONALLY —
              // `linkOnPaste: false` only gates its over-selection handler —
              // and this plugin is the only one positioned ahead of it.
              view.dispatch(state.tr.insertText(text).scrollIntoView());
              return true;
            }
            const { $from, $to, from, to } = selection;
            if (!$from.sameParent($to) || !$from.parent.isTextblock) return false;
            const linkType = state.schema.marks.link;
            if (!linkType || !$from.parent.type.allowsMarkType(linkType)) return false;
            view.dispatch(
              state.tr.addMark(from, to, linkType.create({ href: text })).scrollIntoView(),
            );
            return true;
          },
        },
      }),
    ];
  },
});

/** Zero rect fallback: happy-dom (tests) can't compute PM caret coords (same convention as SlashMenu). */
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
 * Floating link popover — reads `LinkEditor`'s plugin state each render,
 * anchors at the tracked selection range via `posToDOMRect` + floating-ui
 * (bottom-start, flip/shift like the other menus), and renders a single URL
 * input plus a Remove button when the selection already carries a link.
 * Mounted unconditionally by DocEditor; renders nothing when closed.
 *
 * Unlike SlashMenu (which keeps the editor focused and swallows keys), this
 * popover moves focus INTO its input on open — typing a URL must not land in
 * the doc. Enter/Escape are handled on the input; a capture-phase document
 * mousedown listener closes on any outside click.
 */
export function LinkEditorPopover({ editor }: { editor: Editor }) {
  const [state, setState] = useState<LinkEditorState>(CLOSED_LINK_STATE);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const update = () => {
      setState(linkEditorPluginKey.getState(editor.state) ?? CLOSED_LINK_STATE);
    };
    editor.on("transaction", update);
    update();
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);

  // On each OPEN transition: seed the input from the selection's existing
  // href and move focus into it (select-all so typing replaces a prefill).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (state.open && !wasOpenRef.current) {
      setValue(state.href);
      // Synchronous focus (NOT requestAnimationFrame — rAF stalls in
      // backgrounded tabs and the input would never take focus, sending the
      // user's URL keystrokes into the doc). preventScroll because floating-ui
      // hasn't positioned the panel yet at effect time.
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    }
    wasOpenRef.current = state.open;
  }, [state.open, state.href]);

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

  // Click outside closes without changes (capture phase so it beats React
  // handlers and PM's own mousedown handling).
  useEffect(() => {
    if (!state.open) return;
    const onMouseDown = (event: MouseEvent) => {
      const panel = panelRef.current;
      if (panel && event.target instanceof Node && panel.contains(event.target)) return;
      editor.view.dispatch(
        editor.view.state.tr.setMeta(linkEditorPluginKey, {
          forceClose: true,
        } satisfies LinkEditorMeta),
      );
    };
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [state.open, editor]);

  if (!state.open) return null;

  const closeWithoutChanges = () => {
    editor.view.dispatch(
      editor.view.state.tr.setMeta(linkEditorPluginKey, {
        forceClose: true,
      } satisfies LinkEditorMeta),
    );
    // Escape hands focus (and the original selection) back to the editor.
    editor.chain().focus().setTextSelection({ from: state.from, to: state.to }).run();
  };

  return (
    <div
      ref={(el) => {
        panelRef.current = el;
        refs.setFloating(el);
      }}
      style={floatingStyles}
      data-doc-link-editor="true"
      className="z-50 flex w-80 items-center gap-1 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
    >
      <input
        ref={inputRef}
        type="text"
        data-doc-link-input="true"
        value={value}
        placeholder="Paste or type a link…"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            applyLinkAtRange(editor, state.from, state.to, value);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeWithoutChanges();
          }
        }}
        className="h-7 min-w-0 flex-1 rounded-sm bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      {state.href !== "" && (
        <button
          type="button"
          data-doc-link-remove="true"
          // mousedown (not click) + preventDefault: acts before the input
          // blurs, mirroring the menus' keep-focus idiom.
          onMouseDown={(event) => {
            event.preventDefault();
            applyLinkAtRange(editor, state.from, state.to, "");
          }}
          className="shrink-0 rounded-sm border px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Remove
        </button>
      )}
    </div>
  );
}
