"use client";

import { FileIcon, FolderTreeIcon } from "lucide-react";
import { Badge } from "../../ui/badge";
import {
  DocsMdxBlock,
  type DocsMdxParsedBlock,
} from "../base";

type FileTreeEntry = {
  path: string;
  note?: string;
  change?: "added" | "modified" | "removed" | "renamed";
};

type FileTreeData = {
  id?: string;
  title?: string;
  entries: FileTreeEntry[];
};

function changeVariant(
  change: FileTreeEntry["change"],
): "default" | "secondary" | "destructive" | "outline" {
  if (change === "added") return "default";
  if (change === "removed") return "destructive";
  if (change === "modified") return "secondary";
  return "outline";
}

export class FileTreeDocsBlock extends DocsMdxBlock<FileTreeData> {
  readonly tag = "FileTree";
  readonly type = "file-tree";
  readonly targetKind = "file-tree";
  readonly label = "File Tree";
  readonly agentDescription =
    "A source-aware list of files, packages, or docs with optional change state and notes.";

  render(block: DocsMdxParsedBlock<FileTreeData>) {
    const { data } = block;
    return (
      <section
        className="not-prose my-4 rounded-md border bg-muted/20 p-3"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <FolderTreeIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            File Tree
          </span>
          {data.title && <span className="text-sm font-medium">{data.title}</span>}
          {data.id && (
            <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
          )}
        </div>
        <div className="divide-y rounded-md border bg-background">
          {data.entries.map((entry) => (
            <div
              key={`${entry.change ?? "file"}-${entry.path}`}
              className="flex min-w-0 items-start gap-2 px-3 py-2 text-xs"
              data-docs-file-tree-entry={entry.path}
            >
              <FileIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="break-all font-mono text-foreground">{entry.path}</div>
                {entry.note && (
                  <div className="mt-1 text-muted-foreground">{entry.note}</div>
                )}
              </div>
              {entry.change && (
                <Badge variant={changeVariant(entry.change)}>{entry.change}</Badge>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }
}
