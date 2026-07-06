"use client";

import type { CSSProperties } from "react";
import {
  Code2Icon,
  GitBranchIcon,
  NetworkIcon,
  WorkflowIcon,
} from "lucide-react";
import { Badge } from "../../ui/badge";
import { cn } from "../../ui/cn";
import { attr, slugify } from "../attrs";
import {
  DocsMdxBlock,
  type DocsMdxParsedBlock,
} from "../base";

function splitNote(value: string): [string, string | undefined] {
  const [main, ...noteParts] = value.split(/\s+(?:--|::)\s+/);
  return [main.trim(), noteParts.join(" - ").trim() || undefined];
}

type NamedSection = {
  label: string;
  body: string;
};

function parseNamedSections(body: string): NamedSection[] {
  const lines = body.split("\n");
  const sections: NamedSection[] = [];
  let label = "nodes";
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
      label = delimiter[1].trim().toLowerCase();
      continue;
    }
    sectionLines.push(line);
  }

  flush();
  return sections;
}

type DiagramNode = {
  id: string;
  label: string;
  detail?: string;
  x?: number;
  y?: number;
};

type DiagramEdge = {
  from: string;
  to: string;
  label?: string;
};

type DiagramNote = {
  id: string;
  text: string;
};

type DiagramData = {
  id: string;
  title?: string;
  caption?: string;
  layout: "linear" | "positioned";
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  notes: DiagramNote[];
};

function clampPercent(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(6, Math.min(94, value));
}

