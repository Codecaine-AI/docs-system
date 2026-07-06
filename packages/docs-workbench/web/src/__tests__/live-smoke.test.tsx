import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { fetch as bunFetch, spawn, type Subprocess } from "bun";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { DocsClientProvider } from "@codecaine-ai/docs-viewer/client";

import { applyDocOps, getBundle, undoPatch } from "../api";
import { createStandaloneDocsClient } from "../client";
import { StandaloneCanvasEmbed } from "../CanvasEmbed";
import { App } from "../App";
import { DocPage } from "../DocPage";

/**
 * LIVE smoke: boots a REAL listening docs server over a temp COPY of a real
 * docs tree and drives the workbench through real HTTP (happy-dom DOM, Bun's
 * native fetch pointed at the live port — including the SSE stream).
 *
 * Opt-in: set DOCS_SMOKE_ROOT to a real docs tree, e.g.
 *
 *   DOCS_SMOKE_ROOT="/path/to/some/docs" \
 *     bun test packages/docs-workbench/web/src/__tests__/live-smoke.test.tsx
 *
 * The tree is COPIED into a temp dir first — writes (ops saves, comments,
 * undo) never touch the source. Skipped entirely when the env var is unset,
 * so `bun test` stays hermetic.
 */

const SMOKE_SOURCE = process.env.DOCS_SMOKE_ROOT ?? "";
const enabled = SMOKE_SOURCE.length > 0;
const smokeIt = enabled ? it : it.skip;

let smokeRoot = "";
let baseUrl = "";
let serverProc: Subprocess | null = null;
let realFetch: typeof fetch;

/** First bundle path (folder containing doc.json) under the smoke root. */
let bundlePath = "";
/** A block id from that bundle's doc.json, used as the comment target. */
let firstBlockId = "";

async function findFirstBundle(root: string, rel = ""): Promise<string | null> {
  const entries = await readdir(join(root, rel), { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && entry.name === "doc.json")) return rel;
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const nested = await findFirstBundle(root, rel ? `${rel}/${entry.name}` : entry.name);
    if (nested) return nested;
  }
  return null;
}

beforeAll(async () => {
  if (!enabled) return;
  smokeRoot = await mkdtemp(join(tmpdir(), "docs-live-smoke-"));
  // Copy a real subtree (bounded: the first two top-level dirs) — never the
  // whole corpus, and never the original.
  const top = (await readdir(SMOKE_SOURCE, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort()
    .slice(0, 2);
  for (const dir of top) {
    await cp(join(SMOKE_SOURCE, dir), join(smokeRoot, dir), { recursive: true });
  }

  // Boot the REAL server in a separate process: this test process runs under
  // happy-dom (whose Response global would break Bun.serve in-process), and
  // an out-of-process boot is what `docs-cli serve` actually does anyway.
  const repoRoot = resolve(import.meta.dir, "../../../../..");
  const port = 42000 + Math.floor(Math.random() * 2000);
  serverProc = spawn(
    [
      "bun",
      "packages/docs-cli/src/index.ts",
      "serve",
      "--root",
      smokeRoot,
      "--port",
      String(port),
    ],
    { cwd: repoRoot, stdout: "ignore", stderr: "pipe" },
  );
  baseUrl = `http://127.0.0.1:${port}/`;
  // Wait for readiness.
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      const probe = await bunFetch(`${baseUrl}api/tree`);
      if (probe.ok) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error("live-smoke: server did not become ready");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }

  // The SPA fetches relative URLs; resolve them against the LIVE server and
  // go through Bun's native fetch (real sockets, real SSE stream).
  realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return bunFetch(new URL(raw, baseUrl).toString(), init as never);
  }) as typeof fetch;

  const found = await findFirstBundle(smokeRoot);
  if (!found) throw new Error("live-smoke: no doc.json bundle in the copied tree");
  bundlePath = found;
  const doc = JSON.parse(await readFile(join(smokeRoot, bundlePath, "doc.json"), "utf8")) as {
    root: string;
    blocks: Record<string, { id: string; children?: string[] }>;
  };
  const rootChildren = doc.blocks[doc.root]?.children ?? [];
  firstBlockId = rootChildren[0] ?? doc.root;
});

afterAll(async () => {
  if (!enabled) return;
  globalThis.fetch = realFetch;
  serverProc?.kill();
  await rm(smokeRoot, { recursive: true, force: true });
});

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

function renderDocPage(options?: { onEditorReady?: (editor: Editor) => void }) {
  return render(
    <DocsClientProvider client={createStandaloneDocsClient()} canvasEmbed={StandaloneCanvasEmbed}>
      <DocPage path={bundlePath} onEditorReady={options?.onEditorReady} />
    </DocsClientProvider>,
  );
}

