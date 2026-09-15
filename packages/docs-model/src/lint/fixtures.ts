import type { DocBlock, DocDocument } from "../doc-schema";
export function paragraph(id: string, text: string): DocBlock {
  return {
    id,
    type: "paragraph",
    props: {},
    text: [{ insert: text }],
    children: [],
  };
}
export function document(...blocks: DocBlock[]): DocDocument {
  return {
    schemaVersion: 1,
    id: "test",
    root: "root",
    blocks: {
      root: {
        id: "root",
        type: "paragraph",
        props: {},
        children: blocks.map((b) => b.id),
      },
      ...Object.fromEntries(blocks.map((b) => [b.id, b])),
    },
  };
}
