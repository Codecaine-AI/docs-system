import { dirname, join, resolve } from "node:path";

import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { serializeDocDocument, validateDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { AnnotationsDocument, AnnotationTarget } from "@codecaine-ai/docs-model/annotations-schema";
import { validateAnnotationsDocument } from "@codecaine-ai/docs-model/annotations-schema";
import { projectToMarkdown } from "@codecaine-ai/docs-model/project-markdown";
import { isSafeRelativePath, resolveDocBundleJsonPath } from "@codecaine-ai/docs-index/paths";
import { checkDocsPath, docsFs } from "@codecaine-ai/docs-index/safe-path";

import { createContentHash } from "./content-hash";

/**
 * Doc-bundle loading + annotations sidecar read/write. This is the single
 * source of truth for the bundle wire shapes — both the standalone serve
 * app's `GET /api/bundle` and any host app's project-scoped bundle routes
 * delegate here, so responses stay shape-identical everywhere. The sidecar
 * file is `annotations.json`, full stop. Every read and write goes through
 * the docs-root chokepoint (@codecaine-ai/docs-index/safe-path).
 */

export { createContentHash };

/** The annotations sidecar filename (sibling of a bundle's doc.json). */
export const ANNOTATIONS_SIDECAR_FILENAME = "annotations.json";

/**
 * Normalizes a `docs/`-relative bundle reference (folder, `doc.json` path,
 * or bare path) down to the bundle-relative folder path.
 */
export function normalizeBundlePath(path: string): string {
  const withForwardSlashes = path.replaceAll("\\", "/");
  if (withForwardSlashes.toLowerCase() === "doc.json") return "";
  if (withForwardSlashes.toLowerCase().endsWith("/doc.json")) {
    return withForwardSlashes.slice(0, -"/doc.json".length);
  }
  if (withForwardSlashes.toLowerCase().endsWith(".json")) {
    return withForwardSlashes.slice(0, -".json".length);
  }
  return withForwardSlashes.replace(/\/+$/, "");
}

export type DocBundleLoadResult = {
  docsRoot: string;
  docsRootResolved: string;
  bundlePath: string;
  jsonAbs: string;
  /** Canonical annotations sidecar path (annotations.json) — where writes go. */
  annotationsAbs: string;
  raw: string;
  document: DocDocument;
  docHash: string;
  annotations: AnnotationsDocument | null;
  annotationsHash: string | null;
};

export type DocBundleLoadError = { error: { status: number; detail: string } };

/**
 * Loads + validates a doc bundle's `doc.json` together with its sibling
 * `annotations.json`, if present, from the SAME bundle folder.
 * `annotations.json` absence is a valid empty state, not an error; presence
 * with invalid content IS a clear error (never silently dropped).
 */
export async function loadDocBundle(
  docsRoot: string,
  path: string,
): Promise<DocBundleLoadResult | DocBundleLoadError> {
  const jsonAbs = resolveDocBundleJsonPath(docsRoot, path);
  if (!jsonAbs) {
    // A malformed project policy refuses every path; say so instead of "invalid path".
    const checked = isSafeRelativePath(path) ? checkDocsPath(docsRoot, path, "read") : undefined;
    if (checked && !checked.ok && checked.reason === "policy-invalid") {
      return { error: { status: checked.status, detail: checked.detail } };
    }
    return { error: { status: 400, detail: `Invalid docs path: ${path}` } };
  }

  const fs = docsFs(docsRoot);
  let raw: string;
  try {
    raw = await fs.readFile(jsonAbs, "utf8");
  } catch {
    return { error: { status: 404, detail: `Doc bundle not found: ${path}` } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: { status: 422, detail: `Doc bundle is not valid JSON: ${path}` } };
  }

  const validated = validateDocDocument(parsed);
  if (!validated.ok) {
    return {
      error: {
        status: 422,
        detail: `Doc bundle failed schema validation: ${validated.issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`,
      },
    };
  }

  const docsRootResolved = resolve(docsRoot);
  const bundlePath = normalizeBundlePath(path);
  const annotationsAbs = join(dirname(jsonAbs), ANNOTATIONS_SIDECAR_FILENAME);

  let annotations: AnnotationsDocument | null = null;
  let annotationsHash: string | null = null;
  let annotationsRaw: string | null = null;
  try {
    annotationsRaw = await fs.readFile(annotationsAbs, "utf8");
  } catch {
    annotationsRaw = null;
  }
  if (annotationsRaw !== null) {
    let annotationsParsed: unknown;
    try {
      annotationsParsed = JSON.parse(annotationsRaw);
    } catch {
      return {
        error: {
          status: 422,
          detail: `Annotations sidecar is not valid JSON: ${path}/${ANNOTATIONS_SIDECAR_FILENAME}`,
        },
      };
    }
    const annotationsValidated = validateAnnotationsDocument(annotationsParsed);
    if (!annotationsValidated.ok) {
      return {
        error: {
          status: 422,
          detail: `Annotations sidecar failed schema validation: ${annotationsValidated.issues
            .map((issue) => `${issue.path}: ${issue.message}`)
            .join("; ")}`,
        },
      };
    }
    annotations = annotationsValidated.document;
    annotationsHash = createContentHash(annotationsRaw);
  }

  return {
    docsRoot,
    docsRootResolved,
    bundlePath,
    jsonAbs,
    annotationsAbs,
    raw,
    document: validated.document,
    docHash: createContentHash(serializeDocDocument(validated.document)),
    annotations,
    annotationsHash,
  };
}

/**
 * The wire shape both `GET /api/bundle` and exported per-bundle JSON
 * snapshots use.
 */
export function bundleResponse(loaded: DocBundleLoadResult) {
  return {
    path: loaded.bundlePath,
    document_path: `docs/${loaded.bundlePath}`,
    doc: loaded.document,
    doc_hash: loaded.docHash,
    annotations: loaded.annotations,
    annotations_hash: loaded.annotationsHash,
  };
}

export type DocProjectionResult = { markdown: string };

/** Loads a bundle's doc.json and projects it to markdown (read-only). */
export async function loadDocProjection(
  docsRoot: string,
  path: string,
): Promise<DocProjectionResult | DocBundleLoadError> {
  const loaded = await loadDocBundle(docsRoot, path);
  if ("error" in loaded) return loaded;
  return { markdown: projectToMarkdown(loaded.document) };
}

// ---------------------------------------------------------------------------
// Annotations sidecar primitives
// ---------------------------------------------------------------------------

export const EMPTY_ANNOTATIONS_DOCUMENT: AnnotationsDocument = { schemaVersion: 1, annotations: [] };

type AnnotationsSidecarReadResult =
  | { ok: true; annotations: AnnotationsDocument; hash: string | null }
  | { error: { status: number; detail: string } };

/**
 * Reads + validates a bundle's `annotations.json` sidecar directly (the GET
 * annotations route uses this rather than `loadDocBundle`, since fetching
 * annotations shouldn't require the doc.json to itself be valid). Absence is
 * a valid empty state — never a 404.
 */
export async function readAnnotationsSidecar(
  annotationsAbs: string,
): Promise<AnnotationsSidecarReadResult>;
export async function readAnnotationsSidecar(
  docsRoot: string,
  annotationsAbs: string,
): Promise<AnnotationsSidecarReadResult>;
export async function readAnnotationsSidecar(
  first: string,
  second?: string,
): Promise<AnnotationsSidecarReadResult> {
  // Legacy one-argument form: confined to the sidecar's own bundle folder,
  // still under every project policy that governs that folder.
  const [docsRoot, annotationsAbs] = second === undefined ? [dirname(first), first] : [first, second];
  let raw: string;
  try {
    raw = await docsFs(docsRoot).readFile(annotationsAbs, "utf8");
  } catch (error) {
    // A refused path is never read; it is not an empty sidecar either.
    if ((error as NodeJS.ErrnoException).code === "EDOCSREFUSED") {
      return { error: { status: (error as { status: number }).status, detail: (error as Error).message } };
    }
    return { ok: true, annotations: EMPTY_ANNOTATIONS_DOCUMENT, hash: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: { status: 422, detail: "Annotations sidecar is not valid JSON" } };
  }
  const validated = validateAnnotationsDocument(parsed);
  if (!validated.ok) {
    return {
      error: {
        status: 422,
        detail: `Annotations sidecar failed schema validation: ${validated.issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`,
      },
    };
  }
  return { ok: true, annotations: validated.document, hash: createContentHash(raw) };
}

/** Atomically persists an annotations document; returns content + hash. */
export async function writeAnnotationsSidecar(
  annotationsAbs: string,
  document: AnnotationsDocument,
): Promise<{ content: string; hash: string }>;
export async function writeAnnotationsSidecar(
  docsRoot: string,
  annotationsAbs: string,
  document: AnnotationsDocument,
): Promise<{ content: string; hash: string }>;
export async function writeAnnotationsSidecar(
  first: string,
  second: string | AnnotationsDocument,
  third?: AnnotationsDocument,
): Promise<{ content: string; hash: string }> {
  // Legacy two-argument form: confined to the sidecar's own bundle folder.
  const [docsRoot, annotationsAbs, document] =
    typeof second === "string" ? [first, second, third as AnnotationsDocument] : [dirname(first), first, second];
  const content = `${JSON.stringify(document, null, 2)}\n`;
  await docsFs(docsRoot).atomicWrite(annotationsAbs, content);
  return { content, hash: createContentHash(content) };
}

/** Structural check for an annotation target (block, canvas-object, or text-range). */
export function isValidAnnotationTarget(value: unknown): value is AnnotationTarget {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.kind === "block") {
    return typeof record.blockId === "string" && record.blockId.length > 0;
  }
  if (record.kind === "canvas-object") {
    const hasCanvasSrc = typeof record.canvasSrc === "string" && record.canvasSrc.length > 0;
    const selectorCount = [
      record.objectId !== undefined,
      record.connectionId !== undefined,
      record.region !== undefined,
    ].filter(Boolean).length;
    return hasCanvasSrc && selectorCount === 1;
  }
  if (record.kind === "text-range") {
    return (
      typeof record.blockId === "string" &&
      record.blockId.length > 0 &&
      typeof record.start === "number" &&
      Number.isInteger(record.start) &&
      record.start >= 0 &&
      typeof record.end === "number" &&
      Number.isInteger(record.end) &&
      record.end > record.start &&
      typeof record.quote === "string" &&
      record.quote.length > 0
    );
  }
  return false;
}
