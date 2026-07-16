"use client";

import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";

/**
 * Editor MARK overrides owned by the rich-text component (kept separate
 * from editor-nodes.ts, whose exports must be exactly the block NODES —
 * see editor-nodes-sync.test.ts).
 *
 * Italic/strike stay in the schema (existing docs carry the marks; the
 * Cmd-I / Cmd-Shift-S shortcuts and paste conversion still work) but their
 * markdown TYPING shortcuts are stripped — bold + inline code are the only
 * auto-converting marks (Ford, dogfood review 2026-07-16). StarterKit's
 * stock Italic/Strike would re-add the input rules, so DocEditor disables
 * those and registers these instead.
 */
export const DocItalic = Italic.extend({ addInputRules: () => [] });
export const DocStrike = Strike.extend({ addInputRules: () => [] });
