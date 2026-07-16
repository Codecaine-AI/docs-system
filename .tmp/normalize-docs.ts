import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
  projectToMarkdown,
  serializeDocDocument,
  validateDocDocument,
} from "../packages/docs-model/src/index.ts";

const REPO_ROOT = process.cwd();
const PROJECTION_ROOT = join(
  REPO_ROOT,
  "packages/docs-model/src/__tests__/goldens/projection",
);

interface Summary {
  documents: number;
  normalized: number;
  canonical: number;
  projectionsWritten: number;
  projectionsUnchanged: number;
  failures: number;
}

function projectionPath(relativeDocumentPath: string): string {
  const filename = relativeDocumentPath
    .replace(/\/doc\.json$/, "")
    .replaceAll("/", "__") + ".md";
  return join(PROJECTION_ROOT, filename);
}

async function normalizeDocument(
  relativePath: string,
  summary: Summary,
): Promise<void> {
  const documentPath = join(REPO_ROOT, relativePath);
  const bytes = await Bun.file(documentPath).text();
  const parsed: unknown = JSON.parse(bytes);
  const result = validateDocDocument(parsed);

  if (!result.ok) {
    throw new Error(
      `${relativePath} failed validation: ${JSON.stringify(result.issues)}`,
    );
  }

  const canonical = serializeDocDocument(result.document);
  if (canonical === bytes) {
    summary.canonical += 1;
    console.log(`${relativePath}: already canonical`);
  } else {
    await Bun.write(documentPath, canonical);
    summary.normalized += 1;
    console.log(`${relativePath}: normalized`);
  }

  const relativeProjectionPath = projectionPath(relativePath);
  const projection = projectToMarkdown(result.document);
  const existingProjectionFile = Bun.file(relativeProjectionPath);
  const existingProjection = await existingProjectionFile.exists()
    ? await existingProjectionFile.text()
    : undefined;

  if (existingProjection === projection) {
    summary.projectionsUnchanged += 1;
    console.log(`${relativeProjectionPath}: unchanged`);
  } else {
    await Bun.write(relativeProjectionPath, projection);
    summary.projectionsWritten += 1;
    console.log(`${relativeProjectionPath}: written`);
  }
}

async function main(): Promise<void> {
  const paths = Array.from(
    new Bun.Glob("docs/**/doc.json").scanSync({ cwd: REPO_ROOT }),
  ).sort();
  const summary: Summary = {
    documents: paths.length,
    normalized: 0,
    canonical: 0,
    projectionsWritten: 0,
    projectionsUnchanged: 0,
    failures: 0,
  };

  await mkdir(PROJECTION_ROOT, { recursive: true });

  for (const relativePath of paths) {
    try {
      await normalizeDocument(relativePath, summary);
    } catch (error) {
      summary.failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${relativePath}: failed: ${message}`);
    }
  }

  console.log(
    `Summary: ${summary.documents} documents; ` +
      `${summary.normalized} normalized, ${summary.canonical} already canonical; ` +
      `${summary.projectionsWritten} projections written, ` +
      `${summary.projectionsUnchanged} unchanged; ${summary.failures} failures.`,
  );

  if (summary.failures > 0) {
    process.exitCode = 1;
  }
}

await main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`Normalization aborted: ${message}`);
  process.exitCode = 1;
});
