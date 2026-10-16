import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { DocsClientProvider, type DocsClient, type DocsTreeNode } from "../../client";
import { referenceMentionPluginKey } from "../menus/reference-node";
import DocEditor from "../DocEditor";

/**
 * The `@` reference picker loads the docs tree lazily: nothing on editor
 * mount, one load when the picker opens, no reload on reopen within 30 s,
 * and a late result never shows once the picker closed or its client or
 * project changed. Driven through a real DocEditor (opened by inserting
 * " @" through `editor.commands`, as in DocEditor.test.tsx) with fake
 * DocsClients whose tree loads are hand-resolved deferreds.
 */

type Deferred = {
  promise: Promise<{ tree: DocsTreeNode[] }>;
  resolve: (tree: DocsTreeNode[]) => void;
  reject: (error: Error) => void;
};

function deferred(): Deferred {
  let resolve!: Deferred["resolve"];
  let reject!: Deferred["reject"];
  const promise = new Promise<{ tree: DocsTreeNode[] }>((res, rej) => {
    resolve = (tree) => res({ tree });
    reject = rej;
  });
  return { promise, resolve, reject };
}

type TreeCall = { projectId: string; signal: AbortSignal | undefined; load: Deferred };

/** A client whose every tree load is a fresh deferred, recorded with its project and signal. */
function fakeClient(): DocsClient & { calls: TreeCall[] } {
  const calls: TreeCall[] = [];
  return {
    calls,
    getDocsTree: (projectId, options) => {
      const load = deferred();
      calls.push({ projectId, signal: options?.signal, load });
      return load.promise;
    },
  };
}

const bundle = (path: string, name: string): DocsTreeNode => ({ name, path, kind: "bundle" });

const doc: DocDocument = {
  schemaVersion: 1,
  id: "reference-mention",
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["p1"] },
    p1: { id: "p1", type: "paragraph", props: {}, text: [{ insert: "Hello" }], children: [] },
  },
};

function Host({ client, projectId, onReady }: { client: DocsClient; projectId: string; onReady: (editor: Editor) => void }) {
  return (
    <DocsClientProvider client={client}>
      <DocEditor document={doc} projectId={projectId} onApplyOps={async () => ({ ok: true })} onEditorReady={onReady} />
    </DocsClientProvider>
  );
}

async function mount(client: DocsClient, projectId = "p1") {
  let editor: Editor | null = null;
  const onReady = (instance: Editor) => {
    editor = instance;
  };
  const view = render(<Host client={client} projectId={projectId} onReady={onReady} />);
  await waitFor(() => expect(editor).toBeTruthy());
  await settle();
  return {
    ...view,
    editor: () => editor!,
    rerenderWith: async (next: { client?: DocsClient; projectId?: string }) => {
      view.rerender(<Host client={next.client ?? client} projectId={next.projectId ?? projectId} onReady={onReady} />);
      await settle();
    },
  };
}

