/**
 * Turns a word diff into markup: <del> for removed words, <ins> for added words. A structural
 * rewrite (a lead line plus "- " bullet lines, "  - " for a sub-bullet) renders as a real nested
 * list, with deleted words left where they were.
 */
import { diffWords, type DiffSegment } from "./diff";
import { prose } from "./html";

interface Line {
  segments: DiffSegment[];
  /** 0 for a plain line, 1 for a bullet, 2 for a sub-bullet, and so on. */
  depth: number;
}

/** Deeper than this, a bullet renders at this depth. */
const MAX_DEPTH = 4;

/** The inline diff of one change, as block HTML (<p> lines and <ul> bullet runs). */
export function diffHtml(before: string, after: string): string {
  return linesHtml(toLines(diffWords(before, after)));
}

/** One text with no diff marks, laid out the same way (a lead plus a list when it has bullets). */
export function textHtml(text: string): string {
  return linesHtml(toLines([{ op: "eq", text }]));
}

/** Splits at each "\n" in kept or inserted text. A deleted "\n" stays inline as a space. */
function toLines(segments: readonly DiffSegment[]): Line[] {
  const lines: Line[] = [{ segments: [], depth: 0 }];
  const current = () => lines[lines.length - 1]!;
  for (const seg of segments) {
    if (seg.op === "del") {
      current().segments.push({ op: "del", text: seg.text.replace(/\n/g, " ") });
      continue;
    }
    seg.text.split("\n").forEach((part, k) => {
      if (k > 0) lines.push({ segments: [], depth: 0 });
      if (part) current().segments.push({ op: seg.op, text: part });
    });
  }
  return lines.map(markBullet);
}

/**
 * A line whose kept or inserted text starts with "- " is a bullet. Each 2 spaces of indent (a tab
 * counts as 2) add one level, so "  - " is a sub-bullet. The marker and indent are dropped.
 */
function markBullet(line: Line): Line {
  const visible = line.segments
    .filter((seg) => seg.op !== "del")
    .map((seg) => seg.text)
    .join("");
  const marker = /^([ \t]*)- /.exec(visible);
  if (!marker) return line;
  const indent = marker[1]!.replace(/\t/g, "  ").length;
  const depth = Math.min(MAX_DEPTH, 1 + Math.floor(indent / 2));
  let drop = marker[0].length;
  const segments: DiffSegment[] = [];
  for (const seg of line.segments) {
    if (drop > 0 && seg.op !== "del") {
      const cut = Math.min(drop, seg.text.length);
      drop -= cut;
      if (seg.text.length > cut) segments.push({ op: seg.op, text: seg.text.slice(cut) });
      continue;
    }
    segments.push(seg);
  }
  return { segments, depth };
}

function segmentHtml(seg: DiffSegment): string {
  const html = prose(seg.text);
  if (seg.op === "del") return `<del>${html}</del>`;
  if (seg.op === "ins") return `<ins>${html}</ins>`;
  return html;
}

/**
 * Plain lines become <p>. Bullet runs become <ul>, and a deeper bullet opens a <ul> inside the
 * open <li> above it. A bullet never skips a level: one that does renders one level deeper.
 */
function linesHtml(lines: readonly Line[]): string {
  let html = "";
  let open = 0;
  const closeTo = (depth: number) => {
    for (; open > depth; open--) html += "</li></ul>";
  };
  for (const line of lines) {
    const body = line.segments.map(segmentHtml).join("");
    if (line.depth === 0) {
      if (!body.trim()) continue;
      closeTo(0);
      html += `<p>${body}</p>`;
      continue;
    }
    const depth = Math.min(line.depth, open + 1);
    if (depth > open) {
      html += `<ul><li>${body}`;
      open = depth;
      continue;
    }
    closeTo(depth);
    html += `</li><li>${body}`;
  }
  closeTo(0);
  return html;
}
