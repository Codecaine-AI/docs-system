"use client";

import { useState } from "react";
import {
  CheckSquare2Icon,
  Code2Icon,
  Columns3Icon,
  ListChecksIcon,
  NotebookTabsIcon,
  SquareIcon,
  Table2Icon,
} from "lucide-react";
import { Badge } from "../../ui/badge";
import { cn } from "../../ui/cn";
import { attr, slugify } from "../attrs";
import {
  DocsMdxBlock,
  type DocsMdxBlockRenderContext,
  type DocsMdxParsedBlock,
} from "../base";

function clampInt(value: string | undefined, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

type ChecklistItem = {
  id: string;
  label: string;
  checked: boolean;
  note?: string;
};

type ChecklistData = {
  id: string;
  title?: string;
  items: ChecklistItem[];
};

function parseChecklistItem(line: string, index: number): ChecklistItem | null {
  const match = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.+?)\s*$/);
  if (!match) return null;
  const [labelPart, ...noteParts] = match[2].split(/\s+(?:--|::)\s+/);
  const label = labelPart?.trim();
  if (!label) return null;
  return {
    id: slugify(label, `item-${index + 1}`),
    label,
    checked: match[1].toLowerCase() === "x",
    note: noteParts.join(" - ").trim() || undefined,
  };
}

export class ChecklistDocsBlock extends DocsMdxBlock<ChecklistData> {
  readonly tag = "Checklist";
  readonly type = "checklist";
  readonly targetKind = "checklist";
  readonly label = "Checklist";
  readonly agentDescription =
    "A read-only checklist of review, migration, or implementation items written as markdown task rows.";
  override readonly patchOps = [
    "append-checklist-item",
    "update-checklist-item",
    "remove-checklist-item",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<ChecklistData> | null {
    const id = attr(attrs, "id");
    if (!id) return null;
    const items = body
      .split("\n")
      .map(parseChecklistItem)
      .filter((item): item is ChecklistItem => item !== null);
    if (items.length === 0) return null;
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: {
        id,
        title: attr(attrs, "title"),
        items,
      },
    };
  }

