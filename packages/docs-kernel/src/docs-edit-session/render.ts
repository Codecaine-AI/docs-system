/** Agent-facing document and request-queue renders. */
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { projectToMarkdown } from "@codecaine-ai/docs-model/project-markdown";

import type { DocsEditRequestEntry, DocsEditTarget } from "./types";
import { isDocsEditRequestTerminal } from "./types";

export const DOCS_EDIT_REQUESTS_EMPTY =
  "(none — no annotation requests on this document)";

/** Uses docs-model's sanctioned markdown projection path. */
export function renderDocsDocument(doc: DocDocument): string {
  return projectToMarkdown(doc);
}

export function docsEditTargetText(target: DocsEditTarget): string {
  switch (target.kind) {
    case "doc":
      return "doc";
    case "block":
      return `block:${target.blockId}`;
    case "text-range":
      return `text-range:${target.blockId}[${target.start}..${target.end}]`;
  }
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function formatDocsEditRequestLine(entry: DocsEditRequestEntry): string {
  if (isDocsEditRequestTerminal(entry.status)) {
    return `${entry.alias} ${entry.status} ${JSON.stringify(oneLine(entry.note ?? ""))}`;
  }
  const waiting = entry.waitingOnHuman ? " · waiting-on-human" : "";
  return (
    `${entry.alias} ${entry.status}${waiting}  ${entry.disposition}  ` +
    `${docsEditTargetText(entry.target)}  ${entry.author} — ` +
    JSON.stringify(oneLine(entry.body))
  );
}

export function formatDocsEditRequestThread(
  entry: DocsEditRequestEntry,
): string[] {
  if (isDocsEditRequestTerminal(entry.status)) {
    return [formatDocsEditRequestLine(entry)];
  }
  return [
    formatDocsEditRequestLine(entry),
    ...entry.replies.map(
      (reply) => `    > ${reply.author} — ${JSON.stringify(oneLine(reply.body))}`,
    ),
  ];
}

export function formatDocsEditRequestsBlock(
  entries: readonly DocsEditRequestEntry[],
): string {
  if (entries.length === 0) {
    return `REQUESTS · none\n${DOCS_EDIT_REQUESTS_EMPTY}`;
  }
  const terminal = entries.filter((entry) =>
    isDocsEditRequestTerminal(entry.status)
  ).length;
  return [
    `REQUESTS · ${terminal}/${entries.length} terminal`,
    ...entries.flatMap((entry) =>
      formatDocsEditRequestThread(entry).map((line) => `  ${line}`)
    ),
  ].join("\n");
}