describe("live smoke (real server, real docs copy)", () => {
  smokeIt("tree renders and the workbench header shows the mode switcher", async () => {
    window.location.hash = `#/${bundlePath}`;
    render(<App />);
    await waitFor(
      () => {
        expect(!!screen.getByText(`docs/${bundlePath}`)).toBe(true);
      },
      { timeout: 10000 },
    );
    expect(!!screen.getByRole("group", { name: "Docs workbench mode" })).toBe(true);
    expect(!!screen.getByRole("button", { name: "Annotate mode" })).toBe(true);
    // The sidebar rendered at least one bundle link from the real tree.
    expect(document.querySelectorAll("nav a[href^='#/']").length).toBeGreaterThan(0);
  });

  smokeIt(
    "an edit-mode save round-trips ops, the SSE frame arrives, and undo works once",
    async () => {
      // Raw SSE listener on the live stream (separate from the app's own).
      const frames: Array<{ path: string; patchId: string; actor: string }> = [];
      const sseResponse = await bunFetch(new URL("api/events", baseUrl).toString());
      expect(sseResponse.headers.get("content-type")).toContain("text/event-stream");
      const reader = sseResponse.body!.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      const pump = (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          sseBuffer += typeof value === "string" ? value : decoder.decode(value, { stream: true });
          for (const frame of sseBuffer.split(/\r?\n\r?\n/).slice(0, -1)) {
            if (/^event:/m.test(frame)) continue; // named connected/keepalive frames
            const data = frame
              .split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (data) frames.push(JSON.parse(data));
          }
          sseBuffer = sseBuffer.slice(sseBuffer.lastIndexOf("\n\n") + 2);
        }
      })();
      void pump;

      let editor: Editor | null = null;
      renderDocPage({ onEditorReady: (e) => (editor = e) });
      await waitFor(
        () => {
          expect(!!screen.getByText(`docs/${bundlePath}`)).toBe(true);
        },
        { timeout: 10000 },
      );
      fireEvent.click(screen.getByRole("button", { name: "Edit mode" }));
      await waitFor(
        () => {
          expect(editor).toBeTruthy();
        },
        { timeout: 10000 },
      );
      act(() => {
        editor!.commands.insertContentAt(1, "SMOKEMARK ");
      });
      await waitFor(() => {
        expect(!!screen.getByText("Unsaved changes")).toBe(true);
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(
        () => {
          expect(!!screen.getByText("Saved")).toBe(true);
        },
        { timeout: 10000 },
      );

      // Persisted into the temp COPY.
      const savedRaw = await readFile(join(smokeRoot, bundlePath, "doc.json"), "utf8");
      expect(savedRaw).toContain("SMOKEMARK");

      // The SSE frame for our save arrived over the real socket.
      const sessionId = window.sessionStorage.getItem("docs-workbench-session-id");
      await waitFor(
        () => {
          expect(frames.some((frame) => frame.path === bundlePath && !!frame.patchId)).toBe(true);
        },
        { timeout: 10000 },
      );
      const ownFrame = frames.find((frame) => frame.path === bundlePath);
      expect(ownFrame?.actor).toBe(sessionId ?? "");

      // Undo once from the header...
      fireEvent.click(await screen.findByText("Undo last save"));
      await waitFor(
        () => {
          expect(!!screen.getByText("Undo applied.")).toBe(true);
        },
        { timeout: 10000 },
      );
      const revertedRaw = await readFile(join(smokeRoot, bundlePath, "doc.json"), "utf8");
      expect(revertedRaw).not.toContain("SMOKEMARK");

      await reader.cancel().catch(() => {});
    },
    30000,
  );

  smokeIt(
    "a comment creates against a real block and resolves",
    async () => {
      renderDocPage();
      await waitFor(
        () => {
          expect(!!screen.getByText(`docs/${bundlePath}`)).toBe(true);
        },
        { timeout: 10000 },
      );
      fireEvent.click(screen.getByRole("button", { name: "Annotate mode" }));
      const block = document.querySelector(`[data-block-id="${firstBlockId}"]`);
      expect(!!block).toBe(true);

      // Framework targeting layer: hovering the real block outlines it and
      // shows the floating chip labelled from the flavour registry.
      fireEvent.mouseMove(block!);
      expect(block!.classList.contains("docs-target-hovered")).toBe(true);
      const chip = document.querySelector('[data-docs-target-overlay-label="hover"]');
      expect(!!chip).toBe(true);
      expect((chip?.textContent ?? "").length).toBeGreaterThan(0);

      fireEvent.click(block!);
      await waitFor(() => {
        expect(!!screen.getByText(/Commenting on:/)).toBe(true);
      });
      fireEvent.change(screen.getByPlaceholderText("Add a comment..."), {
        target: { value: "Live smoke comment." },
      });
      fireEvent.click(screen.getByRole("button", { name: /Post comment/ }));
      await waitFor(
        () => {
          expect(!!screen.queryByText(/Commenting on:/)).toBe(false);
          expect(!!screen.getByText("Live smoke comment.")).toBe(true);
        },
        { timeout: 10000 },
      );
      const commentsRaw = await readFile(join(smokeRoot, bundlePath, "comments.json"), "utf8");
      expect(commentsRaw).toContain("Live smoke comment.");

      fireEvent.click(screen.getByRole("button", { name: /Resolve/ }));
      await waitFor(
        () => {
          expect(!!screen.getByText("Resolved")).toBe(true);
        },
        { timeout: 10000 },
      );
    },
    30000,
  );

  smokeIt("undo is single-use against the live server", async () => {
    const bundle = await getBundle(bundlePath);
    const doc = bundle.doc as { root: string; blocks: Record<string, { children?: string[] }> };
    const blockId = doc.blocks[doc.root]?.children?.[0];
    if (!blockId) return;
    const saved = await applyDocOps(
      bundlePath,
      [{ type: "updateBlock", blockId, text: [{ insert: "Undo-contract smoke" }] }],
      bundle.doc_hash,
    );
    expect((await undoPatch(saved.patch_id)).ok).toBe(true);
    const second = await undoPatch(saved.patch_id);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.alreadyUndone).toBe(true);
  });
});
