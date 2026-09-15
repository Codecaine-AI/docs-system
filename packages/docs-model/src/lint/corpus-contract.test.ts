import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { lintRules, lintDocument } from "./index";
import { validateDocDocument } from "../doc-schema";
import { projectToMarkdown } from "../project-markdown";

const docsRoot = resolve(import.meta.dir, "../../../../docs");
async function corpusDoc(path: string) {
  const result = validateDocDocument(JSON.parse(await readFile(resolve(docsRoot, path, "doc.json"), "utf8")));
  if (!result.ok) throw new Error(`Invalid rule source ${path}: ${JSON.stringify(result.issues)}`);
  return result.document;
}

test("every lint references valid corpus guidance and appears in the loaded lint standard", async () => {
  const catalog = await corpusDoc("10-system-design/10-doc-standards/80-authoring-lints");
  const rendered = projectToMarkdown(catalog);
  for (const rule of lintRules) {
    expect(rendered).toContain(rule.id);
    const source = await corpusDoc(rule.docsPath);
    expect(lintDocument(source, { phase: "complete" }).blocking).toEqual([]);
  }
  expect(lintDocument(catalog, { phase: "complete" }).blocking).toEqual([]);
});
