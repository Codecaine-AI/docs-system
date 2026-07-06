import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { DocsClientProvider } from "@codecaine-ai/docs-viewer/client";

import { createDocsServeApp } from "../../../src/server";
import { applyDocOps, getBundle, undoPatch, ApiError } from "../api";
import { createStandaloneDocsClient } from "../client";
import { StandaloneCanvasEmbed } from "../CanvasEmbed";
import { App } from "../App";
import { DocPage } from "../DocPage";

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
    root: "root-1",
    blocks: {
      "root-1": {
        id: "root-1",
        flavour: "paragraph",
        props: { title },
        children: ["para-1"],
      },
      "para-1": {
        id: "para-1",
        flavour: "paragraph",
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
  ["60-live", "Live"],
  ["70-edit", "Edit"],
  ["80-undo", "Undo"],
];

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
  options?: { onEditorReady?: (editor: Editor) => void; isStatic?: boolean },
) {
  return render(
    <DocsClientProvider client={createStandaloneDocsClient()} canvasEmbed={StandaloneCanvasEmbed}>
      <DocPage path={path} onEditorReady={options?.onEditorReady} isStatic={options?.isStatic} />
    </DocsClientProvider>,
  );
}

async function makeEditorDirty(getEditor: () => Editor | null, text: string) {
  await waitFor(() => {
    expect(getEditor()).toBeTruthy();
  });
  act(() => {
    getEditor()!.commands.insertContentAt(1, text);
  });
  await waitFor(() => {
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
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
    expect(screen.getByRole("button", { name: "Read mode" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Annotate mode" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit mode" })).toBeTruthy();
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
  });
});

describe("edit mode save loop", () => {
  it("saves ops through /api/ops (hash precondition), persists to disk, and undoes once from the header", async () => {
    let editor: Editor | null = null;
    renderDocPage("70-edit", { onEditorReady: (e) => (editor = e) });

    await waitFor(() => {
      expect(screen.getByText("Hello from Edit")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit mode" }));
    await makeEditorDirty(() => editor, "EDITMARK ");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(
      () => {
        expect(!!screen.getByText("Saved")).toBe(true);
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
    renderDocPage("30-stale", { onEditorReady: (e) => (editor = e) });

    await waitFor(() => {
      expect(screen.getByText("Hello from Stale")).toBeTruthy();
    });
    // Enter edit mode FIRST — the SSE-driven auto-refresh is suppressed
    // while editing, so the out-of-band change below leaves our hash stale.
    fireEvent.click(screen.getByRole("button", { name: "Edit mode" }));
    await waitFor(() => {
      expect(editor).toBeTruthy();
    });

    // Another actor rewrites the doc (no draft lock held yet — not dirty).
    await postOpsAs("rival-session", "30-stale", "Rewritten elsewhere");

    await makeEditorDirty(() => editor, "MY DRAFT ");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText(/Doc changed elsewhere — reload to continue/)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Reload doc" })).toBeTruthy();
    // The draft survived the rejected save.
    expect(editor!.getText()).toContain("MY DRAFT");
    // And the server kept the rival's version (our ops never applied).
    const diskRaw = await readFile(join(docsRoot, "30-stale", "doc.json"), "utf8");
    expect(diskRaw).toContain("Rewritten elsewhere");
    expect(diskRaw).not.toContain("MY DRAFT");
  });

  it("a draft lock held by another session disables Save (acquire conflict) and 423s direct ops", async () => {
    // Rival grabs the lock before we start editing.
    const acquire = await rawRequest("/api/draft-lock/acquire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "40-locked", kind: "doc", sessionId: "rival-session" }),
    });
    expect(acquire.status).toBe(200);

    try {
      let editor: Editor | null = null;
      renderDocPage("40-locked", { onEditorReady: (e) => (editor = e) });
      await waitFor(() => {
        expect(screen.getByText("Hello from Locked")).toBeTruthy();
      });
      fireEvent.click(screen.getByRole("button", { name: "Edit mode" }));
      await makeEditorDirty(() => editor, "BLOCKED ");

      // Acquire-on-dirty returned held-by-other -> conflict banner + Save disabled.
      await waitFor(() => {
        expect(document.querySelector("[data-doc-editor-lock-conflict]")).toBeTruthy();
      });
      const saveButton = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
      expect(saveButton.disabled).toBe(true);

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
});

describe("annotate mode", () => {
  it("creates a comment against a clicked block and resolves it", async () => {
    renderDocPage("50-comments");
    await waitFor(() => {
      expect(screen.getByText("Hello from Comments")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Annotate mode" }));
    expect(screen.getByText("Comments")).toBeTruthy();

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
