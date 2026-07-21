"use client";

import { DOC_BLOCK_TYPES } from "../doc-schema";
import type { ComponentBundle } from "./types";

export const KNOWN_AUTHORITIES = ["canvas", "sequence"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function schemaChildren(
  schema: Record<string, unknown>,
): Array<{ path: string; schema: unknown }> {
  const children: Array<{ path: string; schema: unknown }> = [];

  for (const keyword of ["properties", "patternProperties", "$defs", "definitions"] as const) {
    const schemas = schema[keyword];
    if (!isRecord(schemas)) continue;
    for (const [name, child] of Object.entries(schemas)) {
      children.push({ path: `${keyword}.${name}`, schema: child });
    }
  }

  const dependentSchemas = schema.dependentSchemas;
  if (isRecord(dependentSchemas)) {
    for (const [name, child] of Object.entries(dependentSchemas)) {
      children.push({ path: `dependentSchemas.${name}`, schema: child });
    }
  }

  const items = schema.items;
  if (Array.isArray(items)) {
    for (const [index, child] of items.entries()) {
      children.push({ path: `items[${index}]`, schema: child });
    }
  } else if (items !== undefined) {
    children.push({ path: "items", schema: items });
  }

  for (const keyword of ["allOf", "anyOf", "oneOf", "prefixItems"] as const) {
    const schemas = schema[keyword];
    if (!Array.isArray(schemas)) continue;
    for (const [index, child] of schemas.entries()) {
      children.push({ path: `${keyword}[${index}]`, schema: child });
    }
  }

  for (const keyword of [
    "additionalProperties",
    "contains",
    "not",
    "if",
    "then",
    "else",
    "propertyNames",
    "unevaluatedProperties",
  ] as const) {
    const child = schema[keyword];
    if (isRecord(child)) children.push({ path: keyword, schema: child });
  }

  return children;
}

function collectClosedObjectIssues(
  schema: unknown,
  label: string,
  issues: string[],
  requireObject: boolean,
  ancestors = new Set<object>(),
): void {
  if (!isRecord(schema)) {
    if (requireObject) issues.push(`${label} must be a TypeBox object schema.`);
    return;
  }

  if (ancestors.has(schema)) return;
  ancestors.add(schema);

  const schemaType = schema.type;
  const isObjectSchema =
    schemaType === "object" ||
    (Array.isArray(schemaType) && schemaType.includes("object"));

  if (requireObject && !isObjectSchema) {
    issues.push(`${label} must be a TypeBox object schema.`);
  }
  if (isObjectSchema && schema.additionalProperties !== false) {
    issues.push(`${label} must be closed (additionalProperties must be false).`);
  }

  for (const child of schemaChildren(schema)) {
    collectClosedObjectIssues(
      child.schema,
      `${label}.${child.path}`,
      issues,
      false,
      ancestors,
    );
  }

  ancestors.delete(schema);
}

function collectObjectSchemaIssue(
  schema: unknown,
  label: string,
  issues: string[],
): void {
  if (!isRecord(schema)) {
    issues.push(`${label} must be a TypeBox object schema.`);
    return;
  }

  const schemaType = schema.type;
  const isObjectSchema =
    schemaType === "object" ||
    (Array.isArray(schemaType) && schemaType.includes("object"));
  if (!isObjectSchema) issues.push(`${label} must be a TypeBox object schema.`);
}

export function collectRegistryIssues(bundles: readonly ComponentBundle[]): string[] {
  const issues: string[] = [];
  const canonicalTypes = new Set<string>(DOC_BLOCK_TYPES);
  const owners = new Map<string, string[]>();

  for (const bundle of bundles) {
    for (const type of bundle.manifest.ownedTypes as readonly string[]) {
      const names = owners.get(type);
      if (names) names.push(bundle.manifest.name);
      else owners.set(type, [bundle.manifest.name]);
    }
  }

  for (const type of DOC_BLOCK_TYPES) {
    if (!owners.has(type)) issues.push(`Missing component ownership for block type "${type}".`);
  }
  for (const type of owners.keys()) {
    if (!canonicalTypes.has(type)) issues.push(`Unknown owned block type "${type}".`);
  }
  for (const [type, names] of owners) {
    if (names.length > 1) {
      issues.push(
        `Duplicate ownership for block type "${type}" by components: ${names.join(", ")}.`,
      );
    }
  }

  const actionCounts = new Map<string, number>();

  for (const bundle of bundles) {
    const bundleName = bundle.manifest.name;
    const ownedTypes = new Set<string>(bundle.manifest.ownedTypes);

    for (const type of bundle.manifest.ownedTypes) {
      const state = bundle.states[type];
      if (!state) {
        issues.push(`Component "${bundleName}" is missing state for owned type "${type}".`);
      }
    }

    for (const [type, state] of Object.entries(bundle.states)) {
      if (!state) continue;
      collectClosedObjectIssues(
        state.schema,
        `Component "${bundleName}" state "${type}" schema`,
        issues,
        true,
      );
    }

    for (const action of bundle.actions) {
      actionCounts.set(action.action, (actionCounts.get(action.action) ?? 0) + 1);

      const separator = action.action.indexOf(".");
      if (separator <= 0 || separator === action.action.length - 1) {
        issues.push(
          `Component "${bundleName}" action "${action.action}" must use the key "<type>.<verb>" with a non-empty verb.`,
        );
      } else {
        const keyType = action.action.slice(0, separator);
        if (!ownedTypes.has(keyType)) {
          issues.push(
            `Component "${bundleName}" action "${action.action}" names unowned type "${keyType}".`,
          );
        }
        if (keyType !== action.blockType) {
          issues.push(
            `Component "${bundleName}" action "${action.action}" does not match blockType "${action.blockType}".`,
          );
        }
      }
      if (!ownedTypes.has(action.blockType)) {
        issues.push(
          `Component "${bundleName}" action "${action.action}" has unowned blockType "${action.blockType}".`,
        );
      }

      collectObjectSchemaIssue(
        action.params,
        `Component "${bundleName}" action "${action.action}" params schema`,
        issues,
      );

      if (
        "forward" in action &&
        !KNOWN_AUTHORITIES.includes(
          action.forward.authority as (typeof KNOWN_AUTHORITIES)[number],
        )
      ) {
        issues.push(
          `Component "${bundleName}" action "${action.action}" has unknown forward authority "${action.forward.authority}".`,
        );
      }
    }
  }

  for (const [action, count] of actionCounts) {
    if (count > 1) issues.push(`Duplicate global action key "${action}" (${count} definitions).`);
  }

  return issues;
}

export function assertComponentRegistry(bundles: readonly ComponentBundle[]): void {
  const issues = collectRegistryIssues(bundles);
  if (issues.length === 0) return;
  throw new Error(`Invalid component registry:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
}
