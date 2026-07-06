"use client";

import type { ReactNode } from "react";
import {
  BracesIcon,
  Code2Icon,
  DatabaseIcon,
  FileCodeIcon,
  GitCompareIcon,
  MapIcon,
  RouteIcon,
  ServerIcon,
} from "lucide-react";
import { Badge } from "../../ui/badge";
import { cn } from "../../ui/cn";
import { attr, slugify } from "../attrs";
import {
  DocsMdxBlock,
  type DocsMdxBlockRenderContext,
  type DocsMdxParsedBlock,
} from "../base";

type ChangeState = "added" | "modified" | "removed" | "renamed";

function splitNote(value: string): [string, string | undefined] {
  const [main, ...noteParts] = value.split(/\s+(?:--|::)\s+/);
  return [main.trim(), noteParts.join(" - ").trim() || undefined];
}

function parseChangePrefix(value: string): {
  change?: ChangeState;
  rest: string;
} {
  const match = value.trim().match(/^\[(added|modified|removed|renamed)\]\s+/i);
  return {
    change: match?.[1]?.toLowerCase() as ChangeState | undefined,
    rest: match ? value.trim().slice(match[0].length).trim() : value.trim(),
  };
}

function parseChangeAttr(value: string | undefined): ChangeState | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === "added" ||
    normalized === "modified" ||
    normalized === "removed" ||
    normalized === "renamed"
    ? normalized
    : undefined;
}

