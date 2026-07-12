import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { ALL_COMPONENTS } from "@codecaine-ai/docs-model";

const componentsDir = join(import.meta.dir, "../components");
const componentFolders = (await readdir(componentsDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const modelComponents = ALL_COMPONENTS.map((component) => component.manifest.name).sort();

describe("docs-viewer component folder mirror", () => {
  it("has a folder for every docs-model component", () => {
    const missingFolders = modelComponents.filter(
      (component) => !componentFolders.includes(component),
    );

    expect(missingFolders).toEqual([]);
  });

  it("has no unexpected component folders", () => {
    const unexpectedFolders = componentFolders.filter(
      (folder) => !modelComponents.includes(folder),
    );

    expect(unexpectedFolders).toEqual([]);
  });
});
