import type { DocBlockDescriptor } from "../../render/block-registry";
import { parsedMdxAdapterDescriptor } from "../../render/descriptor-helpers";
import { MermaidDocsBlock } from "./MermaidDocsBlock";

export const descriptors: DocBlockDescriptor[] = [
  parsedMdxAdapterDescriptor({
    type: "mermaid",
    block: new MermaidDocsBlock(),
    bodyHint:
      "Body is the non-blank Mermaid diagram source (e.g. starting `flowchart LR`); props: title, caption, diagramType (defaults to the source's first word).",
  }),
];