function changeVariant(
  change: ChangeState | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  if (change === "added") return "default";
  if (change === "removed") return "destructive";
  if (change === "modified") return "secondary";
  return "outline";
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

function isHttpMethod(value: string | undefined): value is HttpMethod {
  return HTTP_METHODS.includes(value as HttpMethod);
}

function methodVariant(method: string): "default" | "secondary" | "destructive" | "outline" {
  if (method === "GET") return "secondary";
  if (method === "DELETE") return "destructive";
  if (method === "POST" || method === "PUT" || method === "PATCH") return "default";
  return "outline";
}

type ImplementationMapEntry = {
  path: string;
  note: string;
  change?: ChangeState;
  language?: string;
};

type ImplementationMapData = {
  id: string;
  title?: string;
  entries: ImplementationMapEntry[];
};

function parseImplementationEntry(line: string): ImplementationMapEntry | null {
  const cleaned = line.trim().replace(/^[-*]\s+/, "");
  if (!cleaned) return null;
  const { change, rest } = parseChangePrefix(cleaned);
  const [pathAndLanguage, note] = splitNote(rest);
  const match = pathAndLanguage.match(/^`?([^`\s]+)`?(?:\s+\(([^)]+)\))?$/);
  const path = match?.[1]?.trim();
  if (!path || !note) return null;
  return {
    path,
    note,
    change,
    language: match?.[2]?.trim(),
  };
}

export class ImplementationMapDocsBlock extends DocsMdxBlock<ImplementationMapData> {
  readonly tag = "ImplementationMap";
  readonly type = "implementation-map";
  readonly targetKind = "implementation-map";
  readonly label = "Implementation Map";
  readonly agentDescription =
    "A file-oriented implementation map with per-path notes and optional change state.";
  override readonly patchOps = [
    "append-implementation-entry",
    "update-implementation-entry",
    "remove-implementation-entry",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<ImplementationMapData> | null {
    const id = attr(attrs, "id");
    if (!id) return null;
    const entries = body
      .split("\n")
      .map(parseImplementationEntry)
      .filter((entry): entry is ImplementationMapEntry => entry !== null);
    if (entries.length === 0) return null;
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: { id, title: attr(attrs, "title"), entries },
    };
  }

  render(block: DocsMdxParsedBlock<ImplementationMapData>) {
    const { data } = block;
    return (
      <section
        className="not-prose my-4 rounded-md border bg-muted/20 p-3"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <MapIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Implementation Map
          </span>
          {data.title && <span className="text-sm font-medium">{data.title}</span>}
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        </div>
        <div className="grid gap-2">
          {data.entries.map((entry) => (
            <div key={entry.path} className="rounded-md border bg-background p-3 text-xs">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <FileCodeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <code className="break-all font-mono text-foreground">{entry.path}</code>
                {entry.change && <Badge variant={changeVariant(entry.change)}>{entry.change}</Badge>}
                {entry.language && <Badge variant="outline">{entry.language}</Badge>}
              </div>
              <div className="text-muted-foreground">{entry.note}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }
}

type ApiParam = {
  name: string;
  in: "path" | "query" | "header" | "body";
  type?: string;
  required: boolean;
  description?: string;
};

type ApiResponse = {
  status: string;
  description?: string;
};

type ApiEndpointData = {
  id: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  auth?: string;
  deprecated: boolean;
  change?: ChangeState;
  description: string;
  params: ApiParam[];
  responses: ApiResponse[];
};

function parseApiEndpointBody(body: string): {
  description: string;
  params: ApiParam[];
  responses: ApiResponse[];
} {
  const descriptionLines: string[] = [];
  const params: ApiParam[] = [];
  const responses: ApiResponse[] = [];

  for (const line of body.split("\n")) {
    const paramMatch = line.match(
      /^\s*[-*]\s+param\s+(path|query|header|body)\s+([^\s:]+)(?:\s+([^\s]+))?(?:\s+(required|optional))?\s*(?:::|--)?\s*(.*)$/i,
    );
    if (paramMatch) {
      params.push({
        in: paramMatch[1].toLowerCase() as ApiParam["in"],
        name: paramMatch[2],
        type: paramMatch[3],
        required: paramMatch[4]?.toLowerCase() !== "optional",
        description: paramMatch[5]?.trim() || undefined,
      });
      continue;
    }

    const responseMatch = line.match(/^\s*[-*]\s+response\s+([0-9A-Za-z-]+)\s*(?:::|--)?\s*(.*)$/i);
    if (responseMatch) {
      responses.push({
        status: responseMatch[1],
        description: responseMatch[2]?.trim() || undefined,
      });
      continue;
    }

    descriptionLines.push(line);
  }

  return {
    description: descriptionLines.join("\n").trim(),
    params,
    responses,
  };
}

export class ApiEndpointDocsBlock extends DocsMdxBlock<ApiEndpointData> {
  readonly tag = "ApiEndpoint";
  readonly type = "api-endpoint";
  readonly targetKind = "api-endpoint";
  readonly label = "API Endpoint";
  readonly agentDescription =
    "A typed HTTP endpoint summary with method, path, params, responses, auth, and diff state metadata.";
  override readonly patchOps = [
    "update-api-endpoint-props",
    "update-api-endpoint-param",
    "update-api-endpoint-response",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<ApiEndpointData> | null {
    const id = attr(attrs, "id");
    const methodAttr = attr(attrs, "method")?.toUpperCase();
    const path = attr(attrs, "path");
    if (!id || !isHttpMethod(methodAttr) || !path) return null;
    const parsedBody = parseApiEndpointBody(body);
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: {
        id,
        method: methodAttr,
        path,
        summary: attr(attrs, "summary"),
        auth: attr(attrs, "auth"),
        deprecated: attr(attrs, "deprecated") === "true",
        change: parseChangeAttr(attr(attrs, "change")),
        ...parsedBody,
      },
    };
  }

  render(
    block: DocsMdxParsedBlock<ApiEndpointData>,
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
          <ServerIcon className="h-4 w-4 text-muted-foreground" />
          <Badge variant={methodVariant(data.method)}>{data.method}</Badge>
          <code className="break-all font-mono text-xs text-foreground">{data.path}</code>
          {data.change && <Badge variant={changeVariant(data.change)}>{data.change}</Badge>}
          {data.deprecated && <Badge variant="destructive">deprecated</Badge>}
        </div>
        {(data.summary || data.auth) && (
          <div className="mb-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            {data.summary && (
              <div className="rounded border bg-background/60 p-2">
                <div className="font-display text-[10px] uppercase tracking-wider">Summary</div>
                <div className="mt-1">{data.summary}</div>
              </div>
            )}
            {data.auth && (
              <div className="rounded border bg-background/60 p-2">
                <div className="font-display text-[10px] uppercase tracking-wider">Auth</div>
                <div className="mt-1 font-mono">{data.auth}</div>
              </div>
            )}
          </div>
        )}
        {data.description && (
          <div className="spectre-markdown prose prose-sm dark:prose-invert mb-3 max-w-none font-sans text-sm leading-[1.7]">
            {ctx.renderMarkdown(data.description)}
          </div>
        )}
        {(data.params.length > 0 || data.responses.length > 0) && (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.params.length > 0 && (
              <EndpointList title="Params">
                {data.params.map((param) => (
                  <div key={`${param.in}-${param.name}`} className="rounded border bg-background p-2 text-xs">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{param.in}</Badge>
                      <code>{param.name}</code>
                      {param.type && <span className="text-muted-foreground">{param.type}</span>}
                      {param.required && <Badge variant="secondary">required</Badge>}
                    </div>
                    {param.description && <div className="text-muted-foreground">{param.description}</div>}
                  </div>
                ))}
              </EndpointList>
            )}
            {data.responses.length > 0 && (
              <EndpointList title="Responses">
                {data.responses.map((response) => (
                  <div key={response.status} className="rounded border bg-background p-2 text-xs">
                    <div className="mb-1 font-mono text-foreground">{response.status}</div>
                    {response.description && <div className="text-muted-foreground">{response.description}</div>}
                  </div>
                ))}
              </EndpointList>
            )}
          </div>
        )}
      </section>
    );
  }
}

function EndpointList({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

type ApiSurfaceEndpoint = {
  id: string;
  method: HttpMethod;
  path: string;
  summary?: string;
};

type ApiSurfaceData = {
  id: string;
  title?: string;
  endpoints: ApiSurfaceEndpoint[];
};

function parseApiSurfaceEndpoint(line: string, index: number): ApiSurfaceEndpoint | null {
  const cleaned = line.trim().replace(/^[-*]\s+/, "");
  const [main, summary] = splitNote(cleaned);
  const match = main.match(/^([A-Za-z]+)\s+(\S+)$/);
  const method = match?.[1]?.toUpperCase();
  const path = match?.[2];
  if (!isHttpMethod(method) || !path) return null;
  return {
    id: `${method}-${slugify(path, `endpoint-${index + 1}`)}`,
    method,
    path,
    summary,
  };
}

export class ApiSurfaceDocsBlock extends DocsMdxBlock<ApiSurfaceData> {
  readonly tag = "ApiSurface";
  readonly type = "api-surface";
  readonly targetKind = "api-surface";
  readonly label = "API Surface";
  readonly agentDescription =
    "A compact grouped list of HTTP endpoints belonging to one docs surface or service boundary.";
  override readonly patchOps = [
    "append-api-surface-endpoint",
    "update-api-surface-endpoint",
    "remove-api-surface-endpoint",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<ApiSurfaceData> | null {
    const id = attr(attrs, "id");
    if (!id) return null;
    const endpoints = body
      .split("\n")
      .map(parseApiSurfaceEndpoint)
      .filter((endpoint): endpoint is ApiSurfaceEndpoint => endpoint !== null);
    if (endpoints.length === 0) return null;
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: { id, title: attr(attrs, "title"), endpoints },
    };
  }

  render(block: DocsMdxParsedBlock<ApiSurfaceData>) {
    const { data } = block;
    return (
      <section
        className="not-prose my-4 rounded-md border bg-muted/20 p-3"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <RouteIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            API Surface
          </span>
          {data.title && <span className="text-sm font-medium">{data.title}</span>}
          <Badge variant="outline">{data.endpoints.length} endpoints</Badge>
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        </div>
        <div className="divide-y rounded-md border bg-background">
          {data.endpoints.map((endpoint) => (
            <div key={endpoint.id} className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
              <Badge variant={methodVariant(endpoint.method)}>{endpoint.method}</Badge>
              <div className="min-w-0">
                <code className="break-all font-mono text-foreground">{endpoint.path}</code>
                {endpoint.summary && <div className="mt-1 text-muted-foreground">{endpoint.summary}</div>}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }
}

type DataModelField = {
  name: string;
  type?: string;
  pk?: boolean;
  nullable?: boolean;
  fk?: string;
  note?: string;
};

type DataModelEntity = {
  id: string;
  name: string;
  fields: DataModelField[];
};

type DataModelData = {
  id: string;
  title?: string;
  entities: DataModelEntity[];
};

function parseNamedSections(body: string): Array<{ label: string; body: string }> {
  const lines = body.split("\n");
  const sections: Array<{ label: string; body: string }> = [];
  let label = "Section";
  let sectionLines: string[] = [];
  const flush = () => {
    const sectionBody = sectionLines.join("\n").trim();
    if (sectionBody) sections.push({ label, body: sectionBody });
    sectionLines = [];
  };

  for (const line of lines) {
    const delimiter = line.match(/^\s*---\s*(.+?)\s*---\s*$/);
    if (delimiter) {
      flush();
      label = delimiter[1].trim();
      continue;
    }
    sectionLines.push(line);
  }
  flush();
  return sections;
}

function parseDataModelField(line: string): DataModelField | null {
  const cleaned = line.trim().replace(/^[-*]\s+/, "");
  const [main, note] = splitNote(cleaned);
  const match = main.match(/^([^:\s]+)\s*:\s*([^\s]+)?\s*(.*)$/);
  if (!match) return null;
  const flags = match[3]
    .split(/\s+/)
    .map((flag) => flag.trim())
    .filter(Boolean);
  const fk = flags.find((flag) => flag.startsWith("fk="))?.slice("fk=".length);
  return {
    name: match[1],
    type: match[2],
    pk: flags.includes("pk"),
    nullable: flags.includes("nullable"),
    fk,
    note,
  };
}

export class DataModelDocsBlock extends DocsMdxBlock<DataModelData> {
  readonly tag = "DataModel";
  readonly type = "data-model";
  readonly targetKind = "data-model";
  readonly label = "Data Model";
  readonly agentDescription =
    "A compact entity and field model with simple field flags such as pk, nullable, and fk=Entity.field.";
  override readonly patchOps = [
    "append-data-entity",
    "update-data-field",
    "remove-data-field",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<DataModelData> | null {
    const id = attr(attrs, "id");
    if (!id) return null;
    const entities = parseNamedSections(body).map((section) => ({
      id: slugify(section.label, "entity"),
      name: section.label,
      fields: section.body
        .split("\n")
        .map(parseDataModelField)
        .filter((field): field is DataModelField => field !== null),
    })).filter((entity) => entity.fields.length > 0);
    if (entities.length === 0) return null;
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: { id, title: attr(attrs, "title"), entities },
    };
  }

  render(block: DocsMdxParsedBlock<DataModelData>) {
    const { data } = block;
    return (
      <section
        className="not-prose my-4 rounded-md border bg-muted/20 p-3"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <DatabaseIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Data Model
          </span>
          {data.title && <span className="text-sm font-medium">{data.title}</span>}
          <Badge variant="outline">{data.entities.length} entities</Badge>
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {data.entities.map((entity) => (
            <section key={entity.id} className="rounded-md border bg-background p-3">
              <h3 className="mb-2 font-display text-sm font-semibold text-foreground">
                {entity.name}
              </h3>
              <div className="divide-y rounded border">
                {entity.fields.map((field) => (
                  <div key={field.name} className="grid gap-1 px-2 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <code className="font-mono text-foreground">{field.name}</code>
                      {field.type && <span className="font-mono text-muted-foreground">{field.type}</span>}
                      {field.pk && <Badge variant="secondary">pk</Badge>}
                      {field.nullable && <Badge variant="outline">nullable</Badge>}
                      {field.fk && <Badge variant="outline">fk {field.fk}</Badge>}
                    </div>
                    {field.note && <div className="text-muted-foreground">{field.note}</div>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    );
  }
}

type DiffData = {
  id: string;
  filename?: string;
  language?: string;
  mode: "unified" | "split";
  before: string;
  after: string;
};

function parseBeforeAfter(body: string): { before: string; after: string } | null {
  const sections = parseNamedSections(body);
  const before = sections.find((section) => /^before$/i.test(section.label))?.body;
  const after = sections.find((section) => /^after$/i.test(section.label))?.body;
  if (!before || !after) return null;
  return { before, after };
}

export class DiffDocsBlock extends DocsMdxBlock<DiffData> {
  readonly tag = "Diff";
  readonly type = "diff";
  readonly targetKind = "diff";
  readonly label = "Diff";
  readonly agentDescription =
    "An inert before/after source diff block using `--- before ---` and `--- after ---` sections.";
  override readonly patchOps = [
    "update-diff-before",
    "update-diff-after",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<DiffData> | null {
    const id = attr(attrs, "id");
    if (!id) return null;
    const parsed = parseBeforeAfter(body);
    if (!parsed) return null;
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: {
        id,
        filename: attr(attrs, "filename"),
        language: attr(attrs, "language"),
        mode: attr(attrs, "mode") === "split" ? "split" : "unified",
        ...parsed,
      },
    };
  }

  render(block: DocsMdxParsedBlock<DiffData>) {
    const { data } = block;
    const beforeLines = data.before.split("\n");
    const afterLines = data.after.split("\n");
    return (
      <section
        className="not-prose my-4 overflow-hidden rounded-md border bg-muted/20"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2">
          <GitCompareIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Diff
          </span>
          {data.filename && <code className="font-mono text-[11px] text-muted-foreground">{data.filename}</code>}
          {data.language && <Badge variant="outline">{data.language}</Badge>}
          <Badge variant="outline">{data.mode}</Badge>
        </div>
        {data.mode === "split" ? (
          <div className="grid gap-0 md:grid-cols-2">
            <DiffPane label="Before" lines={beforeLines} prefix="-" />
            <DiffPane label="After" lines={afterLines} prefix="+" />
          </div>
        ) : (
          <pre className="max-h-[440px] overflow-auto bg-background p-3 font-mono text-xs leading-relaxed">
            {beforeLines.map((line, index) => (
              <div key={`before-${index}`} className="text-destructive">-{line}</div>
            ))}
            {afterLines.map((line, index) => (
              <div key={`after-${index}`} className="text-primary">+{line}</div>
            ))}
          </pre>
        )}
      </section>
    );
  }
}

function DiffPane({
  label,
  lines,
  prefix,
}: {
  label: string;
  lines: string[];
  prefix: "-" | "+";
}) {
  return (
    <section className="min-w-0 border-b bg-background md:border-b-0 md:border-r">
      <div className="border-b bg-muted/30 px-3 py-1.5 font-display text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <pre className="max-h-[320px] overflow-auto p-3 font-mono text-xs leading-relaxed">
        {lines.map((line, index) => (
          <div
            key={`${label}-${index}`}
            className={prefix === "-" ? "text-destructive" : "text-primary"}
          >
            {prefix}{line}
          </div>
        ))}
      </pre>
    </section>
  );
}

type JsonExplorerData = {
  id: string;
  title?: string;
  collapsedDepth: number;
  json: string;
  parsed: unknown | null;
  error?: string;
};

export class JsonExplorerDocsBlock extends DocsMdxBlock<JsonExplorerData> {
  readonly tag = "JsonExplorer";
  readonly type = "json-explorer";
  readonly targetKind = "json-explorer";
  readonly label = "JSON Explorer";
  readonly agentDescription =
    "An inert JSON tree preview that parses JSON text without evaluating code.";
  override readonly patchOps = [
    "update-json-explorer-json",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<JsonExplorerData> | null {
    const id = attr(attrs, "id");
    if (!id) return null;
    const json = body.trim();
    if (!json) return null;
    let parsed: unknown | null = null;
    let error: string | undefined;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      error = err instanceof Error ? err.message : "Invalid JSON";
    }
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: {
        id,
        title: attr(attrs, "title"),
        collapsedDepth: Math.max(0, Number.parseInt(attr(attrs, "collapsedDepth") ?? "2", 10) || 2),
        json,
        parsed,
        error,
      },
    };
  }

  render(block: DocsMdxParsedBlock<JsonExplorerData>) {
    const { data } = block;
    return (
      <section
        className="not-prose my-4 rounded-md border bg-muted/20 p-3"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <BracesIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            JSON Explorer
          </span>
          {data.title && <span className="text-sm font-medium">{data.title}</span>}
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        </div>
        {data.error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <div className="mb-2 text-xs text-destructive">{data.error}</div>
            <pre className="max-h-64 overflow-auto rounded border bg-background p-2 font-mono text-xs">
              {data.json}
            </pre>
          </div>
        ) : (
          <div className="rounded-md border bg-background p-3 font-mono text-xs">
            <JsonTree value={data.parsed} depth={0} collapsedDepth={data.collapsedDepth} />
          </div>
        )}
      </section>
    );
  }
}

function JsonTree({
  value,
  depth,
  collapsedDepth,
}: {
  value: unknown;
  depth: number;
  collapsedDepth: number;
}) {
  if (value === null || typeof value !== "object") {
    return <span className="text-primary">{JSON.stringify(value)}</span>;
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value as Record<string, unknown>);
  const open = depth < collapsedDepth;
  return (
    <details open={open} className={depth > 0 ? "ml-4" : undefined}>
      <summary className="cursor-pointer text-muted-foreground">
        {Array.isArray(value) ? `Array(${entries.length})` : `Object(${entries.length})`}
      </summary>
      <div className="mt-1 grid gap-1">
        {entries.map(([key, entryValue]) => (
          <div key={key} className="grid grid-cols-[max-content_minmax(0,1fr)] gap-2">
            <span className="text-muted-foreground">{key}:</span>
            <JsonTree value={entryValue} depth={depth + 1} collapsedDepth={collapsedDepth} />
          </div>
        ))}
      </div>
    </details>
  );
}

type CodeAnnotation = {
  lines: string;
  label?: string;
  note: string;
};

type AnnotatedCodeData = {
  id: string;
  filename?: string;
  language?: string;
  code: string;
  annotations: CodeAnnotation[];
};

function parseCodeAnnotation(line: string): CodeAnnotation | null {
  const cleaned = line.trim().replace(/^[-*]\s+/, "");
  const [rangeAndLabel, note] = splitNote(cleaned);
  if (!note) return null;
  const [lines, label] = rangeAndLabel.split("|").map((part) => part.trim());
  if (!lines) return null;
  return { lines, label: label || undefined, note };
}

export class AnnotatedCodeDocsBlock extends DocsMdxBlock<AnnotatedCodeData> {
  readonly tag = "AnnotatedCode";
  readonly type = "annotated-code";
  readonly targetKind = "annotated-code";
  readonly label = "Annotated Code";
  readonly agentDescription =
    "A source code block with line-referenced notes parsed from `--- code ---` and `--- annotations ---` sections.";
  override readonly patchOps = [
    "update-annotated-code",
    "append-code-annotation",
    "remove-code-annotation",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<AnnotatedCodeData> | null {
    const id = attr(attrs, "id");
    if (!id) return null;
    const sections = parseNamedSections(body);
    const code = sections.find((section) => /^code$/i.test(section.label))?.body ?? body.trim();
    const annotations = sections
      .find((section) => /^annotations$/i.test(section.label))
      ?.body.split("\n")
      .map(parseCodeAnnotation)
      .filter((annotation): annotation is CodeAnnotation => annotation !== null) ?? [];
    if (!code) return null;
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: {
        id,
        filename: attr(attrs, "filename"),
        language: attr(attrs, "language"),
        code,
        annotations,
      },
    };
  }

  render(block: DocsMdxParsedBlock<AnnotatedCodeData>) {
    const { data } = block;
    const lines = data.code.split("\n");
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
            Annotated Code
          </span>
          {data.filename && <code className="font-mono text-[11px] text-muted-foreground">{data.filename}</code>}
          {data.language && <Badge variant="outline">{data.language}</Badge>}
        </div>
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <pre className="max-h-[440px] overflow-auto bg-background p-0 font-mono text-xs leading-relaxed">
            {lines.map((line, index) => (
              <div key={index} className="grid grid-cols-[3rem_minmax(0,1fr)] border-b border-border/30">
                <span className="select-none bg-muted/40 px-2 py-1 text-right text-muted-foreground">
                  {index + 1}
                </span>
                <code className="px-3 py-1">{line || " "}</code>
              </div>
            ))}
          </pre>
          <aside className="border-t bg-background p-3 lg:border-l lg:border-t-0">
            <div className="mb-2 font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Notes
            </div>
            {data.annotations.length > 0 ? (
              <div className="grid gap-2">
                {data.annotations.map((annotation) => (
                  <div key={`${annotation.lines}-${annotation.label ?? annotation.note}`} className="rounded border bg-muted/20 p-2 text-xs">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">lines {annotation.lines}</Badge>
                      {annotation.label && <span className="font-medium">{annotation.label}</span>}
                    </div>
                    <div className="text-muted-foreground">{annotation.note}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No line notes.</div>
            )}
          </aside>
        </div>
      </section>
    );
  }
}

export const engineeringDocsBlocks = [
  new ImplementationMapDocsBlock(),
  new ApiEndpointDocsBlock(),
  new ApiSurfaceDocsBlock(),
  new DataModelDocsBlock(),
  new DiffDocsBlock(),
  new JsonExplorerDocsBlock(),
  new AnnotatedCodeDocsBlock(),
];
