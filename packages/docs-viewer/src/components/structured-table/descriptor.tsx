import { createElement } from "react";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import type { DocBlockDescriptor } from "../../render/block-registry";
import {
  STRUCTURAL_OPS,
  blockAttrs,
  el,
  invalidBlockPlaceholder,
  stringProp,
} from "../../render/descriptor-helpers";
import {
  STRUCTURED_TABLE_AGENT_DESCRIPTION,
  STRUCTURED_TABLE_LABEL,
  StructuredTableBlock,
  type StructuredTableDensity,
} from "./StructuredTableDocsBlock";

type StructuredTableData = {
  title?: string;
  density?: StructuredTableDensity;
  columns: string[];
  rows: string[][];
};

function structuredTableData(block: DocBlock): StructuredTableData | null {
  const { columns, rows } = block.props;
  if (!Array.isArray(columns) || columns.length === 0) return null;
  if (!columns.every((column): column is string => typeof column === "string")) return null;
  if (!Array.isArray(rows)) return null;
  if (
    !rows.every(
      (row): row is string[] =>
        Array.isArray(row) && row.every((cell) => typeof cell === "string"),
    )
  ) {
    return null;
  }
  const density = stringProp(block, "density");
  return {
    title: stringProp(block, "title"),
    density:
      density === "compact" || density === "normal" || density === "relaxed"
        ? density
        : undefined,
    columns,
    rows,
  };
}

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "structured-table",
    targetKind: "structured-table",
    label: STRUCTURED_TABLE_LABEL,
    agentDescription: STRUCTURED_TABLE_AGENT_DESCRIPTION,
    patchOps: STRUCTURAL_OPS,
    render: (block, ctx) => {
      const data = structuredTableData(block);
      if (!data) return invalidBlockPlaceholder(block, ctx, STRUCTURED_TABLE_LABEL);
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        createElement(StructuredTableBlock, { id: block.id, ...data }),
        ctx.renderChildren(block),
      );
    },
  },
];
