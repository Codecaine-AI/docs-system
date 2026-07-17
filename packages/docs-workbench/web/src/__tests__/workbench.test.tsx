import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { DocsClientProvider } from "@codecaine-ai/docs-viewer/client";

import { createDocsServeApp } from "../../../src/server";
import { applyDocOps, getBundle, undoPatch, ApiError } from "../data/api";
import { getSessionId } from "../data/session";
import { createStandaloneDocsClient } from "../data/client";
import { StandaloneCanvasEmbed } from "../pages/CanvasEmbed";
import { App } from "../shell/App";
import { DocPage } from "../pages/DocPage";

/**
 * Workbench integration tests: the REAL serve app (docs-server routes over a
 * temp docs tree) handles every request — `globalThis.fetch` is stubbed to
 * route the SPA's relative URLs straight into `app.handle`, so the ops
 * 409/423 paths, the comment create/resolve contract, undo single-use, and
 * the SSE fetch-stream fallback are all exercised end-to-end with no
 * network. (Mirrors the fake-DocsClient injection pattern of the
 * docs-viewer suites, but with the genuine backend behind the seam.)
 */

let docsRoot: string;
let app: ReturnType<typeof createDocsServeApp>;
let realFetch: typeof fetch;

function docJson(id: string, title: string, text: string) {
  return {
    schemaVersion: 1,
    id,
    title,
    root: "root-1",
    blocks: {
      "root-1": {
        id: "root-1",
        type: "paragraph",
        props: {},
        children: ["para-1"],
      },
      "para-1": {
        id: "para-1",
        type: "paragraph",
        props: {},
        text: [{ insert: text }],
        children: [],
      },
    },
  };
}

const BUNDLES: Array<[string, string]> = [
  ["10-guide", "Guide"],
  ["30-stale", "Stale"],
  ["40-locked", "Locked"],
  ["50-comments", "Comments"],
  ["55-hover", "Hover"],
  ["60-live", "Live"],
  ["65-autosave", "Autosave"],
  ["70-edit", "Edit"],
  ["75-flush", "Flush"],
  ["76-nav", "Nav"],
  ["80-rename", "Rename"],
  ["77-nav-target", "NavTarget"],
  ["80-undo", "Undo"],
];

/**
 * A debounce delay no test will ever wait out (the max-wait bound scales
 * with it, so it can't fire early either) — used wherever a test needs the
 * doc to STAY dirty until an explicit Cmd+S flush or unmount.
 */
const NEVER_AUTOSAVE_MS = 600_000;

/** Cmd+S — DocEditor's manual flush (the workbench has no Save button). */
function pressSaveShortcut() {
  fireEvent.keyDown(window, { key: "s", metaKey: true });
}

function saveStateAttr(): string | null {
  return (
    document.querySelector("[data-docs-save-state]")?.getAttribute("data-docs-save-state") ??
    null
  );
}

/** Raw request against the serve app (bypasses the SPA data layer). */
async function rawRequest(path: string, init?: RequestInit): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, init));
}

async function postOpsAs(
  sessionId: string,
  path: string,
  text: string,
): Promise<{ hash: string; patch_id: string }> {
  const bundle = await getBundle(path);
  const response = await rawRequest("/api/ops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path,
      ops: [{ type: "updateBlock", blockId: "para-1", text: [{ insert: text }] }],
      expected_hash: bundle.doc_hash,
      session_id: sessionId,
    }),
  });
  if (!response.ok) throw new Error(`postOpsAs failed: ${response.status}`);
  return (await response.json()) as { hash: string; patch_id: string };
}