function parseNodeCoordinates(value: string): {
  main: string;
  x?: number;
  y?: number;
} {
  const match = value.match(/\s+@\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return { main: value.trim() };
  return {
    main: value.slice(0, match.index).trim(),
    x: clampPercent(Number.parseFloat(match[1])),
    y: clampPercent(Number.parseFloat(match[2])),
  };
}

function parseDiagramNode(line: string, index: number): DiagramNode | null {
  const cleaned = line.trim().replace(/^[-*]\s+/, "");
  if (!cleaned) return null;
  const [mainWithCoordinates, detail] = splitNote(cleaned);
  const { main, x, y } = parseNodeCoordinates(mainWithCoordinates);
  const pipeParts = main.split("|").map((part) => part.trim());
  const colonMatch = main.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
  const rawId = pipeParts.length >= 2 ? pipeParts[0] : colonMatch?.[1];
  const rawLabel = pipeParts.length >= 2 ? pipeParts.slice(1).join(" | ") : colonMatch?.[2] ?? main;
  const label = rawLabel.trim();
  if (!label) return null;
  const id = slugify(rawId || label, `node-${index + 1}`);
  return { id, label, detail, x, y };
}

function parseDiagramEdge(line: string): DiagramEdge | null {
  const cleaned = line.trim().replace(/^[-*]\s+/, "");
  if (!cleaned) return null;
  const [main, label] = splitNote(cleaned);
  const match = main.match(/^([A-Za-z0-9_-]+)\s*-+>\s*([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  return {
    from: slugify(match[1], match[1]),
    to: slugify(match[2], match[2]),
    label,
  };
}

function parseDiagramNote(line: string, index: number): DiagramNote | null {
  const cleaned = line.trim().replace(/^[-*]\s+/, "");
  if (!cleaned) return null;
  const [rawId, text] = cleaned.split("|").map((part) => part.trim());
  const noteText = text || cleaned;
  return {
    id: slugify(text ? rawId : noteText, `note-${index + 1}`),
    text: noteText,
  };
}

function orderedDiagramNodes(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const toIds = new Set(edges.map((edge) => edge.to));
  const start = nodes.find((node) => !toIds.has(node.id)) ?? nodes[0];
  if (!start) return nodes;
  const ordered: DiagramNode[] = [];
  const visited = new Set<string>();
  let current: DiagramNode | undefined = start;

  while (current && !visited.has(current.id)) {
    ordered.push(current);
    visited.add(current.id);
    const nextEdge = edges.find((edge) => edge.from === current?.id && !visited.has(edge.to));
    current = nextEdge ? nodeById.get(nextEdge.to) : undefined;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) ordered.push(node);
  }
  return ordered;
}

export class DiagramDocsBlock extends DocsMdxBlock<DiagramData> {
  readonly tag = "Diagram";
  readonly type = "diagram";
  readonly targetKind = "diagram";
  readonly label = "Diagram";
  readonly agentDescription =
    "A safe read-only node/edge diagram using section-delimited text; HTML and SVG fragments are intentionally not executed.";
  override readonly patchOps = [
    "append-diagram-node",
    "update-diagram-node",
    "append-diagram-edge",
    "remove-diagram-edge",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<DiagramData> | null {
    const id = attr(attrs, "id");
    if (!id) return null;
    const sections = parseNamedSections(body);
    const nodeBody = sections
      .filter((section) => /^nodes?$/.test(section.label))
      .map((section) => section.body)
      .join("\n");
    const edgeBody = sections
      .filter((section) => /^edges?$/.test(section.label))
      .map((section) => section.body)
      .join("\n");
    const noteBody = sections
      .filter((section) => /^notes?$/.test(section.label))
      .map((section) => section.body)
      .join("\n");
    const nodes = nodeBody
      .split("\n")
      .map(parseDiagramNode)
      .filter((node): node is DiagramNode => node !== null);
    if (nodes.length === 0) return null;
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = edgeBody
      .split("\n")
      .map(parseDiagramEdge)
      .filter((edge): edge is DiagramEdge => {
        return edge !== null && nodeIds.has(edge.from) && nodeIds.has(edge.to);
      });
    const notes = noteBody
      .split("\n")
      .map(parseDiagramNote)
      .filter((note): note is DiagramNote => note !== null);
    const layout =
      attr(attrs, "layout") === "positioned" ||
      nodes.some((node) => typeof node.x === "number" && typeof node.y === "number")
        ? "positioned"
        : "linear";

    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: {
        id,
        title: attr(attrs, "title"),
        caption: attr(attrs, "caption"),
        layout,
        nodes,
        edges,
        notes,
      },
    };
  }

  render(block: DocsMdxParsedBlock<DiagramData>) {
    const { data } = block;
    return (
      <section
        className="not-prose my-4 rounded-md border bg-muted/20 p-3"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <NetworkIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Diagram
          </span>
          {data.title && <span className="text-sm font-medium">{data.title}</span>}
          <Badge variant="outline">{data.layout}</Badge>
          <Badge variant="outline">{data.nodes.length} nodes</Badge>
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        </div>
        {data.layout === "positioned" ? (
          <PositionedDiagram data={data} />
        ) : (
          <LinearDiagram data={data} />
        )}
        {data.caption && (
          <div className="mt-3 text-xs text-muted-foreground">{data.caption}</div>
        )}
        {data.notes.length > 0 && (
          <div className="mt-3 grid gap-2 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-2">
            {data.notes.map((note) => (
              <div key={note.id} className="rounded border bg-background/60 p-2">
                {note.text}
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }
}

function LinearDiagram({ data }: { data: DiagramData }) {
  const nodes = orderedDiagramNodes(data.nodes, data.edges);
  return (
    <div className="overflow-auto rounded-md border bg-background p-3">
      <div className="flex min-w-max items-stretch gap-3 pb-1">
        {nodes.map((node, index) => {
          const next = nodes[index + 1];
          const edge = next
            ? data.edges.find((candidate) => candidate.from === node.id && candidate.to === next.id)
            : undefined;
          return (
            <div key={node.id} className="flex items-center gap-3">
              <DiagramNodeCard node={node} index={index} />
              {next && (
                <div className="grid min-w-[72px] justify-items-center gap-1 text-muted-foreground">
                  {edge?.label && (
                    <span className="max-w-[96px] truncate rounded-full border bg-muted/40 px-2 py-0.5 text-[11px]">
                      {edge.label}
                    </span>
                  )}
                  <span className="h-px w-full border-t border-dashed" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PositionedDiagram({ data }: { data: DiagramData }) {
  const nodes = data.nodes.map((node, index) => ({
    ...node,
    x: clampPercent(node.x ?? 14 + index * (72 / Math.max(data.nodes.length - 1, 1))) ?? 50,
    y: clampPercent(node.y ?? 50) ?? 50,
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-md border bg-background">
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {data.edges.map((edge, index) => {
          const from = nodeById.get(edge.from);
          const to = nodeById.get(edge.to);
          if (!from || !to) return null;
          return (
            <line
              key={`${edge.from}-${edge.to}-${index}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className="stroke-muted-foreground/40"
              strokeWidth="0.45"
              strokeDasharray="1.5 1.5"
            />
          );
        })}
      </svg>
      {nodes.map((node, index) => {
        const style: CSSProperties = {
          left: `${node.x}%`,
          top: `${node.y}%`,
          transform: "translate(-50%, -50%)",
        };
        return (
          <div key={node.id} className="absolute w-[11rem]" style={style}>
            <DiagramNodeCard node={node} index={index} />
          </div>
        );
      })}
      {data.edges.some((edge) => edge.label) && (
        <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1.5">
          {data.edges.map((edge, index) =>
            edge.label ? (
              <Badge key={`${edge.from}-${edge.to}-${index}`} variant="outline">
                {edge.from} {"->"} {edge.to}: {edge.label}
              </Badge>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

function DiagramNodeCard({ node, index }: { node: DiagramNode; index: number }) {
  return (
    <article className="min-h-[92px] w-[11rem] rounded-md border bg-muted/20 p-3 text-xs shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="secondary">{index + 1}</Badge>
        <code className="truncate font-mono text-[10px] text-muted-foreground">{node.id}</code>
      </div>
      <h3 className="text-sm font-semibold leading-tight text-foreground">{node.label}</h3>
      {node.detail && (
        <p className="mt-2 line-clamp-3 leading-relaxed text-muted-foreground">{node.detail}</p>
      )}
    </article>
  );
}

type FlowStepState = "queued" | "current" | "done" | "blocked" | "optional";

type FlowStep = {
  id: string;
  label: string;
  note?: string;
  state?: FlowStepState;
};

type FlowData = {
  id: string;
  title?: string;
  orientation: "vertical" | "horizontal";
  steps: FlowStep[];
};

function parseFlowStep(line: string, index: number): FlowStep | null {
  const cleaned = line.trim().replace(/^[-*]\s+/, "");
  if (!cleaned) return null;
  const stateMatch = cleaned.match(/^\[(queued|current|done|blocked|optional)\]\s+/i);
  const state = stateMatch?.[1]?.toLowerCase() as FlowStepState | undefined;
  const withoutState = stateMatch ? cleaned.slice(stateMatch[0].length).trim() : cleaned;
  const [label, note] = splitNote(withoutState);
  if (!label) return null;
  return {
    id: slugify(label, `step-${index + 1}`),
    label,
    note,
    state,
  };
}

function flowStateVariant(
  state: FlowStepState | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  if (state === "done") return "secondary";
  if (state === "current") return "default";
  if (state === "blocked") return "destructive";
  return "outline";
}

export class FlowDocsBlock extends DocsMdxBlock<FlowData> {
  readonly tag = "Flow";
  readonly type = "flow";
  readonly targetKind = "flow";
  readonly label = "Flow";
  readonly agentDescription =
    "A safe ordered workflow block using markdown bullet steps with optional state and note metadata.";
  override readonly patchOps = [
    "append-flow-step",
    "update-flow-step",
    "remove-flow-step",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<FlowData> | null {
    const id = attr(attrs, "id");
    if (!id) return null;
    const steps = body
      .split("\n")
      .map(parseFlowStep)
      .filter((step): step is FlowStep => step !== null);
    if (steps.length === 0) return null;
    const orientation = attr(attrs, "orientation") === "horizontal" ? "horizontal" : "vertical";
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: {
        id,
        title: attr(attrs, "title"),
        orientation,
        steps,
      },
    };
  }

  render(block: DocsMdxParsedBlock<FlowData>) {
    const { data } = block;
    return (
      <section
        className="not-prose my-4 rounded-md border bg-muted/20 p-3"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <WorkflowIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Flow
          </span>
          {data.title && <span className="text-sm font-medium">{data.title}</span>}
          <Badge variant="outline">{data.steps.length} steps</Badge>
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        </div>
        <div
          className={cn(
            "rounded-md border bg-background p-3",
            data.orientation === "horizontal"
              ? "grid gap-3 md:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]"
              : "grid gap-2",
          )}
        >
          {data.steps.map((step, index) => (
            <div key={step.id} className="grid gap-2 text-xs">
              <div className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted/30 font-mono text-[11px]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 rounded-md border bg-muted/20 p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-foreground">{step.label}</span>
                    {step.state && <Badge variant={flowStateVariant(step.state)}>{step.state}</Badge>}
                  </div>
                  {step.note && <div className="text-muted-foreground">{step.note}</div>}
                </div>
              </div>
              {index < data.steps.length - 1 && data.orientation === "vertical" && (
                <div className="ml-3 h-4 border-l border-dashed" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }
}

type MermaidData = {
  id: string;
  title?: string;
  caption?: string;
  diagramType?: string;
  source: string;
};

export class MermaidDocsBlock extends DocsMdxBlock<MermaidData> {
  readonly tag = "Mermaid";
  readonly type = "mermaid";
  readonly targetKind = "mermaid";
  readonly label = "Mermaid";
  readonly agentDescription =
    "An inert Mermaid source block. It preserves Mermaid grammar for review without rendering generated SVG or HTML.";
  override readonly patchOps = [
    "update-mermaid-source",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<MermaidData> | null {
    const id = attr(attrs, "id");
    const sourceText = body.trim();
    if (!id || !sourceText) return null;
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: {
        id,
        title: attr(attrs, "title"),
        caption: attr(attrs, "caption"),
        diagramType: attr(attrs, "diagramType") ?? sourceText.split(/\s+/)[0],
        source: sourceText,
      },
    };
  }

  render(block: DocsMdxParsedBlock<MermaidData>) {
    const { data } = block;
    return (
      <section
        className="not-prose my-4 overflow-hidden rounded-md border bg-muted/20"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2">
          <GitBranchIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Mermaid
          </span>
          {data.title && <span className="text-sm font-medium">{data.title}</span>}
          {data.diagramType && <Badge variant="outline">{data.diagramType}</Badge>}
          <Badge variant="secondary">inert source</Badge>
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        </div>
        <pre className="max-h-[360px] overflow-auto bg-background p-3 font-mono text-xs leading-relaxed">
          <code>
            {data.source}
          </code>
        </pre>
        {data.caption && (
          <div className="border-t bg-background px-3 py-2 text-xs text-muted-foreground">
            <Code2Icon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            {data.caption}
          </div>
        )}
      </section>
    );
  }
}

export const diagramDocsBlocks = [
  new DiagramDocsBlock(),
  new FlowDocsBlock(),
  new MermaidDocsBlock(),
];
