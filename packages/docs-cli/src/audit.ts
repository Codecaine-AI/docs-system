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
 * Inside a bundle, doc.json, comments.json, index.md/index.mdx, and the
 * assets/ and canvases/ directories are the document's own reserved material,
 * not corpus children. Dotfiles (`.index` etc.) and node_modules are skipped;
 * plain files sitting in sections are ignored.
 *
 * Findings come at two severities:
 * - ERRORS (E1–E5) are structural invariants; any error makes the CLI exit 1.
 * - WARNINGS (W1, W2, W4) are content conventions, printed but never failing —
 *   read-through fodder, to be promoted to errors after Ford's corpus pass.
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
 * - W1 more than one level-1 heading block in a doc.
 * - W2 an image block without alt text.
 * - W4 first content block after the title is not a paragraph (missing
 *   opener).
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { validateDocDocument, type DocBlock, type DocDocument } from "@codecaine-ai/docs-model";

export type AuditCheckId = "E1" | "E2" | "E3" | "E4" | "E5" | "W1" | "W2" | "W4";

export type AuditFinding = {
  severity: "error" | "warn";
  checkId: AuditCheckId;
  /** Posix path relative to docsRoot; "." for the root itself. */
  path: string;
  message: string;
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

  const levelOneHeadings = blocks.filter(
    (block) => block.type === "heading" && block.props.level === 1,
  );
  if (levelOneHeadings.length > 1) {
    findings.push({
      severity: "warn",
      checkId: "W1",
      path: relPath,
      message: `found ${levelOneHeadings.length} level-1 headings; expected exactly one`,
    });
  }

  for (const block of blocks) {
    if (block.type !== "image") continue;
    const alt = block.props.alt;
    if (typeof alt !== "string" || alt.trim() === "") {
      findings.push({
        severity: "warn",
        checkId: "W2",
        path: relPath,
        message: `image block "${block.id}" is missing alt text`,
      });
    }
  }

  // W4: the first content block — after optionally skipping one leading
  // level-1 title heading — should be an opening paragraph.
  const rootBlock = doc.blocks[doc.root];
  const sequence = (rootBlock?.children ?? [])
    .map((childId) => doc.blocks[childId])
    .filter((block): block is DocBlock => block !== undefined);
  let index = 0;
  if (sequence[index]?.type === "heading" && sequence[index]?.props.level === 1) index += 1;
  const opener = sequence[index];
  if (opener?.type !== "paragraph") {
    findings.push({
      severity: "warn",
      checkId: "W4",
      path: relPath,
      message: `first content block after the title is ${opener ? `"${opener.type}"` : "absent"}; expected an opening paragraph`,
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
 * The bundle-owned entries doc.json, comments.json, index.md/index.mdx,
 * assets/, and canvases/ are not child doc directories.
 *
 * Structural errors are E1–E5, including E3 when a non-root, non-bundle
 * section has at least two children but no parent doc.json, and E5 when a
 * parent-doc bundle also has a retired 00-overview child. Content warnings are
 * W1, W2, and W4. Callers should exit non-zero when `errorCount > 0`;
 * warnings never fail the run.
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
