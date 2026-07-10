"use client";

import type { DocValidationIssue } from "../../doc-schema";

function paramIssue(name: string, message: string): DocValidationIssue {
  return { path: `$.params.${name}`, message };
}

export function validateTreePath(value: string, name: string, issues: DocValidationIssue[]): boolean {
  if (value.startsWith("./")) {
    issues.push(paramIssue(name, `File-tree paths must not start with "./": "${value}".`));
    return false;
  }
  if (value.startsWith("/")) {
    issues.push(paramIssue(name, `File-tree paths are relative (no leading "/"): "${value}".`));
    return false;
  }
  const body = value.endsWith("/") ? value.slice(0, -1) : value;
  if (body.length === 0 || body.split("/").some((segment) => segment.length === 0)) {
    issues.push(paramIssue(name, `File-tree path has empty segments: "${value}".`));
    return false;
  }
  return true;
}
