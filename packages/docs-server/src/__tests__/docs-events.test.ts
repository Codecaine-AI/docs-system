import { describe, expect, test } from "bun:test";
import { publishDocsChangeEvent, subscribeToDocsChangeEvents, subscriberCountForTest } from "../docs-events";

describe("docs-events: in-process pub/sub (CP9, TG9.3)", () => {
  test("a subscriber receives events published for its own project", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeToDocsChangeEvents("project-1", (event) => received.push(event));
    try {
      publishDocsChangeEvent("project-1", {
        path: "guide",
        changedIds: ["h1"],
        patchId: "patch-1",
        actor: "agent-session-1",
      });
      expect(received).toEqual([
        { path: "guide", changedIds: ["h1"], patchId: "patch-1", actor: "agent-session-1" },
      ]);
    } finally {
      unsubscribe();
    }
  });

  test("events for a different project are not delivered", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeToDocsChangeEvents("project-1", (event) => received.push(event));
    try {
      publishDocsChangeEvent("project-2", {
        path: "guide",
        changedIds: ["h1"],
        patchId: "patch-1",
        actor: "agent-session-1",
      });
      expect(received).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  test("unsubscribe stops further delivery and cleans up the empty listener set", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeToDocsChangeEvents("project-3", (event) => received.push(event));
    expect(subscriberCountForTest("project-3")).toBe(1);
    unsubscribe();
    expect(subscriberCountForTest("project-3")).toBe(0);

    publishDocsChangeEvent("project-3", {
      path: "guide",
      changedIds: ["h1"],
      patchId: "patch-1",
      actor: "agent-session-1",
    });
    expect(received).toEqual([]);
  });

  test("publishing with no subscribers is a safe no-op", () => {
    expect(() =>
      publishDocsChangeEvent("project-with-no-subscribers", {
        path: "guide",
        changedIds: [],
        patchId: "patch-1",
        actor: "agent-session-1",
      }),
    ).not.toThrow();
  });

  test("multiple subscribers on the same project all receive the event", () => {
    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    const unsubA = subscribeToDocsChangeEvents("project-4", (event) => receivedA.push(event));
    const unsubB = subscribeToDocsChangeEvents("project-4", (event) => receivedB.push(event));
    try {
      publishDocsChangeEvent("project-4", {
        path: "guide",
        changedIds: ["h1"],
        patchId: "patch-1",
        actor: "agent-session-1",
      });
      expect(receivedA).toHaveLength(1);
      expect(receivedB).toHaveLength(1);
    } finally {
      unsubA();
      unsubB();
    }
  });
});
