import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { DocsClientProvider } from "@codecaine-ai/docs-viewer/client";

import { createDocsServeApp } from "../../../src/server";
import { applyDocOps, getBundle, stageProposal, undoPatch, ApiError } from "../data/api";
import { getSessionId } from "../data/session";
import { createStandaloneDocsClient } from "../data/client";
import { StandaloneCanvasEmbed } from "../pages/CanvasEmbed";
import { App, themeWritePayload } from "../shell/App";
import { DEFAULT_STYLE_RAIL_SETTINGS } from "../shell/StyleRail";
import { DocPage } from "../pages/DocPage";

/**
 * Workbench integration tests: the REAL serve app (docs-server routes over a
 * temp docs tree) handles every request — `globalThis.fetch` is stubbed to
 * route the SPA's relative URLs straight into `app.handle`, so the ops
 * 409/423 paths, the annotation create/resolve contract, undo single-use, and
 * the SSE fetch-stream fallback are all exercised end-to-end with no
 * network. (Mirrors the fake-DocsClient injection pattern of the
 * docs-viewer suites, but with the genuine backend behind the seam.)
 */

let docsRoot: string;
let repoRoot: string;
let app: ReturnType<typeof createDocsServeApp>;
let realFetch: typeof fetch;

function docJson(
  id: string,
  title: string,
  text: string,
  options?: {
    rootProps?: Record<string, unknown>;
    paragraphProps?: Record<string, unknown>;
  },
) {
  return {
    schemaVersion: 1,
    id,
    title,
    root: "root-1",
    blocks: {
      "root-1": {
        id: "root-1",
        type: "paragraph",
        props: options?.rootProps ?? {},
        children: ["para-1"],
      },
      "para-1": {
        id: "para-1",
        type: "paragraph",
        props: options?.paragraphProps ?? {},
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
  ["50-annotations", "Annotations"],
  ["55-hover", "Hover"],
  ["56-range", "Range"],
  ["60-live", "Live"],
  ["65-autosave", "Autosave"],
  ["70-edit", "Edit"],
  ["75-flush", "Flush"],
  ["76-nav", "Nav"],
  ["80-rename", "Rename"],
  ["77-nav-target", "NavTarget"],
  ["80-undo", "Undo"],
  ["90-lab", "Lab"],
  ["91-stale-proposal", "StaleProposal"],
  ["92-mode", "Mode"],
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
  repoRoot = await mkdtemp(join(tmpdir(), "docs-workbench-test-"));
  docsRoot = join(repoRoot, "docs");
  await mkdir(docsRoot, { recursive: true });
  for (const [path, title] of BUNDLES) {
    await mkdir(join(docsRoot, path), { recursive: true });
    await writeFile(
      join(docsRoot, path, "doc.json"),
      JSON.stringify(docJson(`doc-${path}`, title, `Hello from ${title}`), null, 2),
    );
  }
  await mkdir(join(docsRoot, "67-invalid-props"), { recursive: true });
  await writeFile(
    join(docsRoot, "67-invalid-props", "doc.json"),
    JSON.stringify(
      docJson("doc-67-invalid-props", "Invalid Props", "Legacy editable text", {
        paragraphProps: { legacy: true },
      }),
      null,
      2,
    ),
  );
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
  await rm(repoRoot, { recursive: true, force: true });
});

afterEach(() => {
  cleanup();
  window.location.hash = "";
  localStorage.clear();
});

describe("workbench shell", () => {
  it("renders the tree, doc header, and glass-panel mode tabs", async () => {
    window.location.hash = "#/10-guide";
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Hello from Guide")).toBeTruthy();
    });
    expect(screen.getByText("docs/10-guide")).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Lab panel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "AI" })).toBeTruthy();
    // Two modes only — read mode collapsed into the always-editable default.
    expect(!!screen.queryByRole("button", { name: "Read mode" })).toBe(false);
    // Edit IS the default: the editor mounts with no mode click, and the
    // header shows the auto-save indicator at rest.
    await waitFor(() => {
      expect(document.querySelector('[data-doc-editor="true"]')).toBeTruthy();
    });
    expect(saveStateAttr()).toBe("saved");
  });

  it("renders a legacy overview route and replaces its hash with the section route", async () => {
    window.location.hash = "#/10-guide/00-overview";
    const historyLength = window.history.length;
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Hello from Guide")).toBeTruthy();
      expect(window.location.hash).toBe("#/10-guide");
    });
    expect(window.history.length).toBe(historyLength);
  });

  it("static mode renders read-only: no mode switcher, no undo, content still renders", async () => {
    renderDocPage("10-guide", { isStatic: true });
    await waitFor(() => {
      expect(screen.getByText("Hello from Guide")).toBeTruthy();
    });
    expect(!!document.querySelector("[data-lab-dock]")).toBe(false);
    expect(!!document.querySelector("[data-docs-undo]")).toBe(false);
    // No editor and no save indicator either — static is read-only.
    expect(!!document.querySelector('[data-doc-editor="true"]')).toBe(false);
    expect(saveStateAttr()).toBe(null);
    // The annotate targeting layer is read-only-hidden too: hovering a block
    // produces no ring and no chip.
    const block = document.querySelector('[data-block-id="para-1"]');
    expect(block).toBeTruthy();
    fireEvent.mouseMove(block!);
    expect(!!document.querySelector('[data-annotation-ui="hover-ring"]')).toBe(false);
    expect(!!document.querySelector("[data-annotation-chip]")).toBe(false);
  });

  it("loads repo settings ahead of stale cache and writes annotate edits to the active theme", async () => {
    const themeId = "product-theme";
    const themeDir = join(repoRoot, "themes", themeId);
    await mkdir(join(themeDir, "components"), { recursive: true });
    await writeFile(
      join(themeDir, "theme.json"),
      JSON.stringify(
        {
          name: "Product Theme",
          dark: false,
          railDefaults: {
            layout: { wideWidth: 1040, contentMargin: 88 },
            annotate: { washOpacity: 0.17, actionPaneWidth: 611 },
          },
        },
        null,
        2,
      ),
    );
    localStorage.setItem("docs-theme-folder-id", themeId);
    localStorage.setItem("docs-viewer-theme", "dark");
    localStorage.setItem(
      "docs-style-rail-settings.v1",
      JSON.stringify({ annotate: { washOpacity: 0.03, actionPaneWidth: 390 } }),
    );
    window.location.hash = "#/10-guide";

    render(<App />);
    // The config response must not expose editable controls before the
    // authoritative theme response has also settled.
    expect(screen.queryByRole("button", { name: "Collapse style controls" })).toBeNull();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Collapse style controls" })).toBeTruthy();
      expect(document.documentElement.style.getPropertyValue("--docs-action-pane-width")).toBe(
        "611px",
      );
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    fireEvent.click(screen.getByRole("button", { name: "Annotate" }));
    fireEvent.change(screen.getByLabelText(/AI panel width/), { target: { value: "644" } });

    await waitFor(
      async () => {
        const saved = JSON.parse(await readFile(join(themeDir, "theme.json"), "utf8")) as {
          railDefaults: { annotate: { actionPaneWidth: number; washOpacity: number } };
        };
        expect(saved.railDefaults.annotate.actionPaneWidth).toBe(644);
        expect(saved.railDefaults.annotate.washOpacity).toBe(0.17);
      },
      { timeout: 4000, interval: 100 },
    );
    expect(await Bun.file(join(repoRoot, "themes", "default", "theme.json")).exists()).toBe(false);
  });

  it("keeps the rail hidden and performs no write-back on a theme-locked serve", async () => {
    const themeDir = join(repoRoot, "themes", "default");
    await mkdir(themeDir, { recursive: true });
    const lockedTheme = `${JSON.stringify(
      {
        name: "Locked Default",
        dark: false,
        railDefaults: {
          layout: { wideWidth: 1040, contentMargin: 88 },
          annotate: { washOpacity: 0.19, actionPaneWidth: 633 },
        },
      },
      null,
      2,
    )}\n`;
    await writeFile(join(themeDir, "theme.json"), lockedTheme);
    const staleCache = JSON.stringify({ annotate: { washOpacity: 0.02, actionPaneWidth: 390 } });
    localStorage.setItem("docs-viewer-theme", "dark");
    localStorage.setItem("docs-style-rail-settings.v1", staleCache);
    window.location.hash = "#/10-guide";

    const unlockedApp = app;
    app = createDocsServeApp({ docsRoot, themeLocked: true });
    const view = render(<App />);
    try {
      await waitFor(() => {
        expect(document.documentElement.style.getPropertyValue("--docs-action-pane-width")).toBe(
          "633px",
        );
        expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      });
      expect(screen.queryByRole("button", { name: "Collapse style controls" })).toBeNull();

      // Longer than the unlocked debounce: neither the repo file nor cache
      // may be changed by this consumer host.
      await new Promise((resolve) => setTimeout(resolve, 1700));
      expect(await readFile(join(themeDir, "theme.json"), "utf8")).toBe(lockedTheme);
      expect(localStorage.getItem("docs-viewer-theme")).toBe("dark");
      expect(localStorage.getItem("docs-style-rail-settings.v1")).toBe(staleCache);
    } finally {
      view.unmount();
      app = unlockedApp;
    }
  });
});