function renderDocPage(
  path: string,
  options?: {
    onEditorReady?: (editor: Editor) => void;
    isStatic?: boolean;
    autoSaveDelayMs?: number;
    onDocMoved?: (newPath: string) => void;
  },
) {
  const ui = (currentPath: string) => (
    <DocsClientProvider client={createStandaloneDocsClient()} canvasEmbed={StandaloneCanvasEmbed}>
      <DocPage
        path={currentPath}
        onEditorReady={options?.onEditorReady}
        isStatic={options?.isStatic}
        autoSaveDelayMs={options?.autoSaveDelayMs}
        onDocMoved={options?.onDocMoved}
      />
    </DocsClientProvider>
  );
  const view = render(ui(path));
  return { ...view, rerenderPath: (nextPath: string) => view.rerender(ui(nextPath)) };
}

async function makeEditorDirty(getEditor: () => Editor | null, text: string) {
  await waitFor(() => {
    expect(getEditor()).toBeTruthy();
  });
  act(() => {
    getEditor()!.commands.insertContentAt(1, text);
  });
  await waitFor(() => {
    expect(saveStateAttr()).toBe("dirty");
  });
}

beforeAll(async () => {
  docsRoot = await mkdtemp(join(tmpdir(), "docs-workbench-test-"));
  for (const [path, title] of BUNDLES) {
    await mkdir(join(docsRoot, path), { recursive: true });
    await writeFile(
      join(docsRoot, path, "doc.json"),
      JSON.stringify(docJson(`doc-${path}`, title, `Hello from ${title}`), null, 2),
    );
  }
  app = createDocsServeApp({ docsRoot });

  // Route the SPA's relative fetches into the real app, no network.
  realFetch = globalThis.fetch;
  const stub = ((input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://localhost/");
    return app.handle(new Request(url.toString(), init));
  }) as typeof fetch;
  globalThis.fetch = stub;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await rm(docsRoot, { recursive: true, force: true });
});

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("workbench shell", () => {
  it("renders the tree, doc header, mode switcher, and block-library nav", async () => {
    window.location.hash = "#/10-guide";
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Hello from Guide")).toBeTruthy();
    });
    expect(screen.getByText("docs/10-guide")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Docs workbench mode" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit mode" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Annotate mode" })).toBeTruthy();
    // Two modes only — read mode collapsed into the always-editable default.
    expect(!!screen.queryByRole("button", { name: "Read mode" })).toBe(false);
    // Edit IS the default: the editor mounts with no mode click, and the
    // header shows the auto-save indicator at rest.
    await waitFor(() => {
      expect(document.querySelector('[data-doc-editor="true"]')).toBeTruthy();
    });
    expect(saveStateAttr()).toBe("saved");
    expect(screen.getByText("Block library")).toBeTruthy();
  });

  it("static mode renders read-only: no mode switcher, no undo, content still renders", async () => {
    renderDocPage("10-guide", { isStatic: true });
    await waitFor(() => {
      expect(screen.getByText("Hello from Guide")).toBeTruthy();
    });
    expect(!!screen.queryByRole("group", { name: "Docs workbench mode" })).toBe(false);
    expect(!!document.querySelector("[data-docs-undo]")).toBe(false);
    expect(!!document.querySelector("[data-docs-action-pane]")).toBe(false);
    // No editor and no save indicator either — static is read-only.
    expect(!!document.querySelector('[data-doc-editor="true"]')).toBe(false);
    expect(saveStateAttr()).toBe(null);
    // The annotate targeting layer is read-only-hidden too: hovering a block
    // produces no outline and no chip.
    const block = document.querySelector('[data-block-id="para-1"]');
    expect(block).toBeTruthy();
    fireEvent.mouseMove(block!);
    expect(block!.classList.contains("docs-target-hovered")).toBe(false);
    expect(!!document.querySelector("[data-docs-target-overlay-label]")).toBe(false);
  });
});

