import { describe, expect, it } from "bun:test";
import { tokenizeExampleCall, tokenizeSigType } from "../components/interaction-surface/signature-tokens";

const roles = (text: string) =>
  tokenizeSigType(text)
    .filter((token) => token.kind !== "space")
    .map((token) => `${token.kind}:${token.text}`);

describe("tokenizeSigType", () => {
  it("round-trips the source text", () => {
    for (const text of ["Record<questionId, Decision result>", '"a" | \'b\' | `c`', "props patch (standard inverse)", "x?: number[]"]) {
      expect(tokenizeSigType(text).map((token) => token.text).join("")).toBe(text);
    }
  });

  it("separates literals from type names", () => {
    expect(roles('"native" | "self-reported" | 3 | -1.5 | true | null | undefined | string')).toEqual([
      'string:"native"', "punct:|", 'string:"self-reported"', "punct:|", "number:3", "punct:|", "number:-1.5",
      "punct:|", "boolean:true", "punct:|", "null:null", "punct:|", "null:undefined", "punct:|", "type-name:string",
    ]);
  });

  it("marks object keys only after an opener and before a colon", () => {
    expect(roles("{ id: string; name?: Foo.Bar }")).toEqual([
      "punct:{", "key:id", "punct::", "type-name:string", "punct:;", "key:name", "punct:?", "punct::", "type-name:Foo.Bar", "punct:}",
    ]);
    // A leading `word:` is prose, not a key.
    expect(roles("note: free text")[0]).toBe("type-name:note");
  });

  it("paints type operators and void as keywords, the arrow as punctuation", () => {
    expect(roles("keyof typeof x")).toEqual(["keyword:keyof", "keyword:typeof", "type-name:x"]);
    expect(roles("() => void")).toEqual(["punct:(", "punct:)", "punct:=>", "keyword:void"]);
  });
});

describe("tokenizeExampleCall", () => {
  const source = 'file-tree.addEntry({\n  path: "src/a.ts",\n  entries: [\n    { path: "b", "change": null },\n  ],\n  depth: -1,\n})';
  it("round-trips every line", () => {
    expect(tokenizeExampleCall(source).map((line) => line.tokens.map((token) => token.text).join(""))).toEqual(source.split("\n"));
  });

  it("colors receiver, call, keys and literals by Dark+ role", () => {
    const lines = tokenizeExampleCall(source).map((line) => line.tokens.filter((token) => token.kind !== "space").map((token) => `${token.kind}:${token.text}`));
    expect(lines[0]).toEqual(["receiver:file-tree", "punct:.", "name:addEntry", "punct:(", "punct:{"]);
    expect(lines[3]).toEqual(["punct:{", "key:path", "punct::", 'string:"b"', "punct:,", 'key:"change"', "punct::", "null:null", "punct:}", "punct:,"]);
    expect(lines[5]).toEqual(["key:depth", "punct::", "number:-1", "punct:,"]);
  });

  it("tags each line with the key paths it sets, arrays keeping their key's path", () => {
    expect(tokenizeExampleCall(source).map((line) => line.paths)).toEqual([[], ["path"], ["entries"], ["entries.path", "entries.change", "entries"], ["entries"], ["depth"], []]);
    // Positional arguments set no key path.
    expect(tokenizeExampleCall('DocsStore.docGet("guide/intro")')[0]!.paths).toEqual([]);
  });
});
