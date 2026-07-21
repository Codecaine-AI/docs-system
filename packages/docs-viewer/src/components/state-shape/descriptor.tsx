import { createElement } from "react";
import { readStateShapeExample, type Field } from "@codecaine-ai/docs-model";
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
  STATE_SHAPE_AGENT_DESCRIPTION,
  STATE_SHAPE_LABEL,
  StateShapeBlock,
  type StateShapeSourceProps,
} from "./StateShapeDocsBlock";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Strict recursive read (same policy as the interaction-surface descriptor): any malformed entry invalidates the whole block. Empty arrays are valid — the schema allows a shape with no fields yet. */
function stateShapeFields(raw: unknown): Field[] | null {
  if (!Array.isArray(raw)) return null;
  const fields: Field[] = [];
  for (const entry of raw) {
    if (!isPlainRecord(entry)) return null;
    const { name, type, required, description, fields: children } = entry;
    if (typeof name !== "string" || !name.trim()) return null;
    if (type !== undefined && typeof type !== "string") return null;
    if (required !== undefined && typeof required !== "boolean") return null;
    if (description !== undefined && typeof description !== "string") return null;
    let nested: Field[] | undefined;
    if (children !== undefined) {
      const parsed = stateShapeFields(children);
      if (!parsed) return null;
      nested = parsed;
    }
    fields.push({
      name,
      ...(type !== undefined ? { type } : {}),
      ...(required !== undefined ? { required } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(nested !== undefined ? { fields: nested } : {}),
    });
  }
  return fields;
}

/** `undefined` when absent, the source when well-formed, `null` when present but malformed. */
function stateShapeSource(block: DocBlock): StateShapeSourceProps | undefined | null {
  const raw = block.props.source;
  if (raw === undefined) return undefined;
  if (!isPlainRecord(raw)) return null;
  if (typeof raw.path !== "string" || !raw.path.trim()) return null;
  if (raw.symbol !== undefined && typeof raw.symbol !== "string") return null;
  const source: StateShapeSourceProps = { path: raw.path };
  if (typeof raw.symbol === "string" && raw.symbol.length > 0) source.symbol = raw.symbol;
  return source;
}

export const descriptors: DocBlockDescriptor[] = [
  {
    type: "state-shape",
    targetKind: "state-shape",
    label: STATE_SHAPE_LABEL,
    agentDescription: STATE_SHAPE_AGENT_DESCRIPTION,
    patchOps: STRUCTURAL_OPS,
    render: (block, ctx) => {
      const fields = stateShapeFields(block.props.fields);
      const source = stateShapeSource(block);
      if (!fields || source === null) {
        return invalidBlockPlaceholder(block, ctx, STATE_SHAPE_LABEL);
      }
      return el(
        "div",
        { key: block.id, ...blockAttrs(block) },
        createElement(StateShapeBlock, {
          id: block.id,
          name: stringProp(block, "name"),
          description: stringProp(block, "description"),
          source,
          fields,
          // Tolerant read: a present-but-invalid example renders the
          // single-pane tree instead of invalidating the block (schema
          // validation reports it at authoring time).
          example: readStateShapeExample(block),
        }),
        ctx.renderChildren(block),
      );
    },
  },
];
