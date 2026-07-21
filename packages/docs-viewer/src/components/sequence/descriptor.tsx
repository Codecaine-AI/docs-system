import type { DocBlockDescriptor } from "../../render/block-registry";
import {
  STRUCTURAL_OPS,
  blockAttrs,
  el,
  stringProp,
} from "../../render/descriptor-helpers";

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "sequence",
    targetKind: "sequence",
    label: "Sequence",
    agentDescription:
      "An embedded sequence diagram; props: sequenceId (central sequence id) or src (sidecar path), title.",
    patchOps: STRUCTURAL_OPS,
    render: (block, ctx) => {
      const sequenceId = stringProp(block, "sequenceId");
      const src = stringProp(block, "src");
      const title = stringProp(block, "title");
      const embed =
        (sequenceId || src) && ctx.renderSequence
          ? ctx.renderSequence({ id: block.id, sequenceId, src, title })
          : el(
              "div",
              {
                className:
                  "rounded-md border border-dashed border-[color:var(--docs-sequence-border,var(--border))] bg-muted/30 p-3 text-xs text-muted-foreground",
              },
              sequenceId || src
                ? `Sequence embed: ${sequenceId ?? src}`
                : "Sequence block is missing a sequenceId or src.",
            );
      return el(
        "div",
        {
          key: block.id,
          ...blockAttrs(block),
          "data-sequence-id": sequenceId,
          "data-sequence-src": src,
          className: "not-prose my-4",
        },
        embed,
        ctx.renderChildren(block),
      );
    },
  },
];
