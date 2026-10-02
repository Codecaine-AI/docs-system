"use client";

import { Type } from "@sinclair/typebox";
import type { DeltaSpan, DocBlock, DocValidationIssue } from "../../doc-schema";
import { deltaToPlainTextInline } from "../../delta-markdown";

export const PSEUDOCODE_MARKERS = ["+", "-", " "] as const;

export type PseudocodeMarker = (typeof PSEUDOCODE_MARKERS)[number];

/** One pseudocode line; `marker` is the diff gutter and is only read when the block has `diff: true`. */
export type PseudocodeLine = { text: string; marker?: PseudocodeMarker };

export const markerSchema = (description: string) =>
  Type.Union([Type.Literal("+"), Type.Literal("-"), Type.Literal(" ")], { description });

export const lineTextSchema = (description: string) => Type.String({ description });

export function isDiff(block: DocBlock): boolean {
  return block.props.diff === true;
}

/** Splits the block text into lines; in diff mode the leading +, - or space becomes the marker. No text reads as zero lines. */
export function readPseudocodeLines(block: DocBlock): PseudocodeLine[] {
  const raw = deltaToPlainTextInline(block.text);
  if (raw.length === 0) return [];
  const diff = isDiff(block);
  return raw.split("\n").map((line) => {
    if (!diff) return { text: line };
    const head = line.charAt(0);
    if (head === "+" || head === "-" || head === " ") return { text: line.slice(1), marker: head };
    return { text: line, marker: " " };
  });
}

/** Joins lines back into plain delta text; diff mode writes each marker (default space) in front of its line. */
export function writePseudocodeLines(lines: readonly PseudocodeLine[], diff: boolean): DeltaSpan[] {
  if (lines.length === 0) return [];
  const body = lines.map((line) => (diff ? (line.marker ?? " ") + line.text : line.text)).join("\n");
  return [{ insert: body }];
}

function paramIssue(name: string, message: string): DocValidationIssue {
  return { path: `$.params.${name}`, message };
}

/** A line's text must stay on one line. */
export function checkLineText(text: string, name: string, issues: DocValidationIssue[]): void {
  if (text.includes("\n")) issues.push(paramIssue(name, "Line text must not contain a newline; insert one line per call."));
}

/** A marker only means something on a diff block. */
export function checkMarkerAllowed(
  marker: unknown,
  diff: boolean,
  name: string,
  issues: DocValidationIssue[],
): void {
  if (marker !== undefined && marker !== null && !diff) {
    issues.push(paramIssue(name, 'Markers need a diff block; set diff: true first (pseudocode.setLines can set it).'));
  }
}

export function checkLineIndex(
  index: number,
  count: number,
  allowEnd: boolean,
  issues: DocValidationIssue[],
): boolean {
  const max = allowEnd ? count : count - 1;
  if (index < 0 || index > max) {
    issues.push(
      paramIssue(
        "index",
        count === 0 && !allowEnd
          ? `Line index ${index} is out of range; the pseudocode has no lines.`
          : `Line index ${index} is out of range [0, ${max}].`,
      ),
    );
    return false;
  }
  return true;
}
