import { afterEach, describe, expect, it } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/core";
import { ATOM_BLOCK_NODES, TEXT_BLOCK_NODES } from "../core/schema";
import { SlashMenu, SlashMenuPopover, slashMenuPluginKey, type SlashMenuState } from "../menus/SlashMenu";

/**
 * AFFiNE-style slash menu (SlashMenu.tsx): popover UI (icon box + name +
 * description rows, normal-case group headers hidden while searching,
 * "Other Headings" submenu panel) and the plugin's keyboard model (circular
 * arrow navigation, Tab/Shift+Tab, ArrowRight/ArrowLeft submenu open/close,
 * Enter running exactly the selected row's action).
 *
 * The editor is a REAL TipTap `Editor` over the real schema nodes (same
 * approach as input-rules.test.ts / DocEditor.test.tsx — happy-dom has no
 * native contenteditable typing simulation, so edits go through
 * `editor.commands` and keys go straight to the slash plugin's
 * `handleKeyDown` prop, which is the exact seam the real view dispatches
 * into).
 *
 * floating-ui's `computePosition` resolves its position through a promise,
 * so every interaction that (re)positions a panel schedules a React state
 * update on the microtask queue AFTER the synchronous `act` block exits —
 * the async helpers below (`flushFloating`, awaited `openMenu`/`sendKey`/
 * `fire`) absorb those updates inside `act` so they can't fire "not wrapped
 * in act" warnings between assertions.
 */

const editors: Editor[] = [];
const hosts: HTMLElement[] = [];

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
  for (const host of hosts.splice(0)) host.remove();
});

function createEditor(): Editor {
  const host = document.createElement("div");
  document.body.appendChild(host);
  hosts.push(host);
  const editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        hardBreak: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        paragraph: false,
        trailingNode: false,
        undoRedo: false,
      }),
      ...TEXT_BLOCK_NODES,
      ...ATOM_BLOCK_NODES,
      SlashMenu,
    ],
    content: {
      type: "doc",
      content: [{ type: "docParagraph", content: [{ type: "docBlockText" }] }],
    },
    injectCSS: false,
  });
  editors.push(editor);
  editor.commands.focus();
  return editor;
}

function menuState(editor: Editor): SlashMenuState {
  const state = slashMenuPluginKey.getState(editor.state);
  if (!state) throw new Error("slash menu plugin state missing");
  return state as SlashMenuState;
}

/** Flushes floating-ui's promise-scheduled position updates inside `act`. */
async function flushFloating() {
  await act(async () => {});
}

/** Runs a DOM event (or any sync interaction) inside `act`, then flushes. */
async function fire(interaction: () => void) {
  act(interaction);
  await flushFloating();
}

/** Types `/query` into the (empty) first paragraph, opening the menu. */
async function openMenu(editor: Editor, query = "") {
  act(() => {
    editor.commands.setTextSelection(2);
    editor.commands.insertContent(`/${query}`);
  });
  expect(menuState(editor).open).toBe(true);
  await flushFloating();
}

/**
 * Feeds a keydown directly to the slash plugin's `handleKeyDown` prop —
 * deterministic (no dependence on happy-dom event plumbing or on the
 * relative order of other keymap plugins) while still exercising the exact
 * handler the real EditorView dispatches into. Returns the handler's
 * handled/not-handled boolean.
 */
async function sendKey(editor: Editor, key: string, init: KeyboardEventInit = {}): Promise<boolean> {
  const plugin = slashMenuPluginKey.get(editor.state);
  const handler = plugin?.props.handleKeyDown;
  if (!plugin || !handler) throw new Error("slash menu plugin not found");
  const event = new KeyboardEvent("keydown", { key, cancelable: true, ...init });
  let handled = false;
  act(() => {
    handled = Boolean(handler.call(plugin, editor.view, event));
  });
  await flushFloating();
  return handled;
}

function root(): HTMLElement | null {
  return document.querySelector('[data-doc-slash-menu="true"]');
}

function subMenuPanel(): HTMLElement | null {
  return document.querySelector('[data-doc-slash-submenu="true"]');
}

function rowByName(name: string, container: ParentNode = document): HTMLElement | null {
  return container.querySelector(`[data-doc-slash-menu-row="${name}"]`);
}