  render(block: DocsMdxParsedBlock<ChecklistData>) {
    const { data } = block;
    const completeCount = data.items.filter((item) => item.checked).length;
    return (
      <section
        className="not-prose my-4 rounded-md border bg-muted/20 p-3"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ListChecksIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Checklist
          </span>
          {data.title && <span className="text-sm font-medium">{data.title}</span>}
          <Badge variant="outline">
            {completeCount}/{data.items.length}
          </Badge>
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        </div>
        <ul className="divide-y rounded-md border bg-background">
          {data.items.map((item) => {
            const Icon = item.checked ? CheckSquare2Icon : SquareIcon;
            return (
              <li
                key={item.id}
                className="flex min-w-0 items-start gap-2 px-3 py-2 text-sm"
                data-docs-checklist-item={item.id}
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    item.checked ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className={cn("text-foreground", item.checked && "line-through opacity-75")}>
                    {item.label}
                  </div>
                  {item.note && (
                    <div className="mt-1 text-xs text-muted-foreground">{item.note}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
}

type StructuredTableData = {
  id: string;
  title?: string;
  density: "compact" | "normal" | "relaxed";
  columns: string[];
  rows: string[][];
};

const TABLE_DENSITIES = ["compact", "normal", "relaxed"] as const;

function isDensity(value: string | undefined): value is StructuredTableData["density"] {
  return TABLE_DENSITIES.includes(value as StructuredTableData["density"]);
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function parseMarkdownTable(body: string): Pick<StructuredTableData, "columns" | "rows"> | null {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.includes("|"));
  if (lines.length < 2) return null;
  const columns = splitMarkdownTableRow(lines[0]);
  const separator = splitMarkdownTableRow(lines[1]);
  const isSeparator = separator.every((cell) => /^:?-{3,}:?$/.test(cell));
  if (columns.length === 0 || !isSeparator) return null;
  const rows = lines.slice(2).map(splitMarkdownTableRow);
  if (rows.length === 0) return null;
  return { columns, rows };
}

export class StructuredTableDocsBlock extends DocsMdxBlock<StructuredTableData> {
  readonly tag = "StructuredTable";
  readonly type = "structured-table";
  readonly targetKind = "structured-table";
  readonly label = "Structured Table";
  readonly agentDescription =
    "A schema-light table block using markdown table source with title and density metadata.";
  override readonly patchOps = [
    "append-table-row",
    "update-table-row",
    "remove-table-row",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<StructuredTableData> | null {
    const id = attr(attrs, "id");
    if (!id) return null;
    const table = parseMarkdownTable(body);
    if (!table) return null;
    const densityAttr = attr(attrs, "density");
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: {
        id,
        title: attr(attrs, "title"),
        density: isDensity(densityAttr) ? densityAttr : "normal",
        ...table,
      },
    };
  }

  render(block: DocsMdxParsedBlock<StructuredTableData>) {
    const { data } = block;
    const cellClass =
      data.density === "compact"
        ? "px-2 py-1"
        : data.density === "relaxed"
          ? "px-4 py-3"
          : "px-3 py-2";
    return (
      <section
        className="not-prose my-4 rounded-md border bg-muted/20 p-3"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Table2Icon className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Structured Table
          </span>
          {data.title && <span className="text-sm font-medium">{data.title}</span>}
          <Badge variant="outline">{data.density}</Badge>
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        </div>
        <div className="overflow-auto rounded-md border bg-background">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                {data.columns.map((column) => (
                  <th key={column} className={cn(cellClass, "font-display uppercase tracking-wider")}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.rows.map((row, rowIndex) => (
                <tr key={`${data.id}-row-${rowIndex}`}>
                  {data.columns.map((column, columnIndex) => (
                    <td key={`${column}-${columnIndex}`} className={cn(cellClass, "align-top")}>
                      {row[columnIndex] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }
}

type SectionData = {
  id: string;
  label: string;
  body: string;
};

function parseDelimitedSections(body: string, fallbackLabel: string): SectionData[] {
  const lines = body.split("\n");
  const sections: SectionData[] = [];
  let currentLabel = fallbackLabel;
  let currentLines: string[] = [];

  const flush = () => {
    const sectionBody = currentLines.join("\n").trim();
    if (!sectionBody) return;
    sections.push({
      id: slugify(currentLabel, `section-${sections.length + 1}`),
      label: currentLabel,
      body: sectionBody,
    });
    currentLines = [];
  };

  for (const line of lines) {
    const delimiter = line.match(/^\s*---\s*(.+?)\s*---\s*$/);
    const heading = line.match(/^\s*#{2,3}\s+(.+?)\s*$/);
    const label = delimiter?.[1] ?? heading?.[1];
    if (label) {
      flush();
      currentLabel = label.trim();
      continue;
    }
    currentLines.push(line);
  }
  flush();
  return sections;
}

type TabsData = {
  id: string;
  title?: string;
  orientation: "horizontal" | "vertical";
  tabs: SectionData[];
};

function DocsTabsPreview({
  data,
  renderMarkdown,
}: {
  data: TabsData;
  renderMarkdown: DocsMdxBlockRenderContext["renderMarkdown"];
}) {
  const [activeId, setActiveId] = useState(data.tabs[0]?.id ?? "");
  const activeTab = data.tabs.find((tab) => tab.id === activeId) ?? data.tabs[0];

  return (
    <div
      className={cn(
        "grid gap-3",
        data.orientation === "vertical" && "sm:grid-cols-[180px_minmax(0,1fr)]",
      )}
    >
      <div
        className={cn(
          "flex gap-1 overflow-auto",
          data.orientation === "vertical" ? "sm:flex-col" : "border-b pb-1",
        )}
        role="tablist"
      >
        {data.tabs.map((tab) => {
          const selected = tab.id === activeTab?.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                "rounded-sm border px-2 py-1 text-left text-xs transition-colors",
                selected ? "bg-background text-foreground" : "bg-muted/30 text-muted-foreground",
              )}
              onClick={() => setActiveId(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {activeTab && (
        <div className="docs-markdown prose prose-sm dark:prose-invert max-w-none rounded-md border bg-background p-3 font-sans text-sm leading-[1.7]">
          {renderMarkdown(activeTab.body)}
        </div>
      )}
    </div>
  );
}

export class TabsDocsBlock extends DocsMdxBlock<TabsData> {
  readonly tag = "Tabs";
  readonly type = "tabs";
  readonly targetKind = "tabs";
  readonly label = "Tabs";
  readonly agentDescription =
    "A read-only tabbed block whose body uses section delimiters like `--- Source ---`.";
  override readonly patchOps = [
    "append-tab",
    "update-tab",
    "remove-tab",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<TabsData> | null {
    const id = attr(attrs, "id");
    if (!id) return null;
    const tabs = parseDelimitedSections(body, "Tab");
    if (tabs.length === 0) return null;
    const orientation = attr(attrs, "orientation") === "vertical" ? "vertical" : "horizontal";
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: {
        id,
        title: attr(attrs, "title"),
        orientation,
        tabs,
      },
    };
  }

  render(
    block: DocsMdxParsedBlock<TabsData>,
    ctx: DocsMdxBlockRenderContext,
  ) {
    const { data } = block;
    return (
      <section
        className="not-prose my-4 rounded-md border bg-muted/20 p-3"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <NotebookTabsIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Tabs
          </span>
          {data.title && <span className="text-sm font-medium">{data.title}</span>}
          <Badge variant="outline">{data.tabs.length} tabs</Badge>
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        </div>
        <DocsTabsPreview data={data} renderMarkdown={ctx.renderMarkdown} />
      </section>
    );
  }
}

type ColumnsData = {
  id: string;
  title?: string;
  columns: SectionData[];
};

export class ColumnsDocsBlock extends DocsMdxBlock<ColumnsData> {
  readonly tag = "Columns";
  readonly type = "columns";
  readonly targetKind = "columns";
  readonly label = "Columns";
  readonly agentDescription =
    "A responsive two- or three-column read-only layout whose body uses section delimiters.";
  override readonly patchOps = [
    "append-column",
    "update-column",
    "remove-column",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<ColumnsData> | null {
    const id = attr(attrs, "id");
    if (!id) return null;
    const requestedCount = clampInt(attr(attrs, "columns"), 2, 3, 2);
    const sections = parseDelimitedSections(body, "Column").slice(0, requestedCount);
    if (sections.length === 0) return null;
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: {
        id,
        title: attr(attrs, "title"),
        columns: sections,
      },
    };
  }

  render(
    block: DocsMdxParsedBlock<ColumnsData>,
    ctx: DocsMdxBlockRenderContext,
  ) {
    const { data } = block;
    return (
      <section
        className="not-prose my-4 rounded-md border bg-muted/20 p-3"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Columns3Icon className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Columns
          </span>
          {data.title && <span className="text-sm font-medium">{data.title}</span>}
          <Badge variant="outline">{data.columns.length} columns</Badge>
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        </div>
        <div
          className={cn(
            "grid gap-3",
            data.columns.length >= 3 ? "lg:grid-cols-3" : "sm:grid-cols-2",
          )}
        >
          {data.columns.map((column) => (
            <section key={column.id} className="rounded-md border bg-background p-3">
              <h3 className="mb-2 font-display text-sm font-semibold text-foreground">
                {column.label}
              </h3>
              <div className="docs-markdown prose prose-sm dark:prose-invert max-w-none font-sans text-sm leading-[1.7]">
                {ctx.renderMarkdown(column.body)}
              </div>
            </section>
          ))}
        </div>
      </section>
    );
  }
}

type CodeData = {
  id: string;
  title?: string;
  filename?: string;
  language?: string;
  caption?: string;
  maxLines?: number;
  code: string;
};

export class CodeDocsBlock extends DocsMdxBlock<CodeData> {
  readonly tag = "Code";
  readonly type = "code";
  readonly targetKind = "code";
  readonly label = "Code";
  readonly agentDescription =
    "A source code block with filename, language, caption, and max-lines metadata; code is rendered as inert text.";
  override readonly patchOps = [
    "update-code-props",
    "update-code-body",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<CodeData> | null {
    const id = attr(attrs, "id");
    if (!id) return null;
    const code = body.replace(/^\n+|\n+$/g, "");
    if (!code) return null;
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: {
        id,
        title: attr(attrs, "title"),
        filename: attr(attrs, "filename"),
        language: attr(attrs, "language"),
        caption: attr(attrs, "caption"),
        maxLines: attr(attrs, "maxLines")
          ? clampInt(attr(attrs, "maxLines"), 1, 200, 24)
          : undefined,
        code,
      },
    };
  }

  render(block: DocsMdxParsedBlock<CodeData>) {
    const { data } = block;
    const lines = data.code.split("\n");
    const displayedLines = data.maxLines ? lines.slice(0, data.maxLines) : lines;
    const hiddenLineCount = Math.max(0, lines.length - displayedLines.length);
    return (
      <section
        className="not-prose my-4 overflow-hidden rounded-md border bg-muted/20"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2">
          <Code2Icon className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Code
          </span>
          {data.title && <span className="text-sm font-medium">{data.title}</span>}
          {data.filename && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {data.filename}
            </span>
          )}
          {data.language && <Badge variant="outline">{data.language}</Badge>}
        </div>
        <pre
          className="max-h-[420px] overflow-auto bg-background p-3 font-mono text-xs leading-relaxed"
          data-docs-code-language={data.language}
        >
          <code>{displayedLines.join("\n")}</code>
        </pre>
        {(data.caption || hiddenLineCount > 0) && (
          <div className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {data.caption}
            {hiddenLineCount > 0 && (
              <span className={data.caption ? "ml-2" : undefined}>
                {hiddenLineCount} additional lines hidden by maxLines.
              </span>
            )}
          </div>
        )}
      </section>
    );
  }
}

export const supportDocsBlocks = [
  new ChecklistDocsBlock(),
  new StructuredTableDocsBlock(),
  new TabsDocsBlock(),
  new ColumnsDocsBlock(),
  new CodeDocsBlock(),
];
