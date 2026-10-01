import { describe, expect, it } from "bun:test";
import { tokenizeSigType } from "../components/interaction-surface/signature-tokens";

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

  it("paints type operators and the arrow as keywords", () => {
    expect(roles("keyof typeof x")).toEqual(["keyword:keyof", "keyword:typeof", "type-name:x"]);
    expect(roles("() => void")).toEqual(["punct:(", "punct:)", "keyword:=>", "type-name:void"]);
  });
});