describe("edit mode save loop", () => {
  it("auto-saves through /api/ops on the debounce alone (no manual action)", async () => {
    let editor: Editor | null = null;
    renderDocPage("65-autosave", { onEditorReady: (e) => (editor = e), autoSaveDelayMs: 40 });

    await waitFor(() => {
      expect(screen.getByText("Hello from Autosave")).toBeTruthy();
      expect(editor).toBeTruthy();
    });
    act(() => {
      editor!.commands.insertContentAt(1, "AUTOMARK ");
    });

    // No Cmd+S, no button — the debounce persists the edit on its own.
    await waitFor(
      async () => {
        const raw = await readFile(join(docsRoot, "65-autosave", "doc.json"), "utf8");
        expect(raw).toContain("AUTOMARK");
      },
      { timeout: 5000 },
    );
    await waitFor(() => {
      expect(saveStateAttr()).toBe("saved");
    });
    // The editor kept its content across its own save reflecting back (no
    // reseed): the draft text is still present exactly once.
    expect(editor!.getText()).toContain("AUTOMARK");
  });

  it("saves ops through /api/ops (hash precondition) on Cmd+S, persists to disk, and undoes once from the header", async () => {
    let editor: Editor | null = null;
    renderDocPage("70-edit", {
      onEditorReady: (e) => (editor = e),
      autoSaveDelayMs: NEVER_AUTOSAVE_MS,
    });

    await waitFor(() => {
      expect(screen.getByText("Hello from Edit")).toBeTruthy();
    });
    await makeEditorDirty(() => editor, "EDITMARK ");

    pressSaveShortcut();
    await waitFor(
      () => {
        expect(saveStateAttr()).toBe("saved");
      },
      { timeout: 5000 },
    );

    // The op batch landed on disk.
    const savedRaw = await readFile(join(docsRoot, "70-edit", "doc.json"), "utf8");
    expect(savedRaw).toContain("EDITMARK");

    // The save recorded an undoable patch; one click reverts it.
    const undoButton = await screen.findByText("Undo last save");
    fireEvent.click(undoButton);
    await waitFor(() => {
      expect(screen.getByText("Undo applied.")).toBeTruthy();
    });
    const revertedRaw = await readFile(join(docsRoot, "70-edit", "doc.json"), "utf8");
    expect(revertedRaw).not.toContain("EDITMARK");
    // Single-use: the affordance is consumed.
    expect(!!screen.queryByText("Undo last save")).toBe(false);
  });

  it("a 409 stale save keeps the draft and shows the stale banner with a reload option", async () => {
    let editor: Editor | null = null;
    renderDocPage("30-stale", {
      onEditorReady: (e) => (editor = e),
      autoSaveDelayMs: NEVER_AUTOSAVE_MS,
    });

    await waitFor(() => {
      expect(screen.getByText("Hello from Stale")).toBeTruthy();
    });

    // Dirty FIRST: while dirty the SSE-driven auto-refresh is suppressed, so
    // the rival change below leaves our hash stale instead of reseeding us.
    await makeEditorDirty(() => editor, "MY DRAFT ");

    // Going dirty acquired OUR draft lock; drop it via a raw release
    // (simulating TTL expiry) so the rival's write is admitted. The release
    // may race the in-flight acquire, so the rival write retries under
    // waitFor until the lock is really gone.
    await waitFor(async () => {
      await rawRequest("/api/draft-lock/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "30-stale", kind: "doc", sessionId: getSessionId() }),
      });
      await postOpsAs("rival-session", "30-stale", "Rewritten elsewhere");
    });

    pressSaveShortcut();

    await waitFor(() => {
      expect(screen.getByText(/Doc changed elsewhere — reload to continue/)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Reload doc" })).toBeTruthy();
    // The header indicator reflects the failed save…
    expect(saveStateAttr()).toBe("error");
    // …and the draft survived the rejected save.
    expect(editor!.getText()).toContain("MY DRAFT");
    // And the server kept the rival's version (our ops never applied).
    const diskRaw = await readFile(join(docsRoot, "30-stale", "doc.json"), "utf8");
    expect(diskRaw).toContain("Rewritten elsewhere");
    expect(diskRaw).not.toContain("MY DRAFT");
  });

  it("a draft lock held by another session pauses saving (acquire conflict) and 423s direct ops", async () => {
    // Rival grabs the lock before we start editing.
    const acquire = await rawRequest("/api/draft-lock/acquire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "40-locked", kind: "doc", sessionId: "rival-session" }),
    });
    expect(acquire.status).toBe(200);

    try {
      let editor: Editor | null = null;
      renderDocPage("40-locked", {
        onEditorReady: (e) => (editor = e),
        autoSaveDelayMs: NEVER_AUTOSAVE_MS,
      });
      await waitFor(() => {
        expect(screen.getByText("Hello from Locked")).toBeTruthy();
      });
      await waitFor(() => {
        expect(editor).toBeTruthy();
      });
      act(() => {
        editor!.commands.insertContentAt(1, "BLOCKED ");
      });

      // Acquire-on-dirty returned held-by-other -> conflict banner, and the
      // header indicator reports the conflict (auto-save is paused on it).
      await waitFor(() => {
        expect(document.querySelector("[data-doc-editor-lock-conflict]")).toBeTruthy();
      });
      await waitFor(() => {
        expect(saveStateAttr()).toBe("error");
      });

      // The ops route itself also rejects our session with 423.
      const bundle = await getBundle("40-locked");
      let status = 0;
      try {
        await applyDocOps(
          "40-locked",
          [{ type: "updateBlock", blockId: "para-1", text: [{ insert: "nope" }] }],
          bundle.doc_hash,
        );
      } catch (error) {
        if (error instanceof ApiError) status = error.status;
      }
      expect(status).toBe(423);
    } finally {
      await rawRequest("/api/draft-lock/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "40-locked", kind: "doc", sessionId: "rival-session" }),
      });
    }
  });

  it("switching to annotate mode flushes pending edits through the unmount save", async () => {
    let editor: Editor | null = null;
    renderDocPage("75-flush", {
      onEditorReady: (e) => (editor = e),
      autoSaveDelayMs: NEVER_AUTOSAVE_MS,
    });

    await waitFor(() => {
      expect(screen.getByText("Hello from Flush")).toBeTruthy();
    });
    await makeEditorDirty(() => editor, "FLUSHMARK ");

    fireEvent.click(screen.getByRole("button", { name: "Annotate mode" }));

    // The editor unmounted with the debounce still pending — the unmount
    // flush persists the draft anyway…
    await waitFor(
      async () => {
        const raw = await readFile(join(docsRoot, "75-flush", "doc.json"), "utf8");
        expect(raw).toContain("FLUSHMARK");
      },
      { timeout: 5000 },
    );
    // …and the annotate surface catches up to the saved content.
    await waitFor(() => {
      expect(screen.getByText(/FLUSHMARK/)).toBeTruthy();
    });
  });

  it("navigating away while dirty flushes the old doc without clobbering the new one", async () => {
    let editor: Editor | null = null;
    const view = renderDocPage("76-nav", {
      onEditorReady: (e) => (editor = e),
      autoSaveDelayMs: NEVER_AUTOSAVE_MS,
    });

    await waitFor(() => {
      expect(screen.getByText("Hello from Nav")).toBeTruthy();
    });
    await makeEditorDirty(() => editor, "NAVMARK ");

    view.rerenderPath("77-nav-target");
    await waitFor(() => {
      expect(screen.getByText("Hello from NavTarget")).toBeTruthy();
    });

    // The unmount flush saved the OLD doc (with its captured hash as the
    // precondition, even though the page state had already moved on)…
    await waitFor(
      async () => {
        const raw = await readFile(join(docsRoot, "76-nav", "doc.json"), "utf8");
        expect(raw).toContain("NAVMARK");
      },
      { timeout: 5000 },
    );
    // …and its late response did not swap the newly-opened doc's content.
    expect(screen.getByText("Hello from NavTarget")).toBeTruthy();
    expect(!!screen.queryByText(/NAVMARK/)).toBe(false);
  });
});