function selectedRow(container: ParentNode): HTMLElement | null {
  return container.querySelector('[data-doc-slash-menu-row][data-selected="true"]');
}

function findNode(json: JSONContent, type: string): JSONContent | null {
  if (json.type === type) return json;
  for (const child of json.content ?? []) {
    const found = findNode(child, type);
    if (found) return found;
  }
  return null;
}

describe("SlashMenuPopover rendering", () => {
  it("renders rows with an icon box, name, and description", async () => {
    const editor = createEditor();
    render(<SlashMenuPopover editor={editor} />);
    await openMenu(editor);

    const menu = root();
    expect(menu).toBeTruthy();

    const textRow = rowByName("Text", menu!);
    expect(textRow).toBeTruthy();
    // Icon box: bordered 28px square containing the lucide svg.
    const iconBox = textRow!.querySelector('[data-doc-slash-menu-icon="true"]');
    expect(iconBox).toBeTruthy();
    expect(iconBox!.querySelector("svg")).toBeTruthy();
    // Name + description column.
    expect(textRow!.textContent).toContain("Text");
    expect(textRow!.textContent).toContain("Start typing with plain text.");

    // The v1 rename: "Code Block", not "Code".
    expect(rowByName("Code Block", menu!)).toBeTruthy();
    expect(rowByName("Code", menu!)).toBeFalsy();
    expect(rowByName("Code Block", menu!)!.textContent).toContain("Code snippet with formatting.");

    // Submenu row renders a trailing chevron; plain rows don't.
    const otherHeadings = rowByName("Other Headings", menu!);
    expect(otherHeadings).toBeTruthy();
    expect(otherHeadings!.querySelector(".lucide-chevron-right")).toBeTruthy();
    expect(textRow!.querySelector(".lucide-chevron-right")).toBeFalsy();
  });

  it("shows normal-case group headers when idle and hides them while searching", async () => {
    const editor = createEditor();
    render(<SlashMenuPopover editor={editor} />);
    await openMenu(editor);

    const headers = Array.from(document.querySelectorAll("[data-doc-slash-menu-group]"));
    expect(headers.map((h) => h.textContent)).toEqual(["Basic", "Blocks"]);
    for (const header of headers) {
      // Normal case — the old UI uppercased headers via a class.
      expect(header.className).not.toContain("uppercase");
    }

    // Searching: headers disappear and submenu contents flatten into the
    // rows (Heading 4-6 surface without submenu chrome).
    await fire(() => {
      editor.commands.insertContent("head");
    });
    expect(menuState(editor).query).toBe("head");
    expect(document.querySelector("[data-doc-slash-menu-group]")).toBeFalsy();
    const menu = root()!;
    expect(rowByName("Heading 1", menu)).toBeTruthy();
    const h4 = rowByName("Heading 4", menu);
    expect(h4).toBeTruthy();
    expect(h4!.querySelector(".lucide-chevron-right")).toBeFalsy();
    expect(subMenuPanel()).toBeFalsy();
  });

  it("query matches the Code Block searchAlias set", async () => {
    const editor = createEditor();
    render(<SlashMenuPopover editor={editor} />);
    await openMenu(editor, "codeblock");

    expect(rowByName("Code Block", root()!)).toBeTruthy();
  });
});

