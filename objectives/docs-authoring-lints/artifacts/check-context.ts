import { readFile } from "node:fs/promises";
import { context as editor } from "../../../packages/docs-kernel/catalog/docs-lab-editor/context";
import { context as writer } from "../../../../agent-kernel/catalog/docs-writer/context";
import type { AgentContextResolver, LoadedMap, SpawnContext } from "@agent-kernel/kernel/context";
let previous: string | undefined;
for (const [name, context] of [["docs-writer", writer], ["docs-lab-editor", editor]] as const) {
  const loaded: LoadedMap = await Promise.all(context.loaders.map(async decl => {
    if (typeof decl !== "object" || !("path" in decl)) throw Error("Expected file loader");
    const content = await readFile(String(decl.path), "utf8");
    return {decl, status:"ok" as const, content, bytes:Buffer.byteLength(content), hash:"audit", fromCache:false};
  }));
  const rendered = await context.assemble(loaded, {} as SpawnContext);
  if (/status="(missing|error|invalid|unparseable)"/.test(rendered)) throw Error("Incomplete context");
  if (previous !== undefined && rendered !== previous) throw Error("Agent context differs");
  previous = rendered;
  console.log(`${name}: ${loaded.length} documents; ${rendered.length} characters; renders successfully`);
}
console.log("Both agents receive identical guidance.");
