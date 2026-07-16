import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  projectToMarkdown,
  serializeDocDocument,
  validateDocDocument,
} from "../packages/docs-model/src/index.ts";

const repoRoot = process.cwd();
const documentPath = join(
  repoRoot,
  "docs/10-system-design/30-packages/00-overview/doc.json",
);
const projectionPath = join(
  repoRoot,
  "packages/docs-model/src/__tests__/goldens/projection/docs__10-system-design__30-packages__00-overview.md",
);

const parsed: unknown = JSON.parse(await Bun.file(documentPath).text());
const result = validateDocDocument(parsed);

if (!result.ok) {
  throw new Error(`Document failed validation: ${JSON.stringify(result.issues)}`);
}

await Bun.write(documentPath, serializeDocDocument(result.document));
await mkdir(dirname(projectionPath), { recursive: true });
await Bun.write(projectionPath, projectToMarkdown(result.document));

console.log(`Rewrote ${documentPath}`);
console.log(`Wrote ${projectionPath}`);
