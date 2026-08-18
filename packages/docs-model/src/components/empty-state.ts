"use client";

/**
 * empty-state.ts — schema-derived blank props per block type.
 *
 * The docs-edit tool surface inserts BLANK blocks (content arrives through
 * per-type actions afterwards), so every type needs a props object that
 * passes its closed TypeBox schema with nothing in it. Rather than
 * hand-maintaining defaults per component, the blank is derived from the
 * schema itself: required properties get their type's empty value, optional
 * properties are omitted. The registry boot check in components/index.ts
 * validates every derived blank through checkStateProps, so a schema change
 * that breaks blank-insertability fails at import time, not in a session.
 */
import type { TObject } from "@sinclair/typebox";

type SchemaNode = Record<string, unknown>;

function emptyValueFor(node: unknown): unknown {
	if (node === null || typeof node !== "object") return null;
	const schema = node as SchemaNode;
	if ("const" in schema) return schema.const;
	if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
	if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
		return emptyValueFor(schema.anyOf[0]);
	}
	switch (schema.type) {
		case "string":
			return "";
		case "integer":
		case "number":
			return 0;
		case "boolean":
			return false;
		case "array":
			return [];
		case "object":
			return deriveEmptyObject(schema);
		case "null":
			return null;
		default:
			return null;
	}
}

function deriveEmptyObject(schema: SchemaNode): Record<string, unknown> {
	const required = Array.isArray(schema.required)
		? schema.required.filter((key): key is string => typeof key === "string")
		: [];
	const properties =
		schema.properties !== null && typeof schema.properties === "object"
			? (schema.properties as Record<string, unknown>)
			: {};
	return Object.fromEntries(
		required.map((key) => [key, emptyValueFor(properties[key])]),
	);
}

/** Blank props for a block-state schema: required keys only, empty values. */
export function deriveEmptyProps(schema: TObject): Record<string, unknown> {
	return deriveEmptyObject(schema as unknown as SchemaNode);
}