describe("keyboard model", () => {
  it("ArrowDown/ArrowUp move with circular wrap and keep DOM selection in sync", async () => {
    const editor = createEditor();
    render(<SlashMenuPopover editor={editor} />);
    await openMenu(editor);

    const rowCount = document.querySelectorAll("[data-doc-slash-menu-row]").length;
    expect(rowCount).toBeGreaterThan(2);
    expect(menuState(editor).selectedIndex).toBe(0);

    // Up from the first row wraps to the last…
    expect(await sendKey(editor, "ArrowUp")).toBe(true);
    expect(menuState(editor).selectedIndex).toBe(rowCount - 1);
    expect(selectedRow(root()!)?.dataset.docSlashMenuRow).toBe("Image");

    // …and down from the last wraps back to the first.
    expect(await sendKey(editor, "ArrowDown")).toBe(true);
    expect(menuState(editor).selectedIndex).toBe(0);
    expect(selectedRow(root()!)?.dataset.docSlashMenuRow).toBe("Text");
  });

  it("Tab moves down and Shift+Tab moves up (upstream parity)", async () => {
    const editor = createEditor();
    render(<SlashMenuPopover editor={editor} />);
    await openMenu(editor);

    expect(await sendKey(editor, "Tab")).toBe(true);
    expect(menuState(editor).selectedIndex).toBe(1);
    expect(await sendKey(editor, "Tab", { shiftKey: true })).toBe(true);
    expect(menuState(editor).selectedIndex).toBe(0);
  });

  it("Enter runs exactly the keyboard-selected row's action and closes", async () => {
    const editor = createEditor();
    render(<SlashMenuPopover editor={editor} />);
    await openMenu(editor);

    await sendKey(editor, "ArrowDown");
    expect(selectedRow(root()!)?.dataset.docSlashMenuRow).toBe("Heading 1");

    expect(await sendKey(editor, "Enter")).toBe(true);
    const heading = findNode(editor.getJSON(), "docHeading");
    expect(heading).toBeTruthy();
    expect(heading!.attrs).toMatchObject({ level: 1 });
    expect(menuState(editor).open).toBe(false);
    expect(root()).toBeFalsy();
  });

  it("passes keys through when the query matches nothing, closing on non-Backspace", async () => {
    const editor = createEditor();
    render(<SlashMenuPopover editor={editor} />);
    await openMenu(editor, "zzzznope");

    // Popover hidden (no rows), state still open.
    expect(root()).toBeFalsy();
    expect(menuState(editor).open).toBe(true);

    // Backspace: not handled AND the menu stays open so a shorter query can
    // re-match.
    expect(await sendKey(editor, "Backspace")).toBe(false);
    expect(menuState(editor).open).toBe(true);

    // Enter: not handled (the editor keymap must still see it), and the
    // menu force-closes (upstream "no_result" parity).
    expect(await sendKey(editor, "Enter")).toBe(false);
    expect(menuState(editor).open).toBe(false);
    expect(findNode(editor.getJSON(), "docHeading")).toBeFalsy();
  });

  it("Escape closes the menu without inserting", async () => {
    const editor = createEditor();
    render(<SlashMenuPopover editor={editor} />);
    await openMenu(editor);

    expect(await sendKey(editor, "Escape")).toBe(true);
    expect(menuState(editor).open).toBe(false);
    expect(root()).toBeFalsy();
    expect(findNode(editor.getJSON(), "docHeading")).toBeFalsy();
  });
});

