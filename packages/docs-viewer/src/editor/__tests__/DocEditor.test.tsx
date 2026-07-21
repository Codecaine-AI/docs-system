import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import type { ReactElement } from "react";
import sampleDoc from "@codecaine-ai/docs-model/fixtures/sample.doc.json";
import { validateDocDocument, type DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { applyOps, type DocOp } from "@codecaine-ai/docs-model/doc-ops";
import {
  DocsClientProvider,
  type AcquireDraftLockResult,
  type DocsClient,
} from "../../client";
import DocEditor, { type DocEditorSaveState } from "../DocEditor";

/**
 * Save-boundary coverage for the M4 full block editor (Checkpoint 8, TG8.3):
 * a real edit to one block's text produces exactly one `updateBlock` op (and
 * nothing else — §8.3 id stability), a no-op edit produces zero ops and no
 * `onApplyOps` call at all, and a 409-stale response keeps the in-progress
 * edit rather than discarding it.
 *
 * Edits are driven through the REAL `Editor` instance (obtained via
 * `onCreate`) using `editor.commands`/`editor.chain()` — the same approach
 * `input-rules.test.ts` establishes for exercising a genuine ProseMirror
 * Schema/Editor under bun:test + happy-dom, which has no native
 * contenteditable typing simulation.
 *
 * Draft-lock coverage (CP9, TG9.3): in Spectre this file module-mocked
 * `@/lib/projects-api`'s acquire/heartbeat/release functions; after the
 * extraction DocEditor consumes those operations from the host-provided
 * `DocsClient` (see ../../client.tsx), so the tests inject a fake client
 * through `DocsClientProvider` instead — no `mock.module` needed. Call
 * args/counts are tracked in module-scope arrays reset in `beforeEach`.
 */

type DraftLockCall = [projectId: string, path: string, kind: "doc" | "canvas", sessionId: string];

let acquireCalls: DraftLockCall[] = [];
let heartbeatCalls: DraftLockCall[] = [];
let releaseCalls: DraftLockCall[] = [];
let acquireResult: AcquireDraftLockResult = {
  ok: true,
  lock: { sessionId: "s", acquiredAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-01T00:05:00.000Z" },
};
let heartbeatResult: AcquireDraftLockResult = {
  ok: true,
  lock: { sessionId: "s", acquiredAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-01T00:05:00.000Z" },
};

const fakeClient: DocsClient = {
  getDocsTree: async () => ({ tree: [] }),
  acquireDraftLock: async (...args: DraftLockCall) => {
    acquireCalls.push(args);
    return acquireResult;
  },
  heartbeatDraftLock: async (...args: DraftLockCall) => {
    heartbeatCalls.push(args);
    return heartbeatResult;
  },
  releaseDraftLock: async (...args: DraftLockCall) => {
    releaseCalls.push(args);
  },
};

function renderWithClient(ui: ReactElement) {
  return render(<DocsClientProvider client={fakeClient}>{ui}</DocsClientProvider>);
}

beforeEach(() => {
  acquireCalls = [];
  heartbeatCalls = [];
  releaseCalls = [];
  acquireResult = {
    ok: true,
    lock: { sessionId: "s", acquiredAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-01T00:05:00.000Z" },
  };
  heartbeatResult = {
    ok: true,
    lock: { sessionId: "s", acquiredAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-01T00:05:00.000Z" },
  };
});

afterEach(() => {
  cleanup();
});

function loadFixture(): DocDocument {
  const result = validateDocDocument(sampleDoc);
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.document;
}

/**
 * Finds the document range occupied by an exact text-node match in the
 * live editor state. Used by the transaction-driven edits below to target
 * a specific block's text without any DOM/MutationObserver dependence.
 */
function findTextRange(editor: Editor, text: string): { from: number; to: number } {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (range) return false;
    if (node.isText && node.text === text) {
      range = { from: pos, to: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  if (!range) throw new Error(`Text not found in editor state: ${text}`);
  return range;
}

describe("reference chip", () => {
  it("shows the target path as a tooltip without opening a hover card", async () => {
    const path = "10-system-design/10-doc-architecture/10-hierarchy-layers";
    const doc: DocDocument = {
      schemaVersion: 1,
      id: "reference-tooltip",
      root: "root",
      blocks: {
        root: { id: "root", type: "paragraph", props: {}, children: ["p1"] },
        p1: {
          id: "p1",
          type: "paragraph",
          props: {},
          text: [
            {
              insert: "Hierarchy layers",
              attributes: { reference: { kind: "doc", path, label: "Hierarchy layers" } },
            },
          ],
          children: [],
        },
      },
    };
    const { container } = renderWithClient(
      <DocEditor document={doc} onApplyOps={async () => ({ ok: true })} />,
    );

    const chip = await waitFor(() => {
      const element = container.querySelector<HTMLElement>("[data-doc-reference='true']");
      expect(element).toBeTruthy();
      return element!;
    });

    expect(chip.title).toBe("");
    fireEvent.mouseEnter(chip);
    const tooltip = await screen.findByRole("tooltip", {}, { timeout: 200 });
    expect(tooltip.textContent).toBe(path);
    expect(screen.queryByText("Go to reference")).toBeNull();
    fireEvent.mouseLeave(chip);
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });
});

describe("DocEditor save boundary", () => {
  it("editing one paragraph's text saves exactly one updateBlock op", async () => {
    const doc = loadFixture();
    const batches: DocOp[][] = [];
    let editorInstance: Editor | null = null;
    renderWithClient(
      <DocEditor
        document={doc}
        onApplyOps={async (ops) => {
          batches.push(ops);
          return { ok: true };
        }}
        onEditorReady={(e) => {
          editorInstance = e;
        }}
      />,
    );

    await waitFor(() => {
      expect(editorInstance).toBeTruthy();
    });

    // The SUBJECT here is the save boundary (diff -> exactly one correct
    // updateBlock op), not the DOM-sync pipeline — so the edit is driven
    // deterministically through the real Editor's transaction seam
    // (`onEditorReady`), same as the draft-lock suite. The dom-sync
    // pipeline has its own dedicated test below.
    act(() => {
      const { to } = findTextRange(editorInstance!, "Docs Model Sample");
      editorInstance!.commands.insertContentAt(to, " (edited)");
    });

    await waitFor(() => {
      expect(screen.getByText("Unsaved changes")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(batches.length).toBeGreaterThan(0);
    });
    expect(batches[0]).toEqual([
      {
        type: "updateBlock",
        blockId: "h1",
        text: [{ insert: "Docs Model Sample (edited)" }],
      },
    ]);
  });

  it("a no-change save produces zero ops and never calls onApplyOps", async () => {
    const doc = loadFixture();
    const batches: DocOp[][] = [];
    renderWithClient(
      <DocEditor
        document={doc}
        onApplyOps={async (ops) => {
          batches.push(ops);
          return { ok: true };
        }}
      />,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-doc-editor="true"]')).toBeTruthy();
    });

    const saveButton = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    // Not dirty yet — Save is disabled and a click must not dispatch.
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(saveButton);
    expect(batches).toHaveLength(0);
  });

  it("a stale (409) save keeps the in-progress edit and shows the reload prompt", async () => {
    const doc = loadFixture();
    let reloaded = 0;
    let editorInstance: Editor | null = null;
    renderWithClient(
      <DocEditor
        document={doc}
        onApplyOps={async () => ({
          ok: false,
          stale: true,
          message: "Document changed elsewhere.",
        })}
        onReloadDoc={() => {
          reloaded += 1;
        }}
        onEditorReady={(e) => {
          editorInstance = e;
        }}
      />,
    );

    await waitFor(() => {
      expect(editorInstance).toBeTruthy();
    });

    // Subject: 409 handling, not DOM sync — transaction-driven edit
    // replaces the heading text wholesale (see the op-payload test above
    // for the rationale).
    act(() => {
      const { from, to } = findTextRange(editorInstance!, "Docs Model Sample");
      editorInstance!.commands.insertContentAt({ from, to }, "My precious draft");
    });

    await waitFor(() => {
      expect(screen.getByText("Unsaved changes")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText(/Doc changed elsewhere/)).toBeTruthy();
    });
    // The draft (still "Unsaved changes") is preserved, not discarded.
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    expect(screen.getByText("My precious draft")).toBeTruthy();

    fireEvent.click(screen.getByText("Reload doc"));
    expect(reloaded).toBe(1);
  });

  it("the DOM-mutation + input-event pipeline reaches ProseMirror state (dom-sync)", async () => {
    // The ONE test whose subject genuinely is the DOM -> PM sync path
    // (happy-dom MutationObserver -> PM domObserver -> editor state), i.e.
    // how a real contenteditable keystroke lands. happy-dom's mutation
    // records can be delivered late under full-suite load, so this is
    // written slow-but-deterministic: each poll re-fires `input` (each
    // firing drains freshly-queued records via PM's takeRecords-based
    // flush) under a generous ceiling — CONVERGENCE is the assertion, not
    // latency. The save-boundary/lock tests above deliberately avoid this
    // pipeline (it's not their subject) via the `onEditorReady`
    // transaction seam; this test is why that seam isn't a coverage loss.
    const doc = loadFixture();
    let editorInstance: Editor | null = null;
    renderWithClient(
      <DocEditor
        document={doc}
        onApplyOps={async () => ({ ok: true })}
        onEditorReady={(e) => {
          editorInstance = e;
        }}
      />,
    );

    await waitFor(() => {
      expect(editorInstance).toBeTruthy();
      expect(document.querySelector('[data-doc-editor="true"]')).toBeTruthy();
    });

    const heading = screen.getByText("Docs Model Sample");
    heading.textContent = "Docs Model Sample (dom)";
    const proseMirror = document.querySelector('[data-doc-editor="true"]') as HTMLElement;

    await waitFor(
      () => {
        fireEvent.input(proseMirror);
        expect(editorInstance!.getText()).toContain("Docs Model Sample (dom)");
      },
      { timeout: 10_000 },
    );

    // And the React side (dirty indicator) reflects the PM-state change.
    await waitFor(() => {
      expect(screen.getByText("Unsaved changes")).toBeTruthy();
    });
  });
});

/**
 * Drives a dirty edit DETERMINISTICALLY through the real TipTap Editor
 * instance (captured via DocEditor's `onEditorReady` test seam): a
 * dispatched transaction fires `onUpdate` -> `setIsDirty(true)`
 * synchronously, with no dependence on happy-dom's MutationObserver.
 *
 * The save-boundary tests above intentionally keep the DOM-mutation +
 * input-event pipeline (PM's domObserver IS their subject); here dirtiness
 * is only a precondition for the lock lifecycle, and the DOM pipeline
 * proved flaky under full-suite load (mutation records occasionally missed
 * -> "Unsaved changes" never appeared -> ~1s waitFor timeout).
 */
async function makeDirtyEdit(getEditor: () => Editor | null) {
  await waitFor(() => {
    expect(getEditor()).toBeTruthy();
  });
  act(() => {
    getEditor()!.commands.insertContentAt(1, "x");
  });
  await waitFor(() => {
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });
}

describe("draft-lock lifecycle (TG9.3)", () => {
  it("does not call acquireDraftLock when projectId/documentPath are absent", async () => {
    const doc = loadFixture();
    let editorInstance: Editor | null = null;
    renderWithClient(
      <DocEditor
        document={doc}
        onApplyOps={async () => ({ ok: true })}
        onEditorReady={(e) => {
          editorInstance = e;
        }}
      />,
    );

    await makeDirtyEdit(() => editorInstance);

    // Give any stray async acquire a chance to fire before asserting absence.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(acquireCalls).toHaveLength(0);
  });

  it("acquires the draft lock exactly once on the first dirty transition", async () => {
    const doc = loadFixture();
    let editorInstance: Editor | null = null;
    renderWithClient(
      <DocEditor
        document={doc}
        projectId="proj-1"
        documentPath="docs/sample.doc.json"
        onApplyOps={async () => ({ ok: true })}
        onEditorReady={(e) => {
          editorInstance = e;
        }}
      />,
    );

    await makeDirtyEdit(() => editorInstance);

    await waitFor(() => {
      expect(acquireCalls).toHaveLength(1);
    });
    const [projectId, path, kind, sessionId] = acquireCalls[0];
    expect(projectId).toBe("proj-1");
    expect(path).toBe("docs/sample.doc.json");
    expect(kind).toBe("doc");
    expect(typeof sessionId).toBe("string");
    expect(sessionId.length).toBeGreaterThan(0);
  });

  it("disables Save and renders the conflict banner on a held-by-other acquire result", async () => {
    acquireResult = {
      ok: false,
      reason: "held-by-other",
      heldBy: {
        sessionId: "other-session",
        acquiredAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-01T00:05:00.000Z",
      },
    };
    const doc = loadFixture();
    let editorInstance: Editor | null = null;
    renderWithClient(
      <DocEditor
        document={doc}
        projectId="proj-1"
        documentPath="docs/sample.doc.json"
        onApplyOps={async () => ({ ok: true })}
        onEditorReady={(e) => {
          editorInstance = e;
        }}
      />,
    );

    await makeDirtyEdit(() => editorInstance);

    await waitFor(() => {
      expect(document.querySelector('[data-doc-editor-lock-conflict="true"]')).toBeTruthy();
    });
    const saveButton = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it("releases the draft lock on successful save and on unmount", async () => {
    const doc = loadFixture();
    let editorInstance: Editor | null = null;
    const result = renderWithClient(
      <DocEditor
        document={doc}
        projectId="proj-1"
        documentPath="docs/sample.doc.json"
        onApplyOps={async () => ({ ok: true })}
        onEditorReady={(e) => {
          editorInstance = e;
        }}
      />,
    );

    await makeDirtyEdit(() => editorInstance);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(releaseCalls.length).toBeGreaterThan(0);
    });
    const [projectId, path, kind, sessionId] = releaseCalls[0];
    expect(projectId).toBe("proj-1");
    expect(path).toBe("docs/sample.doc.json");
    expect(kind).toBe("doc");
    expect(typeof sessionId).toBe("string");

    // Now verify the unmount-while-dirty release path on a fresh instance.
    releaseCalls = [];
    const doc2 = loadFixture();
    let editorInstance2: Editor | null = null;
    const result2 = renderWithClient(
      <DocEditor
        document={doc2}
        projectId="proj-2"
        documentPath="docs/sample2.doc.json"
        onApplyOps={async () => ({ ok: true })}
        onEditorReady={(e) => {
          editorInstance2 = e;
        }}
      />,
    );

    await waitFor(() => {
      expect(editorInstance2).toBeTruthy();
    });
    act(() => {
      editorInstance2!.commands.insertContentAt(1, "y");
    });
    await waitFor(() => {
      expect(result2.getByText("Unsaved changes")).toBeTruthy();
    });

    result2.unmount();

    await waitFor(() => {
      expect(releaseCalls.length).toBeGreaterThan(0);
    });
    expect(releaseCalls[0][0]).toBe("proj-2");
    expect(releaseCalls[0][1]).toBe("docs/sample2.doc.json");

    result.unmount();
  });
});

/**
 * Auto-save (Notion-style hosts): the debounce loop, the Save-row removal,
 * save-state reporting, the seq-counter reschedule for edits typed during an
 * in-flight save, 409 pausing + reload resume, the unmount/blur flushes, and
 * the host-returned-doc identity trick that skips the cursor-resetting
 * reseed. All edits are driven through the `onEditorReady` transaction seam
 * (see the module doc comment for why).
 */
describe("auto-save", () => {
  it("auto-saves on the debounce alone and renders no Save row", async () => {
    const doc = loadFixture();
    const batches: DocOp[][] = [];
    let editorInstance: Editor | null = null;
    renderWithClient(
      <DocEditor
        document={doc}
        autoSave
        autoSaveDelayMs={30}
        onApplyOps={async (ops) => {
          batches.push(ops);
          return { ok: true };
        }}
        onEditorReady={(e) => {
          editorInstance = e;
        }}
      />,
    );
    await waitFor(() => {
      expect(editorInstance).toBeTruthy();
    });
    expect(!!screen.queryByRole("button", { name: "Save" })).toBe(false);
    expect(!!screen.queryByText("Unsaved changes")).toBe(false);

    act(() => {
      const { to } = findTextRange(editorInstance!, "Docs Model Sample");
      editorInstance!.commands.insertContentAt(to, " (auto)");
    });

    await waitFor(
      () => {
        expect(batches.length).toBe(1);
      },
      { timeout: 3000 },
    );
    expect(batches[0]).toEqual([
      {
        type: "updateBlock",
        blockId: "h1",
        text: [{ insert: "Docs Model Sample (auto)" }],
      },
    ]);
  });

  it("reports save-state transitions dirty -> saving -> saved", async () => {
    const doc = loadFixture();
    const states: DocEditorSaveState[] = [];
    let editorInstance: Editor | null = null;
    renderWithClient(
      <DocEditor
        document={doc}
        autoSave
        autoSaveDelayMs={30}
        onSaveStateChange={(state) => states.push(state)}
        onApplyOps={async () => {
          // A synchronous resolve completes before React ever commits the
          // isSaving render — hold it a beat so "saving" is observable.
          await new Promise((resolve) => setTimeout(resolve, 40));
          return { ok: true };
        }}
        onEditorReady={(e) => {
          editorInstance = e;
        }}
      />,
    );
    await waitFor(() => {
      expect(editorInstance).toBeTruthy();
    });

    act(() => {
      editorInstance!.commands.insertContentAt(1, "x");
    });

    await waitFor(
      () => {
        expect(states[states.length - 1]).toBe("saved");
      },
      { timeout: 3000 },
    );
    // The full loop was reported in order (initial "saved" report allowed first).
    const meaningful = states.filter((state, i) => states[i - 1] !== state);
    expect(meaningful.join(",")).toContain("dirty,saving,saved");
  });

  it("keeps the doc dirty and re-saves when edits land during an in-flight save", async () => {
    const doc = loadFixture();
    const batches: DocOp[][] = [];
    const states: DocEditorSaveState[] = [];
    let releaseFirstSave: () => void = () => {};
    const firstSaveGate = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    let editorInstance: Editor | null = null;
    renderWithClient(
      <DocEditor
        document={doc}
        autoSave
        autoSaveDelayMs={20}
        onSaveStateChange={(state) => states.push(state)}
        onApplyOps={async (ops) => {
          batches.push(ops);
          if (batches.length === 1) await firstSaveGate;
          return { ok: true };
        }}
        onEditorReady={(e) => {
          editorInstance = e;
        }}
      />,
    );
    await waitFor(() => {
      expect(editorInstance).toBeTruthy();
    });

    act(() => {
      const { to } = findTextRange(editorInstance!, "Docs Model Sample");
      editorInstance!.commands.insertContentAt(to, " one");
    });
    // First save dispatches and blocks on the gate…
    await waitFor(
      () => {
        expect(batches.length).toBe(1);
      },
      { timeout: 3000 },
    );
    // …and a second edit lands while it is in flight.
    act(() => {
      const { to } = findTextRange(editorInstance!, "Docs Model Sample one");
      editorInstance!.commands.insertContentAt(to, " two");
    });
    releaseFirstSave();

    // The completion notices the seq moved, stays dirty, and re-saves ONLY
    // the trailing edit (diffed against the advanced baseline).
    await waitFor(
      () => {
        expect(batches.length).toBe(2);
      },
      { timeout: 3000 },
    );
    expect(batches[1]).toEqual([
      {
        type: "updateBlock",
        blockId: "h1",
        text: [{ insert: "Docs Model Sample one two" }],
      },
    ]);
    await waitFor(() => {
      expect(states[states.length - 1]).toBe("saved");
    });
  });

  it("pauses auto-save after a 409 and resumes once the host reloads the doc", async () => {
    const doc = loadFixture();
    const batches: DocOp[][] = [];
    let stale = true;
    let editorInstance: Editor | null = null;
    const ui = (docProp: DocDocument) => (
      <DocEditor
        document={docProp}
        autoSave
        autoSaveDelayMs={20}
        onApplyOps={async (ops) => {
          batches.push(ops);
          return stale
            ? { ok: false, stale: true, message: "Document changed elsewhere." }
            : { ok: true };
        }}
        onEditorReady={(e) => {
          editorInstance = e;
        }}
      />
    );
    const view = renderWithClient(ui(doc));
    await waitFor(() => {
      expect(editorInstance).toBeTruthy();
    });

    act(() => {
      editorInstance!.commands.insertContentAt(1, "a");
    });
    await waitFor(
      () => {
        expect(screen.getByText(/Doc changed elsewhere/)).toBeTruthy();
      },
      { timeout: 3000 },
    );
    expect(batches.length).toBe(1);

    // Paused: further edits schedule nothing while the stale banner is up.
    act(() => {
      editorInstance!.commands.insertContentAt(1, "b");
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(batches.length).toBe(1);

    // Host reload: a NEW document object reseeds the editor, clears the
    // error, and unpauses — the next edit auto-saves again.
    stale = false;
    view.rerender(
      <DocsClientProvider client={fakeClient}>{ui(loadFixture())}</DocsClientProvider>,
    );
    await waitFor(() => {
      expect(!!screen.queryByText(/Doc changed elsewhere/)).toBe(false);
    });
    act(() => {
      editorInstance!.commands.insertContentAt(1, "c");
    });
    await waitFor(
      () => {
        expect(batches.length).toBe(2);
      },
      { timeout: 3000 },
    );
  });

  it("flushes pending edits on unmount", async () => {
    const doc = loadFixture();
    const batches: DocOp[][] = [];
    let editorInstance: Editor | null = null;
    const view = renderWithClient(
      <DocEditor
        document={doc}
        autoSave
        // Never fires on its own — the unmount flush is the subject.
        autoSaveDelayMs={600_000}
        onApplyOps={async (ops) => {
          batches.push(ops);
          return { ok: true };
        }}
        onEditorReady={(e) => {
          editorInstance = e;
        }}
      />,
    );
    await waitFor(() => {
      expect(editorInstance).toBeTruthy();
    });
    act(() => {
      const { to } = findTextRange(editorInstance!, "Docs Model Sample");
      editorInstance!.commands.insertContentAt(to, " (flushed)");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(batches.length).toBe(0);

    view.unmount();

    await waitFor(() => {
      expect(batches.length).toBe(1);
    });
    expect(batches[0]).toEqual([
      {
        type: "updateBlock",
        blockId: "h1",
        text: [{ insert: "Docs Model Sample (flushed)" }],
      },
    ]);
  });

  it("flushes pending edits when the window blurs", async () => {
    const doc = loadFixture();
    const batches: DocOp[][] = [];
    let editorInstance: Editor | null = null;
    renderWithClient(
      <DocEditor
        document={doc}
        autoSave
        autoSaveDelayMs={600_000}
        onApplyOps={async (ops) => {
          batches.push(ops);
          return { ok: true };
        }}
        onEditorReady={(e) => {
          editorInstance = e;
        }}
      />,
    );
    await waitFor(() => {
      expect(editorInstance).toBeTruthy();
    });
    act(() => {
      editorInstance!.commands.insertContentAt(1, "y");
    });

    fireEvent.blur(window);

    await waitFor(() => {
      expect(batches.length).toBe(1);
    });
  });

  it("advances its baseline to a host-returned doc and skips the reseed when that object round-trips as the document prop", async () => {
    const doc = loadFixture();
    let serverDoc = doc;
    let counter = 0;
    let editorInstance: Editor | null = null;
    const onApplyOps = async (ops: DocOp[]) => {
      const applied = applyOps(serverDoc, ops, () => `srv-${++counter}`);
      if (!applied.ok) throw new Error("fixture ops failed to apply");
      serverDoc = applied.doc;
      return { ok: true as const, doc: serverDoc };
    };
    const ui = (docProp: DocDocument) => (
      <DocEditor
        document={docProp}
        // Manual-save flow on purpose: the identity trick is not
        // autoSave-specific and the Save button keeps the test direct.
        onApplyOps={onApplyOps}
        onEditorReady={(e) => {
          editorInstance = e;
        }}
      />
    );
    const view = renderWithClient(ui(doc));
    await waitFor(() => {
      expect(editorInstance).toBeTruthy();
    });

    act(() => {
      const { to } = findTextRange(editorInstance!, "Docs Model Sample");
      editorInstance!.commands.insertContentAt(to, " (kept)");
    });
    await waitFor(() => {
      expect(screen.getByText("Unsaved changes")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeTruthy();
    });

    // The host feeds the SAME object back down (DocPage's setBundle) — the
    // reseed must recognize it and NOT dispatch a content reset. PM state
    // identity is the observable: setContent would produce a new state.
    const stateBeforeRoundTrip = editorInstance!.state;
    view.rerender(<DocsClientProvider client={fakeClient}>{ui(serverDoc)}</DocsClientProvider>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(editorInstance!.state).toBe(stateBeforeRoundTrip);
    expect(editorInstance!.getText()).toContain("Docs Model Sample (kept)");

    // A genuinely NEW document object still reseeds (control case).
    view.rerender(<DocsClientProvider client={fakeClient}>{ui(loadFixture())}</DocsClientProvider>);
    await waitFor(() => {
      expect(editorInstance!.state).not.toBe(stateBeforeRoundTrip);
      expect(editorInstance!.getText()).not.toContain("(kept)");
    });
  });
});
