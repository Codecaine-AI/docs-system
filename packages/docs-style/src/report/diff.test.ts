import { describe, expect, test } from "bun:test";
import { diffWords, type DiffSegment } from "./diff";
import { diffHtml, textHtml } from "./diff-html";

const words = (segments: DiffSegment[], op: DiffSegment["op"]) => segments.filter((s) => s.op === op).map((s) => s.text.trim());
const rebuild = (segments: DiffSegment[], drop: DiffSegment["op"]) =>
  segments
    .filter((s) => s.op !== drop)
    .map((s) => s.text)
    .join("");

describe("word diff", () => {
  test("marks the removed and the added words, and keeps both texts whole", () => {
    const before = "Run the check in order to utilize the cache.";
    const after = "Run the check to use the cache.";
    const segments = diffWords(before, after);

    expect(words(segments, "del")).toEqual(["in order", "utilize"]);
    expect(words(segments, "ins")).toEqual(["use"]);
    expect(rebuild(segments, "ins")).toBe(before);
    expect(rebuild(segments, "del")).toBe(after);
  });

  test("renders a structural rewrite as a lead plus a real nested list, with deletions in place", () => {
    const html = diffHtml("Keep one runtime; a replacement waits for leases.", "Keep one runtime.\n- A replacement waits for leases.");

    expect(html).toBe("<p>Keep one runtime<del>; a</del><ins>.</ins></p><ul><li><ins>A</ins> replacement waits for leases.</li></ul>");
    expect(textHtml("Lead.\n- One.\n  - One detail.\n- Two.")).toBe(
      "<p>Lead.</p><ul><li>One.<ul><li>One detail.</li></ul></li><li>Two.</li></ul>",
    );
  });
});
