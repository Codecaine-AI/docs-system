/**
 * Source-text readers for the suites that pin stylesheet and source text.
 * Pass 3 split two files the suites read whole:
 * - theme/semantic.css (1367 lines) into five sheets of at most 400 lines. The light and the dark
 *   block were each cut once and reopened with the same selector, so readSemanticCss re-joins the
 *   parts (dropping the two added closes and the two reopened selector lines) and returns the
 *   original text.
 * - DocPage.tsx into the _components/DocPage/ folder: readDocPageSource returns every source file
 *   of that folder, outside lab/ (the old file's content).
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SEMANTIC_PARTS = [
  "semantic.css",
  "semantic-light-blocks.css",
  "semantic-dark.css",
  "semantic-dark-blocks.css",
  "semantic-roles.css",
];

export function readSemanticCss(read: (url: URL) => string): string {
  const [head, lightRest, dark, darkRest, roles] = SEMANTIC_PARTS.map((name) =>
    read(new URL(`../theme/${name}`, import.meta.url)),
  ) as [string, string, string, string, string];
  const dropClose = (text: string) => text.slice(0, text.lastIndexOf("}\n"));
  const dropSelector = (text: string) => text.slice(text.indexOf("\n") + 1);
  return dropClose(head) + dropSelector(lightRest) + dropClose(dark) + dropSelector(darkRest) + roles;
}

export function readDocPageSource(read: (url: URL) => string): string {
  const root = join(import.meta.dir, "..", "_components", "DocPage");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name !== "lab") walk(path);
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk(root);
  return files.map((path) => read(pathToFileURL(path))).join("\n");
}
