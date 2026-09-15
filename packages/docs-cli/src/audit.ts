/**
 * `docs audit [docsRoot]` — machine-checks the corpus's structural standards
 * against the doc.json bundle tree. Replaces the markdown-era framework
 * `scripts/audit.py` (which scanned *.md frontmatter and reported nothing
 * useful on bundles).
 *
 * The walk classifies every directory under docsRoot as either a BUNDLE
 * (directly contains doc.json) or a SECTION (does not). Bundles are not
 * leaves: a section's introduction is the section folder's own doc.json, and
 * child doc directories beneath it are structure-checked and recursed into.
 * Inside a bundle, doc.json, annotations.json, index.md/index.mdx, and the
 * assets/ and canvases/ directories are the document's own reserved material,
 * not corpus children. Dotfiles (`.index` etc.) and node_modules are skipped;
 * plain files sitting in sections are ignored.
 *
 * Findings come at two severities:
 * - ERRORS (E1–E6) are structural/write invariants; any error makes the CLI exit 1.
 * - Shared authoring findings use each rule's audit policy. W1, W2, W4
 *   remain advisory. Required writing errors fail the audit.
 *
 * Checks:
 * - E1 duplicate two-digit prefix among sibling directories.
 * - E2 directory name not matching the `NN-` prefix convention.
 * - E3 a non-bundle section with >= 2 child doc directories lacking its own
 *   parent doc.json. The docs ROOT ITSELF IS EXEMPT: the top level is the
 *   layer folders (00-foundation / 10-system-design / 20-implementation),
 *   which deliberately have no root parent doc — the index/sidebar plays
 *   that role.
 * - E4 a leaf directory missing doc.json, or a bundle whose doc.json is
 *   unparseable or fails validateDocDocument.
 * - E5 a bundle that also contains a 00-overview child directory, mixing the
 *   parent-doc convention with the retired 00-overview convention.
 * - E6 a non-root block whose props fail the strict component-state schema.
 *   Root props are document metadata on an invisible container, not editable
 *   component state, and are deliberately exempt.
 * - W1 more than one level-1 heading block in a doc.
 * - W2 an image block without alt text.
 * - W4 first content block after the title is not a paragraph (missing
 *   opener).
 */
import { lintDocument, type LintFinding } from "@codecaine-ai/docs-model/lint";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  checkStateProps,
  validateDocDocument,
  type DocBlock,
  type DocDocument,
} from "@codecaine-ai/docs-model";

export type AuditCheckId = "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "W1" | "W2" | "W4" | LintFinding["ruleId"];

export type AuditFinding = {
  severity: "error" | "warn";
  checkId: AuditCheckId;
  /** Posix path relative to docsRoot; "." for the root itself. */
  path: string;
  message: string;
  blockId?: string;
  field?: string;
  docsPath?: string;
  suggestion?: string;
};

export type AuditReport = {
  findings: AuditFinding[];
  errorCount: number;
  warningCount: number;
};

const PREFIX_RE = /^\d{2}-/;
const BUNDLE_MATERIAL_DIRS = new Set(["assets", "canvases"]);

function shouldSkipEntry(name: string): boolean {
  return name.startsWith(".") || name === "node_modules";
}