/** Absorbs floating-ui's async positioning and settled promises inside act. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function open(editor: Editor, text = " @") {
  await act(async () => {
    editor.commands.focus("end");
    editor.commands.insertContent(text);
  });
  await settle();
}

async function close(editor: Editor) {
  await act(async () => {
    editor.view.dispatch(editor.state.tr.setMeta(referenceMentionPluginKey, { forceClose: true }));
  });
  await settle();
}

async function press(key: string) {
  await act(async () => {
    fireEvent.keyDown(document.body, { key });
  });
  await settle();
}

const picker = () => document.querySelector<HTMLElement>("[data-doc-reference-picker='true']");
const pickerText = () => picker()?.textContent ?? "";

afterEach(() => {
  cleanup();
});

describe("reference picker tree loading", () => {
  it("does not load the docs tree when the editor mounts", async () => {
    const client = fakeClient();
    await mount(client);
    await settle();
    expect(client.calls).toHaveLength(0);
  });

  it("loads the tree once when the picker opens, showing a loading row first", async () => {
    const client = fakeClient();
    const { editor } = await mount(client);
    await open(editor());
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].projectId).toBe("p1");
    expect(pickerText()).toContain("Loading docs…");

    client.calls[0].load.resolve([bundle("guides/intro", "Intro")]);
    await settle();
    expect(pickerText()).toContain("Intro");
    expect(pickerText()).not.toContain("Loading docs…");
  });

  it("reuses the tree on reopen within 30 s and refetches after, keeping old entries meanwhile", async () => {
    const client = fakeClient();
    const { editor } = await mount(client);
    await open(editor());
    client.calls[0].load.resolve([bundle("guides/intro", "Intro")]);
    await settle();
    await close(editor());

    await open(editor());
    expect(client.calls).toHaveLength(1);
    expect(pickerText()).toContain("Intro");
    await close(editor());

    const realNow = Date.now();
    const now = spyOn(Date, "now").mockImplementation(() => realNow + 31_000);
    try {
      await open(editor());
      expect(client.calls).toHaveLength(2);
      expect(pickerText()).toContain("Intro");
      expect(pickerText()).not.toContain("Loading docs…");
    } finally {
      now.mockRestore();
    }
  });

  it("aborts the load when the picker closes and ignores its late result", async () => {
    const client = fakeClient();
    const { editor } = await mount(client);
    await open(editor());
    const first = client.calls[0];
    await close(editor());
    expect(first.signal?.aborted).toBe(true);

    first.load.resolve([bundle("guides/late", "Late")]);
    await settle();
    await open(editor());
    expect(client.calls).toHaveLength(2);
    expect(pickerText()).toContain("Loading docs…");
    expect(pickerText()).not.toContain("Late");
  });

  it("shows only the new client's entries when the old client resolves late", async () => {
    const a = fakeClient();
    const b = fakeClient();
    const view = await mount(a);
    await open(view.editor());
    await view.rerenderWith({ client: b });
    expect(a.calls[0].signal?.aborted).toBe(true);
    expect(b.calls).toHaveLength(1);

    b.calls[0].load.resolve([bundle("b/doc", "From B")]);
    await settle();
    a.calls[0].load.resolve([bundle("a/doc", "From A")]);
    await settle();
    expect(pickerText()).toContain("From B");
    expect(pickerText()).not.toContain("From A");
  });

  it("keeps the new client's entries when the old client rejects late", async () => {
    const a = fakeClient();
    const b = fakeClient();
    const view = await mount(a);
    await open(view.editor());
    await view.rerenderWith({ client: b });

    b.calls[0].load.resolve([bundle("b/doc", "From B")]);
    await settle();
    a.calls[0].load.reject(new Error("aborted"));
    await settle();
    expect(pickerText()).toContain("From B");
    expect(pickerText()).not.toContain("Couldn't load docs");
  });

  it("shows only the new project's entries when the old project resolves late", async () => {
    const client = fakeClient();
    const view = await mount(client, "p1");
    await open(view.editor());
    await view.rerenderWith({ projectId: "p2" });
    const [p1, p2] = client.calls;
    expect(p1.projectId).toBe("p1");
    expect(p2.projectId).toBe("p2");
    expect(p1.signal?.aborted).toBe(true);

    p2.load.resolve([bundle("p2/doc", "From p2")]);
    await settle();
    p1.load.resolve([bundle("p1/doc", "From p1")]);
    await settle();
    expect(pickerText()).toContain("From p2");
    expect(pickerText()).not.toContain("From p1");
  });

  it("keeps the new project's entries when the old project rejects late", async () => {
    const client = fakeClient();
    const view = await mount(client, "p1");
    await open(view.editor());
    await view.rerenderWith({ projectId: "p2" });
    const [p1, p2] = client.calls;

    p2.load.resolve([bundle("p2/doc", "From p2")]);
    await settle();
    p1.load.reject(new Error("aborted"));
    await settle();
    expect(pickerText()).toContain("From p2");
    expect(pickerText()).not.toContain("Couldn't load docs");
  });

  it("drops a late result from a loader that ignores the signal after unmount", async () => {
    let release!: () => void;
    let calls = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The workbench client's shape: an async loader with no signal parameter.
    const client: DocsClient = {
      getDocsTree: async () => {
        calls += 1;
        await gate;
        return { tree: [bundle("guides/intro", "Intro")] };
      },
    };
    const errors = spyOn(console, "error");
    try {
      const view = await mount(client);
      await open(view.editor());
      expect(calls).toBe(1);
      view.unmount();
      release();
      await settle();
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }

    const next = await mount(client);
    await open(next.editor());
    expect(calls).toBe(2);
  });

  it("shows an error row when the load fails and still offers the source-path row", async () => {
    const client = fakeClient();
    const { editor } = await mount(client);
    await open(editor());
    client.calls[0].load.reject(new Error("HTTP 500"));
    await settle();
    expect(pickerText()).toContain("Couldn't load docs");

    await act(async () => {
      editor().commands.insertContent("x");
    });
    await settle();
    expect(pickerText()).toContain('Reference source path "x"');
  });

  it("resets the selection when refreshed entries arrive, so Enter inserts a doc", async () => {
    const client = fakeClient();
    const { editor } = await mount(client);
    await open(editor());
    client.calls[0].load.resolve([bundle("docs/a", "A doc"), bundle("docs/b", "B doc"), bundle("docs/c", "C doc")]);
    await settle();
    await close(editor());

    const realNow = Date.now();
    const now = spyOn(Date, "now").mockImplementation(() => realNow + 31_000);
    try {
      // Old entries show while the refetch runs: 3 docs plus the source-path row.
      await open(editor(), " @docs");
      expect(client.calls).toHaveLength(2);
      await press("ArrowDown");
      await press("ArrowDown");
      expect(picker()?.querySelectorAll("button")[2]?.getAttribute("data-selected")).toBe("true");

      client.calls[1].load.resolve([bundle("docs/only", "Only doc")]);
      await settle();
      await press("Enter");
    } finally {
      now.mockRestore();
    }

    const refs: unknown[] = [];
    editor().state.doc.descendants((node) => {
      if (node.type.name === "docReference") refs.push(node.attrs.ref);
    });
    expect(refs).toEqual([{ kind: "doc", path: "docs/only" }]);
  });
});
