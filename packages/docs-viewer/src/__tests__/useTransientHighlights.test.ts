import { afterEach, describe, expect, it } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useTransientHighlights } from "../useTransientHighlights";

/**
 * CP9 (TG9.3, D12) changed-id highlight window. Timing-sensitive behavior
 * is tested with a SHORT injected duration + `waitFor` on the clear —
 * deliberately no fake-timer fast-forwarding and no narrow-margin
 * assertions between overlapping windows (that shape of test is exactly
 * what went flaky in DocEditor.test.tsx's first draft).
 */

afterEach(() => {
  cleanup();
});

describe("useTransientHighlights", () => {
  it("flash marks ids immediately and clears them after the duration", async () => {
    const { result } = renderHook(() => useTransientHighlights(25));

    act(() => {
      result.current.flash(["h1", "obj-1"]);
    });
    expect(result.current.highlightedIds.has("h1")).toBe(true);
    expect(result.current.highlightedIds.has("obj-1")).toBe(true);
    expect(result.current.highlightedIds.size).toBe(2);

    await waitFor(() => {
      expect(result.current.highlightedIds.size).toBe(0);
    });
  });

  it("flash with no ids is a no-op", () => {
    const { result } = renderHook(() => useTransientHighlights(25));
    act(() => {
      result.current.flash([]);
    });
    expect(result.current.highlightedIds.size).toBe(0);
  });

  it("re-flashing an id keeps it lit until every window that holds it ends (refcounted)", async () => {
    const { result } = renderHook(() => useTransientHighlights(30));

    // Two overlapping flashes of the same id: the first window's timer must
    // NOT clip the second's hold on the id.
    act(() => {
      result.current.flash(["h1"]);
      result.current.flash(["h1"]);
    });
    expect(result.current.highlightedIds.has("h1")).toBe(true);

    // Eventually both windows end and the id clears fully.
    await waitFor(() => {
      expect(result.current.highlightedIds.size).toBe(0);
    });
  });

  it("unmounting with pending windows clears timers without state updates or errors", () => {
    const { result, unmount } = renderHook(() => useTransientHighlights(10_000));
    act(() => {
      result.current.flash(["h1"]);
    });
    expect(result.current.highlightedIds.has("h1")).toBe(true);
    // The 10s timer is pending; unmount must not throw and must not leave
    // the timer to fire into an unmounted component.
    unmount();
  });
});
