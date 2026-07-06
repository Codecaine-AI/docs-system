"use client";

/**
 * Shared reference identity (D27, design doc §9.2): one link model used by
 * both doc.json delta `reference` spans and canvas `links[].target`. Lives in
 * docs-model as the neutral home — interactive-canvas imports this type and
 * aliases its on-disk `InteractiveCanvasLink.target` shape to it (see
 * schema.ts). docs-model itself must never import from interactive-canvas.
 */
export type SpectreRef = {
  kind: "doc" | "source";
  /** Repo-relative path (D27) — no registry/absolute paths in v1. */
  path: string;
  symbol?: string;
  line?: number;
  section?: string;
  label?: string;
};

export type SpectreRefValidationIssue = {
  path: string;
  message: string;
};

export type SpectreRefValidationResult =
  | { ok: true; ref: SpectreRef }
  | { ok: false; issues: SpectreRefValidationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validates a raw value as a SpectreRef. Pure, no throw — returns a typed
 * issue list on failure (mirrors interactive-canvas/schema.ts style).
 */
export function validateSpectreRef(value: unknown, path = "$"): SpectreRefValidationResult {
  const issues: SpectreRefValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path, message: "Reference must be an object." }] };
  }
  if (value.kind !== "doc" && value.kind !== "source") {
    issues.push({ path: `${path}.kind`, message: 'Reference kind must be "doc" or "source".' });
  }
  if (typeof value.path !== "string" || value.path.trim().length === 0) {
    issues.push({ path: `${path}.path`, message: "Reference requires a non-empty repo-relative path." });
  }
  if (value.symbol !== undefined && typeof value.symbol !== "string") {
    issues.push({ path: `${path}.symbol`, message: "Reference symbol must be a string." });
  }
  if (value.line !== undefined && !isFiniteNumber(value.line)) {
    issues.push({ path: `${path}.line`, message: "Reference line must be a finite number." });
  }
  if (value.section !== undefined && typeof value.section !== "string") {
    issues.push({ path: `${path}.section`, message: "Reference section must be a string." });
  }
  if (value.label !== undefined && typeof value.label !== "string") {
    issues.push({ path: `${path}.label`, message: "Reference label must be a string." });
  }
  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    ref: {
      kind: value.kind as "doc" | "source",
      path: value.path as string,
      symbol: typeof value.symbol === "string" ? value.symbol : undefined,
      line: isFiniteNumber(value.line) ? value.line : undefined,
      section: typeof value.section === "string" ? value.section : undefined,
      label: typeof value.label === "string" ? value.label : undefined,
    },
  };
}