describe("theme write payload", () => {
  it("preserves active manifest fields and sibling component tokens", () => {
    const payload = themeWritePayload(
      {
        ...DEFAULT_STYLE_RAIL_SETTINGS,
        annotate: { ...DEFAULT_STYLE_RAIL_SETTINGS.annotate, actionPaneWidth: 640 },
        components: { callout: { fill: "#222222" } },
      },
      true,
      "product-theme",
      {
        manifest: { name: "Product Theme", base: "default", fonts: { body: "Inter" } },
        components: { callout: { fill: "#111111", border: "#333333" } },
      },
    );

    expect(payload.id).toBe("product-theme");
    expect(payload.manifest).toMatchObject({
      name: "Product Theme",
      base: "default",
      fonts: { body: "Inter" },
      dark: true,
      railDefaults: { annotate: { actionPaneWidth: 640 } },
    });
    expect(payload.components).toEqual({
      callout: { fill: "#222222", border: "#333333" },
    });
  });
});

describe("edit mode save loop", () => {
  it("shows the rejected op path and validation message instead of only the generic detail", async () => {
    let editor: Editor | null = null;
    renderDocPage("67-invalid-props", {
      onEditorReady: (instance) => (editor = instance),
      autoSaveDelayMs: NEVER_AUTOSAVE_MS,
    });

    await waitFor(() => expect(screen.getByText("Legacy editable text")).toBeTruthy());
    await makeEditorDirty(() => editor, "EDIT ");
    pressSaveShortcut();

    await waitFor(() => {
      expect(screen.getByText(/\$\.op\.props\.legacy: Unexpected property/)).toBeTruthy();
      expect(saveStateAttr()).toBe("error");
    });
  });

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

    fireEvent.click(screen.getByRole("button", { name: "AI" }));

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
  // The annotate UX standard (shared @codecaine-ai/annotations targeting):
  // click pins the block and opens the inline lab composer next to it; every
  // block/text request files through the projected edit session.
  const composerSelector = "[data-docs-lab-composer]";
  const composerPlaceholder = "What should change here?";

  it("creates an agent-request annotation against a clicked block", async () => {
    renderDocPage("50-annotations");
    await waitFor(() => {
      expect(screen.getByText("Hello from Annotations")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    // Click the paragraph block -> the anchored composer popover opens.
    const block = document.querySelector('[data-block-id="para-1"]');
    expect(block).toBeTruthy();
    fireEvent.click(block!);
    await waitFor(() => {
      expect(!!document.querySelector(composerSelector)).toBe(true);
    });
    // Single fixed intent — no picker buttons render in the popover.
    expect(!!document.querySelector("[data-annotation-composer-intent]")).toBe(false);

    fireEvent.change(screen.getByPlaceholderText(composerPlaceholder), {
      target: { value: "Tighten this paragraph." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Queue" }));

    // Successful post closes the popover and lists the request. (Boolean
    // coercion keeps failure output small — element dumps here are huge.)
    await waitFor(
      () => {
        expect(!!document.querySelector(composerSelector)).toBe(false);
        expect(screen.getAllByText("Tighten this paragraph.").length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );
    // Persisted to the bundle's annotations sidecar — as an agent request
    // (the annotate flow has no note intent anymore).
    const annotationsRaw = await readFile(join(docsRoot, "50-annotations", "annotations.json"), "utf8");
    expect(annotationsRaw).toContain("Tighten this paragraph.");
    expect(annotationsRaw).toContain('"intent": "agent-request"');

  });

  it("hover-targets a block (glide ring + block type chip) and clicking opens the anchored composer", async () => {
    renderDocPage("55-hover");
    await waitFor(() => {
      expect(screen.getByText("Hello from Hover")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    const block = document.querySelector('[data-block-id="para-1"]');
    expect(block).toBeTruthy();

    // Hover: dotted glide ring + floating chip naming the block type (from
    // the block registry descriptor) and the block text.
    fireEvent.mouseMove(block!);
    expect(!!document.querySelector('[data-annotation-ui="hover-ring"]')).toBe(true);
    const chip = document.querySelector('[data-annotation-ui="hover-chip"]');
    expect(chip?.textContent).toBe("Paragraph: Hello from Hover");

    // Clicking pins the target: the inline composer opens, the selected ring draws, and the
    // hover affordance stands down while the popover is open.
    fireEvent.click(block!);
    await waitFor(() => {
      expect(!!document.querySelector(composerSelector)).toBe(true);
    });
    expect(!!document.querySelector('[data-annotation-ui="selected-ring"]')).toBe(true);
    expect(!!document.querySelector('[data-annotation-ui="hover-ring"]')).toBe(false);

    // Popover cancel clears the pinned selection -> popover and ring gone.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(!!document.querySelector(composerSelector)).toBe(false);
      expect(!!document.querySelector('[data-annotation-ui="selected-ring"]')).toBe(false);
    });

    // The pinned target round-trips through the annotation store: post an
    // annotation and it lands against the clicked block id.
    fireEvent.click(block!);
    await waitFor(() => {
      expect(!!document.querySelector(composerSelector)).toBe(true);
    });
    fireEvent.change(screen.getByPlaceholderText(composerPlaceholder), {
      target: { value: "Layer-selected annotation." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Queue" }));
    // Wait for the popover to CLOSE (not just for the text — the textarea's
    // own content matches it immediately): a closed popover means the POST
    // round-tripped and the sidecar write is on disk.
    await waitFor(
      () => {
        expect(!!document.querySelector(composerSelector)).toBe(false);
        expect(screen.getAllByText("Layer-selected annotation.").length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );
    const annotationsRaw = await readFile(join(docsRoot, "55-hover", "annotations.json"), "utf8");
    expect(annotationsRaw).toContain('"blockId": "para-1"');
  });

  it("Cmd+drag text selection pins a text-range target and annotates it", async () => {
    renderDocPage("56-range");
    await waitFor(() => {
      expect(screen.getByText("Hello from Range")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    const block = document.querySelector('[data-block-id="para-1"]') as HTMLElement;
    expect(block).toBeTruthy();

    // Stage the native selection a Cmd+drag would leave ("Hello"), then
    // release with the modifier held — the meta-gated range flow fires.
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode();
    expect(textNode?.textContent).toContain("Hello from Range");
    const range = document.createRange();
    range.setStart(textNode!, 0);
    range.setEnd(textNode!, 5);
    const domSelection = window.getSelection()!;
    domSelection.removeAllRanges();
    domSelection.addRange(range);
    fireEvent.mouseUp(block, { metaKey: true });

    await waitFor(() => {
      expect(!!document.querySelector(composerSelector)).toBe(true);
    });
    fireEvent.change(screen.getByPlaceholderText(composerPlaceholder), {
      target: { value: "Reword this phrase." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Queue" }));
    await waitFor(
      () => {
        expect(!!document.querySelector(composerSelector)).toBe(false);
        expect(screen.getAllByText("Reword this phrase.").length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );

    // Persisted with the documented offset convention: offsets index the
    // block element's rendered textContent, end exclusive, quote exact.
    const annotationsRaw = await readFile(join(docsRoot, "56-range", "annotations.json"), "utf8");
    expect(annotationsRaw).toContain('"kind": "text-range"');
    expect(annotationsRaw).toContain('"blockId": "para-1"');
    expect(annotationsRaw).toContain('"start": 0');
    expect(annotationsRaw).toContain('"end": 5');
    expect(annotationsRaw).toContain('"quote": "Hello"');
  });

  it("an unmodified release with a text selection does not pin a range target", async () => {
    renderDocPage("55-hover");
    await waitFor(() => {
      expect(screen.getByText("Hello from Hover")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    const block = document.querySelector('[data-block-id="para-1"]') as HTMLElement;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode();
    const range = document.createRange();
    range.setStart(textNode!, 0);
    range.setEnd(textNode!, 5);
    const domSelection = window.getSelection()!;
    domSelection.removeAllRanges();
    domSelection.addRange(range);
    fireEvent.mouseUp(block); // no Cmd/Ctrl — the selection is ignored

    expect(!!document.querySelector(composerSelector)).toBe(false);
    domSelection.removeAllRanges();
  });
});

describe("docs lab integration", () => {
  it("uses glass tabs for targeting, disconnected Apply, wash, and Escape", async () => {
    renderDocPage("92-mode");
    await waitFor(() => expect(screen.getByText("Hello from Mode")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(document.querySelector('[data-docs-mode="annotate"]')).toBeTruthy();
    expect(document.querySelector("[data-docs-annotation-wash]")).toBeTruthy();
    const apply = document.querySelector<HTMLButtonElement>("[data-docs-lab-queue-apply]");
    expect(apply?.disabled).toBe(true);
    expect(apply?.title).toBe("docs agent not connected");

    const block = document.querySelector('[data-block-id="para-1"]')!;
    fireEvent.mouseMove(block);
    expect(document.querySelector('[data-annotation-ui="hover-ring"]')).toBeTruthy();

    fireEvent.click(block);
    expect(document.querySelector("[data-docs-lab-composer]")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(document.querySelector("[data-docs-lab-composer]")).toBeNull();
    });
    expect(document.querySelector('[data-docs-mode="annotate"]')).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(document.querySelector('[data-docs-mode="edit"]')).toBeTruthy();
    });
    expect(document.querySelector("[data-docs-annotation-wash]")).toBeNull();
  });

  it("renders staged before/after regions, excludes their blocks, and accepts", async () => {
    const bundle = await getBundle("90-lab");
    await stageProposal("90-lab", {
      ops: [
        {
          type: "updateBlock",
          blockId: "para-1",
          text: [{ insert: "Hello after proposal" }],
        },
      ],
      summary: "Rewrite the lab paragraph",
      expectedHash: bundle.doc_hash,
      alias: "A1",
    });

    renderDocPage("90-lab");
    await waitFor(() => expect(screen.getByText("Hello from Lab")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    await waitFor(() => {
      expect(document.querySelector('[data-docs-lab-proposal-bar="A1"]')).toBeTruthy();
      expect(document.querySelector('[data-docs-staged-before="A1"]')).toBeTruthy();
      expect(document.querySelector('[data-docs-staged-after="A1"]')).toBeTruthy();
    });
    expect(screen.getByText("Hello from Lab")).toBeTruthy();
    expect(screen.getByText("Hello after proposal")).toBeTruthy();

    for (const selector of [
      '[data-docs-staged-before="A1"] [data-block-id="para-1"]',
      '[data-docs-staged-after="A1"] [data-block-id="para-1"]',
    ]) {
      const stagedBlock = document.querySelector(selector)!;
      fireEvent.mouseMove(stagedBlock);
      fireEvent.click(stagedBlock);
      expect(document.querySelector('[data-annotation-ui="hover-ring"]')).toBeNull();
      expect(document.querySelector("[data-docs-lab-composer]")).toBeNull();
    }

    fireEvent.click(screen.getByRole("button", { name: "Accept A1" }));
    await waitFor(
      () => {
        expect(!!document.querySelector('[data-docs-staged-before="A1"]')).toBe(false);
        expect(screen.getByText("Hello after proposal")).toBeTruthy();
      },
      { timeout: 10000 },
    );
    expect(await readFile(join(docsRoot, "90-lab", "doc.json"), "utf8")).toContain(
      "Hello after proposal",
    );
  }, 15000);

  it("shows stale proposals as conflict rows instead of inline regions", async () => {
    const bundle = await getBundle("91-stale-proposal");
    await stageProposal("91-stale-proposal", {
      ops: [
        {
          type: "updateBlock",
          blockId: "para-1",
          text: [{ insert: "Stale proposal text" }],
        },
      ],
      summary: "Outdated rewrite",
      expectedHash: bundle.doc_hash,
      alias: "A2",
    });
    await postOpsAs("other-session", "91-stale-proposal", "Newer document text");

    renderDocPage("91-stale-proposal");
    await waitFor(() => expect(screen.getByText("Newer document text")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    await waitFor(() => {
      expect(document.querySelector('[data-docs-stale-proposal="A2"]')).toBeTruthy();
    });
    expect(screen.getByText("stale")).toBeTruthy();
    expect(document.querySelector("[data-docs-staged-before]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reject A2" }));
    await waitFor(async () => {
      expect(
        await readFile(join(docsRoot, "91-stale-proposal", "proposals.json"), "utf8"),
      ).toContain('"status": "rejected"');
    });
    await waitFor(() => {
      expect(!!document.querySelector('[data-docs-stale-proposal="A2"]')).toBe(false);
    });
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