describe("Other Headings submenu", () => {
  /** ArrowDown to the "Other Headings" row (index 4 of the Basic group). */
  async function selectOtherHeadings(editor: Editor) {
    for (let i = 0; i < 4; i += 1) await sendKey(editor, "ArrowDown");
    expect(selectedRow(root()!)?.dataset.docSlashMenuRow).toBe("Other Headings");
  }

  it("opens on ArrowRight with its first row selected, and Enter inserts a level-4 heading", async () => {
    const editor = createEditor();
    render(<SlashMenuPopover editor={editor} />);
    await openMenu(editor);
    await selectOtherHeadings(editor);

    expect(await sendKey(editor, "ArrowRight")).toBe(true);
    const panel = subMenuPanel();
    expect(panel).toBeTruthy();
    expect(rowByName("Heading 4", panel!)).toBeTruthy();
    expect(rowByName("Heading 5", panel!)).toBeTruthy();
    expect(rowByName("Heading 6", panel!)).toBeTruthy();
    expect(selectedRow(panel!)?.dataset.docSlashMenuRow).toBe("Heading 4");
    expect(rowByName("Heading 4", panel!)!.textContent).toContain("Headings in the 4th font size.");

    expect(await sendKey(editor, "Enter")).toBe(true);
    const heading = findNode(editor.getJSON(), "docHeading");
    expect(heading).toBeTruthy();
    expect(heading!.attrs).toMatchObject({ level: 4 });
    expect(menuState(editor).open).toBe(false);
    expect(subMenuPanel()).toBeFalsy();
  });

  it("arrows navigate submenu rows with circular wrap while open", async () => {
    const editor = createEditor();
    render(<SlashMenuPopover editor={editor} />);
    await openMenu(editor);
    await selectOtherHeadings(editor);
    await sendKey(editor, "ArrowRight");

    await sendKey(editor, "ArrowDown");
    expect(selectedRow(subMenuPanel()!)?.dataset.docSlashMenuRow).toBe("Heading 5");
    await sendKey(editor, "ArrowDown");
    await sendKey(editor, "ArrowDown"); // wraps 6 -> 4
    expect(selectedRow(subMenuPanel()!)?.dataset.docSlashMenuRow).toBe("Heading 4");
    // The parent top-level selection never moved.
    expect(menuState(editor).selectedIndex).toBe(4);
  });

  it("Enter on the submenu row opens it (same as ArrowRight)", async () => {
    const editor = createEditor();
    render(<SlashMenuPopover editor={editor} />);
    await openMenu(editor);
    await selectOtherHeadings(editor);

    expect(await sendKey(editor, "Enter")).toBe(true);
    expect(subMenuPanel()).toBeTruthy();
    expect(menuState(editor).open).toBe(true);
    expect(menuState(editor).subMenuOpenIndex).toBe(4);
  });

  it("ArrowLeft closes the submenu back to the parent row; at top level it is not handled", async () => {
    const editor = createEditor();
    render(<SlashMenuPopover editor={editor} />);
    await openMenu(editor);
    await selectOtherHeadings(editor);
    await sendKey(editor, "ArrowRight");
    expect(subMenuPanel()).toBeTruthy();

    expect(await sendKey(editor, "ArrowLeft")).toBe(true);
    expect(subMenuPanel()).toBeFalsy();
    expect(menuState(editor).subMenuOpenIndex).toBeNull();
    // Selection stays on the parent "Other Headings" row.
    expect(selectedRow(root()!)?.dataset.docSlashMenuRow).toBe("Other Headings");

    // Top level: not handled, so the caret can move in the editor.
    expect(await sendKey(editor, "ArrowLeft")).toBe(false);
  });

  it("opens on hover over the submenu row and closes when hovering another row", async () => {
    const editor = createEditor();
    render(<SlashMenuPopover editor={editor} />);
    await openMenu(editor);

    await fire(() => {
      fireEvent.mouseMove(rowByName("Other Headings", root()!)!);
    });
    expect(subMenuPanel()).toBeTruthy();
    expect(menuState(editor).subMenuOpenIndex).toBe(4);

    await fire(() => {
      fireEvent.mouseMove(rowByName("Text", root()!)!);
    });
    expect(subMenuPanel()).toBeFalsy();
    expect(menuState(editor).selectedIndex).toBe(0);
    expect(menuState(editor).subMenuOpenIndex).toBeNull();
  });

  it("mousedown on a submenu child row inserts that heading", async () => {
    const editor = createEditor();
    render(<SlashMenuPopover editor={editor} />);
    await openMenu(editor);

    await fire(() => {
      fireEvent.mouseMove(rowByName("Other Headings", root()!)!);
    });
    await fire(() => {
      fireEvent.mouseDown(rowByName("Heading 5", subMenuPanel()!)!);
    });
    const heading = findNode(editor.getJSON(), "docHeading");
    expect(heading).toBeTruthy();
    expect(heading!.attrs).toMatchObject({ level: 5 });
    expect(menuState(editor).open).toBe(false);
  });
});

describe("mouse selection", () => {
  it("mousemove moves keyboard selection to the hovered row and mousedown chooses it", async () => {
    const editor = createEditor();
    render(<SlashMenuPopover editor={editor} />);
    await openMenu(editor);

    const quote = rowByName("Quote", root()!)!;
    await fire(() => {
      fireEvent.mouseMove(quote);
    });
    expect(selectedRow(root()!)?.dataset.docSlashMenuRow).toBe("Quote");

    await fire(() => {
      fireEvent.mouseDown(quote);
    });
    expect(findNode(editor.getJSON(), "docQuote")).toBeTruthy();
    expect(menuState(editor).open).toBe(false);
  });
});
