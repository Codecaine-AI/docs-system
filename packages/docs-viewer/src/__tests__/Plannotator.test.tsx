import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { DocComment } from "@codecaine-ai/docs-model/comments-schema";
import Plannotator, { type PlannotatorSelection } from "../annotate/Plannotator";

afterEach(() => {
  cleanup();
});

const doc: DocDocument = {
  schemaVersion: 1,
  id: "doc-1",
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["p1"] },
    p1: { id: "p1", type: "paragraph", props: {}, text: [{ insert: "Hello" }], children: [] },
  },
};

function blockComment(overrides: Partial<DocComment> = {}): DocComment {
  return {
    id: "c1",
    target: { kind: "block", blockId: "p1" },
    body: "Please clarify this.",
    intent: "note",
    author: "ford",
    status: "open",
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Plannotator", () => {
  it("renders an empty state when there are no comments and no selection", () => {
    render(
      <Plannotator
        comments={[]}
        document={doc}
        selection={null}
        onClearSelection={() => {}}
        onAddComment={async () => {}}
        onResolveComment={async () => {}}
      />,
    );
    expect(screen.getByText(/No comments yet/)).toBeTruthy();
  });

  it("renders existing comments grouped by target with open counts", () => {
    render(
      <Plannotator
        comments={[
          blockComment(),
          blockComment({ id: "c2", status: "resolved", body: "Looks good now." }),
        ]}
        document={doc}
        selection={null}
        onClearSelection={() => {}}
        onAddComment={async () => {}}
        onResolveComment={async () => {}}
      />,
    );
    expect(screen.getByText("1 open")).toBeTruthy();
    expect(screen.getByText("Please clarify this.")).toBeTruthy();
    expect(screen.getByText("Looks good now.")).toBeTruthy();
    expect(screen.getByText("Resolved")).toBeTruthy();
  });

  it("shows a composer when a selection is active and submits with the chosen intent", async () => {
    let received: { target: unknown; body: string; intent: string } | null = null;
    const selection: PlannotatorSelection = { kind: "block", blockId: "p1", label: "Intro paragraph" };

    render(
      <Plannotator
        comments={[]}
        document={doc}
        selection={selection}
        onClearSelection={() => {}}
        onAddComment={async (input) => {
          received = input;
        }}
        onResolveComment={async () => {}}
      />,
    );

    expect(screen.getByText(/Commenting on: Intro paragraph/)).toBeTruthy();

    fireEvent.click(screen.getByText("Agent request"));
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Please refactor this block." } });
    fireEvent.click(screen.getByText("Post comment"));

    await waitFor(() => {
      expect(received).toEqual({
        target: { kind: "block", blockId: "p1" },
        body: "Please refactor this block.",
        intent: "agent-request",
      });
    });
  });

  it("calls onResolveComment when Resolve is clicked on an open comment", async () => {
    let resolvedId: string | null = null;
    render(
      <Plannotator
        comments={[blockComment()]}
        document={doc}
        selection={null}
        onClearSelection={() => {}}
        onAddComment={async () => {}}
        onResolveComment={async (id) => {
          resolvedId = id;
        }}
      />,
    );
    fireEvent.click(screen.getByText("Resolve"));
    await waitFor(() => {
      expect(resolvedId).toBe("c1");
    });
  });

  it("renders a target-removed badge and reason for dangling block targets, without crashing", () => {
    render(
      <Plannotator
        comments={[blockComment({ target: { kind: "block", blockId: "missing-block" } })]}
        document={doc}
        selection={null}
        onClearSelection={() => {}}
        onAddComment={async () => {}}
        onResolveComment={async () => {}}
      />,
    );
    expect(screen.getByText("Target removed")).toBeTruthy();
    expect(screen.getByText(/no longer exists/)).toBeTruthy();
  });

  it("renders a target-removed badge for a canvas-object comment whose canvas is absent from the LOADED index", () => {
    render(
      <Plannotator
        comments={[
          blockComment({
            id: "c3",
            target: { kind: "canvas-object", canvasSrc: "./assets/canvases/x.canvas.json", objectId: "shape-1" },
          }),
        ]}
        document={doc}
        canvases={{}}
        selection={null}
        onClearSelection={() => {}}
        onAddComment={async () => {}}
        onResolveComment={async () => {}}
      />,
    );
    expect(screen.getByText("Target removed")).toBeTruthy();
  });

  it("does NOT mark a canvas-object comment dangling while the canvas index is still loading (canvases undefined)", () => {
    render(
      <Plannotator
        comments={[
          blockComment({
            id: "c6",
            target: { kind: "canvas-object", canvasSrc: "./assets/canvases/x.canvas.json", objectId: "shape-1" },
          }),
        ]}
        document={doc}
        selection={null}
        onClearSelection={() => {}}
        onAddComment={async () => {}}
        onResolveComment={async () => {}}
      />,
    );
    expect(screen.queryByText("Target removed")).toBeNull();
  });

  it("renders a target-removed badge when the canvas is loaded but the object is missing", () => {
    render(
      <Plannotator
        comments={[
          blockComment({
            id: "c5",
            target: { kind: "canvas-object", canvasSrc: "./assets/canvases/x.canvas.json", objectId: "deleted-shape" },
          }),
        ]}
        document={doc}
        canvases={{
          "./assets/canvases/x.canvas.json": {
            objectIds: new Set(["shape-1"]),
            connectionIds: new Set(),
          },
        }}
        selection={null}
        onClearSelection={() => {}}
        onAddComment={async () => {}}
        onResolveComment={async () => {}}
      />,
    );
    expect(screen.getByText("Target removed")).toBeTruthy();
    expect(screen.getByText(/Canvas object "deleted-shape" no longer exists/)).toBeTruthy();
  });

  it("does not mark a canvas-object comment dangling when its canvas + object are present", () => {
    render(
      <Plannotator
        comments={[
          blockComment({
            id: "c4",
            target: { kind: "canvas-object", canvasSrc: "./assets/canvases/x.canvas.json", objectId: "shape-1" },
          }),
        ]}
        document={doc}
        canvases={{
          "./assets/canvases/x.canvas.json": {
            objectIds: new Set(["shape-1"]),
            connectionIds: new Set(),
          },
        }}
        selection={null}
        onClearSelection={() => {}}
        onAddComment={async () => {}}
        onResolveComment={async () => {}}
      />,
    );
    expect(screen.queryByText("Target removed")).toBeNull();
  });

  it("shows a Run agent button for an open agent-request comment when onRunAgent is provided", () => {
    render(
      <Plannotator
        comments={[blockComment({ intent: "agent-request" })]}
        document={doc}
        selection={null}
        onClearSelection={() => {}}
        onAddComment={async () => {}}
        onResolveComment={async () => {}}
        onRunAgent={async () => ({ ok: true, summary: "Done.", patchId: "p1", changedIds: [] })}
      />,
    );
    expect(screen.getByText("Run agent")).toBeTruthy();
  });

  it("does not show a Run agent button when onRunAgent is not provided", () => {
    render(
      <Plannotator
        comments={[blockComment({ intent: "agent-request" })]}
        document={doc}
        selection={null}
        onClearSelection={() => {}}
        onAddComment={async () => {}}
        onResolveComment={async () => {}}
      />,
    );
    expect(screen.queryByText("Run agent")).toBeNull();
  });

  it("does not show a Run agent button for a note-intent comment even when onRunAgent is provided", () => {
    render(
      <Plannotator
        comments={[blockComment({ intent: "note" })]}
        document={doc}
        selection={null}
        onClearSelection={() => {}}
        onAddComment={async () => {}}
        onResolveComment={async () => {}}
        onRunAgent={async () => ({ ok: true, summary: "Done.", patchId: "p1", changedIds: [] })}
      />,
    );
    expect(screen.queryByText("Run agent")).toBeNull();
  });

  it("calls onRunAgent with the comment id when Run agent is clicked", async () => {
    let requestedId: string | null = null;
    render(
      <Plannotator
        comments={[blockComment({ intent: "agent-request" })]}
        document={doc}
        selection={null}
        onClearSelection={() => {}}
        onAddComment={async () => {}}
        onResolveComment={async () => {}}
        onRunAgent={async (id) => {
          requestedId = id;
          return { ok: true, summary: "Done.", patchId: "p1", changedIds: [] };
        }}
      />,
    );
    fireEvent.click(screen.getByText("Run agent"));
    await waitFor(() => {
      expect(requestedId).toBe("c1");
    });
  });

  it("shows an Undo button for a comment with an agentRun when onUndoPatch is provided, and calls it with the patchId", async () => {
    let undonePatchId: string | null = null;
    render(
      <Plannotator
        comments={[
          blockComment({
            agentRun: { sessionId: "s1", patchId: "patch-1", summary: "Did the thing." },
          }),
        ]}
        document={doc}
        selection={null}
        onClearSelection={() => {}}
        onAddComment={async () => {}}
        onResolveComment={async () => {}}
        onUndoPatch={async (patchId) => {
          undonePatchId = patchId;
          return { ok: true };
        }}
      />,
    );
    expect(screen.getByText("Undo")).toBeTruthy();
    fireEvent.click(screen.getByText("Undo"));
    await waitFor(() => {
      expect(undonePatchId).toBe("patch-1");
    });
  });

  it("renders an inline error via data-plannotator-agent-error when onRunAgent resolves ok:false", async () => {
    render(
      <Plannotator
        comments={[blockComment({ intent: "agent-request" })]}
        document={doc}
        selection={null}
        onClearSelection={() => {}}
        onAddComment={async () => {}}
        onResolveComment={async () => {}}
        onRunAgent={async () => ({ ok: false, detail: "Something broke." })}
      />,
    );
    fireEvent.click(screen.getByText("Run agent"));
    await waitFor(() => {
      expect(document.querySelector("[data-plannotator-agent-error]")).toBeTruthy();
    });
    expect(screen.getByText("Something broke.")).toBeTruthy();
  });

  it("renders an inline error via data-plannotator-agent-error when onUndoPatch resolves ok:false", async () => {
    render(
      <Plannotator
        comments={[
          blockComment({
            agentRun: { sessionId: "s1", patchId: "patch-1", summary: "Did the thing." },
          }),
        ]}
        document={doc}
        selection={null}
        onClearSelection={() => {}}
        onAddComment={async () => {}}
        onResolveComment={async () => {}}
        onUndoPatch={async () => ({ ok: false, detail: "Undo failed." })}
      />,
    );
    fireEvent.click(screen.getByText("Undo"));
    await waitFor(() => {
      expect(document.querySelector("[data-plannotator-agent-error]")).toBeTruthy();
    });
    expect(screen.getByText("Undo failed.")).toBeTruthy();
  });
});