/** Per-document content-convention warnings (W1, W2, W4) on a valid doc. */
function auditDocContent(doc: DocDocument, relPath: string, findings: AuditFinding[]): void {
  const blocks = Object.values(doc.blocks) as DocBlock[];

  // E6: readable legacy docs must not contain component props that make the
  // same block unwritable. The invisible root is metadata-bearing container
  // state and is not an editor-owned component surface.
  for (const block of blocks) {
    if (block.id === doc.root) continue;
    const issues = checkStateProps(block.type, block.props);
    if (issues.length === 0) continue;
    findings.push({
      severity: "error",
      checkId: "E6",
      path: relPath,
      message: `block "${block.id}" (${block.type}) has unwritable props: ${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    });
  }

  // Rule-owned audit metadata preserves legacy check IDs and warning policy.
  const report = lintDocument(doc, { phase: "complete" });
  for (const finding of report.findings) {
    findings.push({
      severity: (finding.audit?.severity ?? finding.severity) === "error" ? "error" : "warn",
      checkId: finding.audit?.id ?? finding.ruleId,
      path: relPath,
      message: finding.message,
      blockId: finding.blockId,
      field: finding.field,
      docsPath: finding.docsPath,
      suggestion: finding.suggestion,
    });
  }
}

/** E4 (parse/validation) + W1/W2/W4 for one bundle's doc.json. */
async function auditBundle(
  absPath: string,
  relPath: string,
  findings: AuditFinding[],
): Promise<void> {
  const docJsonPath = path.join(absPath, "doc.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(docJsonPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    findings.push({
      severity: "error",
      checkId: "E4",
      path: relPath,
      message: `doc.json is not valid JSON: ${message}`,
    });
    return;
  }

  const result = validateDocDocument(parsed);
  if (!result.ok) {
    const issues = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    findings.push({
      severity: "error",
      checkId: "E4",
      path: relPath,
      message: `doc.json failed validation: ${issues}`,
    });
    return;
  }

  auditDocContent(result.document as DocDocument, relPath, findings);
}

async function auditDirectory(
  absPath: string,
  relPath: string,
  isRoot: boolean,
  findings: AuditFinding[],
): Promise<void> {
  const entries = await readdir(absPath, { withFileTypes: true });
  const isBundle = entries.some((entry) => entry.isFile() && entry.name === "doc.json");
  const childDirs = entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !shouldSkipEntry(entry.name) &&
        (!isBundle || !BUNDLE_MATERIAL_DIRS.has(entry.name)),
    )
    .map((entry) => entry.name)
    .sort();

  if (isBundle) {
    await auditBundle(absPath, relPath, findings);

    // E5: parent-doc bundles cannot retain a child from the retired
    // 00-overview convention. Recursion still validates that child normally.
    if (childDirs.includes("00-overview")) {
      findings.push({
        severity: "error",
        checkId: "E5",
        path: relPath,
        message: `has both a parent doc.json and a 00-overview child; the 00-overview convention is retired`,
      });
    }
  }

  // A leaf directory without doc.json should have been a bundle.
  if (!isBundle && childDirs.length === 0) {
    findings.push({
      severity: "error",
      checkId: "E4",
      path: relPath,
      message: "missing doc.json",
    });
    return;
  }

  // E2: every corpus entry is NN-prefixed.
  const prefixed = childDirs.filter((name) => PREFIX_RE.test(name));
  for (const name of childDirs) {
    if (!PREFIX_RE.test(name)) {
      findings.push({
        severity: "error",
        checkId: "E2",
        path: relPath === "." ? name : `${relPath}/${name}`,
        message: `entry name does not match the NN- prefix convention`,
      });
    }
  }

  // E1: no two siblings share a two-digit prefix.
  const byPrefix = new Map<string, string[]>();
  for (const name of prefixed) {
    const prefix = name.slice(0, 2);
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), name]);
  }
  for (const [prefix, names] of byPrefix) {
    if (names.length > 1) {
      findings.push({
        severity: "error",
        checkId: "E1",
        path: relPath,
        message: `duplicate prefix "${prefix}" among siblings: ${names.join(", ")}`,
      });
    }
  }

  // E3: a non-root section with multiple children carries its introduction
  // as its own parent doc.json. The docs root itself is exempt (see module
  // header), as are sections with zero or one child.
  if (!isBundle && !isRoot && childDirs.length >= 2) {
    findings.push({
      severity: "error",
      checkId: "E3",
      path: relPath,
      message: `section has ${childDirs.length} children but no parent doc.json`,
    });
  }

  for (const name of childDirs) {
    await auditDirectory(
      path.join(absPath, name),
      relPath === "." ? name : `${relPath}/${name}`,
      false,
      findings,
    );
  }
}

/**
 * `docs audit [docsRoot]`: walks the parent-doc bundle tree. A section's
 * introduction is its folder's own doc.json; bundles are not leaves, so their
 * child doc directories receive sibling checks and are recursively audited.
 * The bundle-owned entries doc.json, annotations.json, index.md/index.mdx,
 * assets/, and canvases/ are not child doc directories.
 *
 * Structural/write errors are E1–E6, including E3 when a non-root, non-bundle
 * section has at least two children but no parent doc.json, and E5 when a
 * parent-doc bundle also has a retired 00-overview child. E6 rejects strict
 * component-state drift before an editor save discovers it. Content warnings
 * include W1, W2, and W4 plus shared writing and page rules. Callers should
 * exit non-zero when `errorCount > 0`; warnings never fail the run.
 */
export async function auditCommand(docsRootArg?: string): Promise<AuditReport> {
  const docsRoot = path.resolve(docsRootArg ?? "docs");
  const rootStats = await stat(docsRoot); // throws if missing — main() reports it
  if (!rootStats.isDirectory()) {
    throw new Error(`docs audit requires a directory, got: ${docsRoot}`);
  }

  const findings: AuditFinding[] = [];
  await auditDirectory(docsRoot, ".", true, findings);
  findings.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      a.checkId.localeCompare(b.checkId) ||
      a.message.localeCompare(b.message),
  );

  return {
    findings,
    errorCount: findings.filter((finding) => finding.severity === "error").length,
    warningCount: findings.filter((finding) => finding.severity === "warn").length,
  };
}
