"use client";

import type { TObject } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { ValueError } from "@sinclair/typebox/value";
import type { DocValidationIssue } from "../doc-schema";
import type { BlockActionParamSpec, BlockActionParamType } from "./compat";
import type { ComponentAction } from "./types";

export function defineComponentAction<P extends TObject>(
  def: ComponentAction<P>,
): ComponentAction<P> {
  const prefix = `${def.blockType}.`;
  const verb = def.action.slice(prefix.length);
  if (!def.action.startsWith(prefix) || verb.length === 0) {
    throw new Error(
      `Component action "${def.action}" must have the form "${def.blockType}.<verb>" with a non-empty verb.`,
    );
  }
  return def;
}

function pointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function issuePath(pointer: string, base: string): string {
  if (pointer === "") return base;
  const rawSegments = pointer.startsWith("/")
    ? pointer.slice(1).split("/")
    : pointer.split("/");
  return rawSegments.reduce((path, rawSegment) => {
    const segment = pointerSegment(rawSegment);
    return /^\d+$/.test(segment) ? `${path}[${segment}]` : `${path}.${segment}`;
  }, base);
}

export function schemaIssues(
  errors: Iterable<ValueError>,
  base = "$.params",
): DocValidationIssue[] {
  function collect(error: ValueError): ValueError[] {
    const nested = error.errors.flatMap((branch) =>
      Array.from(branch).flatMap(collect),
    );
    const deeper = nested.filter((nestedError) =>
      error.path === ""
        ? nestedError.path.startsWith("/")
        : nestedError.path.startsWith(`${error.path}/`),
    );
    return deeper.length > 0 ? deeper : [error];
  }

  const issues = Array.from(errors).flatMap(collect).map((error) => ({
    path: issuePath(error.path, base),
    message: error.message,
  }));
  const seen = new Set<string>();
  const missingPaths = new Set<string>();
  return issues.filter((issue) => {
    const key = JSON.stringify([issue.path, issue.message]);
    if (seen.has(key)) return false;
    seen.add(key);
    if (missingPaths.has(issue.path)) return false;
    if (issue.message === "Expected required property") {
      missingPaths.add(issue.path);
    }
    return true;
  });
}

export function checkParams(
  action: ComponentAction,
  params: Record<string, unknown>,
): DocValidationIssue[] {
  if (Value.Check(action.params, params)) return [];
  return schemaIssues(Value.Errors(action.params, params));
}

function schemaParamType(schema: Record<string, unknown>): BlockActionParamType {
  const type = schema.type;
  if (type === "string") return "string";
  if (type === "integer" || type === "number") return "number";
  if (type === "boolean") return "boolean";
  if (type === "array") return "array";
  if (type === "object") return "object";

  if (Object.prototype.hasOwnProperty.call(schema, "const")) {
    const literalType = typeof schema.const;
    if (
      literalType === "string" ||
      literalType === "number" ||
      literalType === "boolean" ||
      literalType === "object"
    ) {
      return literalType;
    }
  }

  if (Array.isArray(schema.anyOf)) {
    const member = schema.anyOf.find(
      (candidate): candidate is Record<string, unknown> =>
        !!candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate) &&
        (candidate as Record<string, unknown>).type !== "null",
    );
    if (member) return schemaParamType(member);
  }

  throw new Error("Unable to derive a legacy block-action parameter type from schema.");
}

export function deriveParamSpecs(schema: TObject): BlockActionParamSpec[] {
  const required = new Set<string>(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, propertySchema]) => {
    if (typeof propertySchema.description !== "string") {
      throw new Error(`Parameter schema "${name}" must include a description.`);
    }
    return {
      name,
      type: schemaParamType(propertySchema),
      required: required.has(name),
      description: propertySchema.description,
    };
  });
}