describe("page title rename", () => {
  it("commits an edited title as a bundle move (prefix kept) and reports the new path", async () => {
    const moves: string[] = [];
    renderDocPage("80-rename", { onDocMoved: (newPath) => moves.push(newPath) });
    await waitFor(() => {
      expect(screen.getByText("Hello from Rename")).toBeTruthy();
    });

    const title = document.querySelector(".docs-page-title") as HTMLElement;
    expect(title.textContent).toBe("Rename");
    title.textContent = "Fresh Coat";
    fireEvent.blur(title);

    // The REAL server moved the folder on disk, numeric prefix intact…
    await waitFor(async () => {
      const raw = await readFile(join(docsRoot, "80-fresh-coat", "doc.json"), "utf8");
      expect(raw).toContain("Hello from Rename");
    });
    // …and the host was told where the doc lives now.
    expect(moves).toEqual(["80-fresh-coat"]);

    // Restore for any later test that reuses the fixture list.
    const { moveDoc } = await import("../data/api");
    await moveDoc("80-fresh-coat", "80-rename");
  });

  it("reverts on Escape and on empty/unchanged titles without touching disk", async () => {
    const moves: string[] = [];
    renderDocPage("80-rename", { onDocMoved: (newPath) => moves.push(newPath) });
    await waitFor(() => {
      expect(screen.getByText("Hello from Rename")).toBeTruthy();
    });
    const title = document.querySelector(".docs-page-title") as HTMLElement;

    // Escape: typed text restores, no move.
    title.textContent = "Discarded";
    fireEvent.keyDown(title, { key: "Escape" });
    fireEvent.blur(title);
    await waitFor(() => {
      expect(title.textContent).toBe("Rename");
    });

    // Empty commit: restores, no move.
    title.textContent = "   ";
    fireEvent.blur(title);
    await waitFor(() => {
      expect(title.textContent).toBe("Rename");
    });

    // Punctuation-only commit (slug collapses to nothing): restores, no move.
    title.textContent = "!!!";
    fireEvent.blur(title);
    await waitFor(() => {
      expect(title.textContent).toBe("Rename");
    });

    expect(moves).toEqual([]);
    const raw = await readFile(join(docsRoot, "80-rename", "doc.json"), "utf8");
    expect(raw).toContain("Hello from Rename");
  });
});

