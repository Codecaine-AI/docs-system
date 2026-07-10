/**
 * Docs annotation target/anchor shapes, mirrored from Spectre
 * lib/projects-api (type-only — docs-targeting.ts builds these; the host
 * owns whatever HTTP contract persists them).
 */

export interface DocsSourceRange {
  start_offset: number;
  end_offset: number;
}

export type DocsTargetKind =
  | "text_range"
  | "block"
  | "visual_point"
  | "custom_element";

export interface DocsTarget {
  kind: DocsTargetKind;
  label: string;
  block_id?: string | null;
  block_type?: string | null;
  text_quote?: string;
  source_range?: DocsSourceRange | null;
  x?: number;
  y?: number;
  element_id?: string;
  element_type?: string;
}

export interface DocsAnchor {
  document_path: string;
  content_hash: string;
  block_id?: string | null;
  source_range?: DocsSourceRange | null;
  text_quote: string;
  context_before?: string;
  context_after?: string;
  target_kind?: string;
  target?: DocsTarget;
}