describe("annotate mode", () => {
  it("creates a comment against a clicked block and resolves it", async () => {
    renderDocPage("50-comments");
    await waitFor(() => {
      expect(screen.getByText("Hello from Comments")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Annotate mode" }));
    // level 2: the comments PANE header — the fixture's page title (h1)
    // also reads "Comments" since the R2-D11 page-title furniture.
    expect(screen.getByRole("heading", { name: "Comments", level: 2 })).toBeTruthy();

    // Click the paragraph block -> composer opens against it.
    const block = document.querySelector('[data-block-id="para-1"]');
    expect(block).toBeTruthy();
    fireEvent.click(block!);
    await waitFor(() => {
      expect(screen.getByText(/Commenting on:/)).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("Add a comment..."), {
      target: { value: "Tighten this paragraph." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Post comment/ }));

    // Successful post closes the composer and lists the comment. (Boolean
    // coercion keeps failure output small — element dumps here are huge.)
    await waitFor(
      () => {
        expect(!!screen.queryByText(/Commenting on:/)).toBe(false);
        expect(!!screen.getByText("Tighten this paragraph.")).toBe(true);
      },
      { timeout: 5000 },
    );
    // "1 open" renders in both the pane header and the target group badge.
    expect(screen.getAllByText("1 open").length).toBeGreaterThanOrEqual(1);

    // Persisted to the bundle's comments sidecar.
    const commentsRaw = await readFile(join(docsRoot, "50-comments", "comments.json"), "utf8");
    expect(commentsRaw).toContain("Tighten this paragraph.");

    fireEvent.click(screen.getByRole("button", { name: /Resolve/ }));
    await waitFor(
      () => {
        expect(!!screen.getByText("Resolved")).toBe(true);
      },
      { timeout: 5000 },
    );
    const resolvedRaw = await readFile(join(docsRoot, "50-comments", "comments.json"), "utf8");
    expect(resolvedRaw).toContain('"resolved"');
  });

  it("hover-targets a block (outline + block type chip) and selecting via the layer opens the composer", async () => {
    renderDocPage("55-hover");
    await waitFor(() => {
      expect(screen.getByText("Hello from Hover")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Annotate mode" }));

    const block = document.querySelector('[data-block-id="para-1"]');
    expect(block).toBeTruthy();

    // Hover: outline class on the block wrapper + floating chip naming the
    // block type (from the block registry descriptor) and the block text.
    fireEvent.mouseMove(block!);
    expect(block!.classList.contains("docs-target-hovered")).toBe(true);
    expect(!!document.querySelector('[data-docs-target-overlay="hover"]')).toBe(true);
    const chip = document.querySelector('[data-docs-target-overlay-label="hover"]');
    expect(chip?.textContent).toBe("Paragraph: Hello from Hover");

    // Selecting through the layer opens the composer against that target
    // (real block id, block type-labelled) and draws the selected ring.
    fireEvent.click(block!);
    await waitFor(() => {
      expect(screen.getByText("Commenting on: Paragraph: Hello from Hover")).toBeTruthy();
    });
    expect(!!document.querySelector('[data-docs-target-overlay="selected"]')).toBe(true);
    expect(
      document.querySelector('[data-docs-target-overlay-label="selected"]')?.textContent,
    ).toBe("Paragraph");

    // Composer cancel clears the controlled selection -> ring disappears.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(!!screen.queryByText(/Commenting on:/)).toBe(false);
      expect(!!document.querySelector('[data-docs-target-overlay="selected"]')).toBe(false);
    });

    // The layer-selected target round-trips through the comment store: post
    // a comment and it lands against the clicked block id.
    fireEvent.click(block!);
    await waitFor(() => {
      expect(screen.getByText(/Commenting on:/)).toBeTruthy();
    });
    fireEvent.change(screen.getByPlaceholderText("Add a comment..."), {
      target: { value: "Layer-selected comment." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Post comment/ }));
    // Wait for the composer to CLOSE (not just for the text — the textarea's
    // own content matches it immediately): a closed composer means the POST
    // round-tripped and the sidecar write is on disk.
    await waitFor(
      () => {
        expect(!!screen.queryByText(/Commenting on:/)).toBe(false);
        expect(!!screen.getByText("Layer-selected comment.")).toBe(true);
      },
      { timeout: 5000 },
    );
    const commentsRaw = await readFile(join(docsRoot, "55-hover", "comments.json"), "utf8");
    expect(commentsRaw).toContain('"blockId": "para-1"');
  });
});

describe("live change events", () => {
  it("another actor's ops arrive over SSE, refresh the open bundle, and flash the changed block", async () => {
    renderDocPage("60-live");
    await waitFor(() => {
      expect(screen.getByText("Hello from Live")).toBeTruthy();
    });

    await postOpsAs("rival-session", "60-live", "Updated by other actor");

    await waitFor(
      () => {
        expect(screen.getByText("Updated by other actor")).toBeTruthy();
      },
      { timeout: 4000 },
    );
    // Changed-id highlight window (~2s) marks the block wrapper.
    await waitFor(() => {
      expect(
        !!document.querySelector('[data-block-id="para-1"][data-docs-changed="true"]'),
      ).toBe(true);
    });
  });
});

describe("undo contract", () => {
  it("undo of a patch id is single-use: second attempt reports already undone", async () => {
    const bundle = await getBundle("80-undo");
    const saved = await applyDocOps(
      "80-undo",
      [{ type: "updateBlock", blockId: "para-1", text: [{ insert: "To be undone" }] }],
      bundle.doc_hash,
    );

    const first = await undoPatch(saved.patch_id);
    expect(first.ok).toBe(true);

    const second = await undoPatch(saved.patch_id);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.alreadyUndone).toBe(true);
      expect(second.detail).toBe("Already undone.");
    }
  });
});
