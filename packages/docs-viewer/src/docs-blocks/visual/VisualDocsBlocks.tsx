"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  AppWindowIcon,
  ArrowRightIcon,
  FrameIcon,
  LayoutPanelTopIcon,
  MonitorIcon,
  MousePointerClickIcon,
  PanelsTopLeftIcon,
} from "lucide-react";
import { Badge } from "../../ui/badge";
import { cn } from "../../ui/cn";
import { attr, slugify } from "../attrs";
import {
  DocsMdxBlock,
  type DocsMdxBlockRenderContext,
  type DocsMdxParsedBlock,
} from "../base";

type SurfaceKind = "desktop" | "mobile" | "tablet" | "browser" | "panel" | "popover";

type VisualRegion = {
  id: string;
  label: string;
  note?: string;
  kind?: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type VisualConnection = {
  from: string;
  to: string;
  label?: string;
};

type BoardData = {
  id: string;
  title?: string;
  mode: "wireframe" | "design";
  frames: VisualRegion[];
  connectors: VisualConnection[];
  notes: Array<{ id: string; text: string }>;
};

type CanvasSidecarData = {
  id: string;
  title?: string;
  src: string;
};

type BoardBlockData = BoardData | CanvasSidecarData;

type SurfaceData = {
  id: string;
  title?: string;
  surface: SurfaceKind;
  caption?: string;
  regions: VisualRegion[];
};

type PrototypeScreenData = SurfaceData & {
  summary?: string;
};

type PrototypeData = {
  id: string;
  title?: string;
  initial?: string;
  surface: SurfaceKind;
  screens: PrototypeScreenData[];
  transitions: VisualConnection[];
};

type PrototypeTransitionData = {
  id: string;
  from: string;
  to: string;
  label?: string;
  trigger?: string;
  body?: string;
};

function splitNote(value: string): [string, string | undefined] {
  const [main, ...noteParts] = value.split(/\s+(?:--|::)\s+/);
  return [main.trim(), noteParts.join(" - ").trim() || undefined];
}

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

function parseSurface(value: string | undefined, fallback: SurfaceKind): SurfaceKind {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "desktop" ||
    normalized === "mobile" ||
    normalized === "tablet" ||
    normalized === "browser" ||
    normalized === "panel" ||
    normalized === "popover"
  ) {
    return normalized;
  }
  return fallback;
}

type NamedSection = {
  label: string;
  body: string;
};

function parseNamedSections(body: string, fallbackLabel = "regions"): NamedSection[] {
  const lines = body.split("\n");
  const sections: NamedSection[] = [];
  let label = fallbackLabel;
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

function sectionBody(sections: NamedSection[], labels: string[]): string {
  const labelSet = new Set(labels);
  return sections
    .filter((section) => labelSet.has(section.label))
    .map((section) => section.body)
    .join("\n");
}

function parseSpatialRegion(line: string, index: number): VisualRegion | null {
  const cleaned = line.trim().replace(/^[-*]\s+/, "");
  if (!cleaned) return null;
  const [mainWithNote, note] = splitNote(cleaned);
  const geometryMatch = mainWithNote.match(
    /\s+@\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*x\s*(-?\d+(?:\.\d+)?)\s*$/i,
  );
  const main = geometryMatch
    ? mainWithNote.slice(0, geometryMatch.index).trim()
    : mainWithNote.trim();
  const parts = main.split("|").map((part) => part.trim());
  const rawId = parts.length >= 2 ? parts[0] : undefined;
  const label = parts.length >= 2 ? parts[1] : main;
  const kind = parts.length >= 3 ? parts[2] : undefined;
  if (!label) return null;
  const fallbackX = 8 + (index % 3) * 30;
  const fallbackY = 10 + Math.floor(index / 3) * 30;
  return {
    id: slugify(rawId || label, `region-${index + 1}`),
    label,
    kind,
    note,
    x: clampPercent(Number.parseFloat(geometryMatch?.[1] ?? ""), fallbackX),
    y: clampPercent(Number.parseFloat(geometryMatch?.[2] ?? ""), fallbackY),
    width: clampPercent(Number.parseFloat(geometryMatch?.[3] ?? ""), 24),
    height: clampPercent(Number.parseFloat(geometryMatch?.[4] ?? ""), 24),
  };
}

function parseRegions(body: string): VisualRegion[] {
  return body
    .split("\n")
    .map(parseSpatialRegion)
    .filter((region): region is VisualRegion => region !== null);
}

function parseConnection(line: string): VisualConnection | null {
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

function parseConnections(body: string, validIds?: Set<string>): VisualConnection[] {
  return body
    .split("\n")
    .map(parseConnection)
    .filter((connection): connection is VisualConnection => {
      return (
        connection !== null &&
        (!validIds || (validIds.has(connection.from) && validIds.has(connection.to)))
      );
    });
}

function parseNote(line: string, index: number): { id: string; text: string } | null {
  const cleaned = line.trim().replace(/^[-*]\s+/, "");
  if (!cleaned) return null;
  const [rawId, text] = cleaned.split("|").map((part) => part.trim());
  const noteText = text || cleaned;
  return {
    id: slugify(text ? rawId : noteText, `note-${index + 1}`),
    text: noteText,
  };
}

function parseNotes(body: string): Array<{ id: string; text: string }> {
  return body
    .split("\n")
    .map(parseNote)
    .filter((note): note is { id: string; text: string } => note !== null);
}

function surfaceAspect(surface: SurfaceKind): string {
  if (surface === "mobile") return "9 / 16";
  if (surface === "tablet") return "4 / 5";
  if (surface === "popover") return "4 / 3";
  if (surface === "panel") return "3 / 4";
  return "16 / 10";
}

function targetAttrs(parentId: string, targetType: string, region: VisualRegion) {
  return {
    "data-docs-target": "true",
    "data-docs-target-type": targetType,
    "data-source-id": `${parentId}:${region.id}`,
    "data-docs-target-label": `${targetType}: ${region.label}`,
  };
}

function regionStyle(region: VisualRegion): CSSProperties {
  return {
    left: `${region.x}%`,
    top: `${region.y}%`,
    width: `${region.width}%`,
    height: `${region.height}%`,
  };
}

function frameCenter(region: VisualRegion): { x: number; y: number } {
  return {
    x: region.x + region.width / 2,
    y: region.y + region.height / 2,
  };
}

function visualTone(targetType: string, kind?: string) {
  const normalized = `${targetType} ${kind ?? ""}`.toLowerCase();
  if (normalized.includes("prototype")) {
    return {
      border: "border-primary/30",
      bg: "bg-primary/5",
      text: "text-primary",
      badge: "border-primary/30 bg-primary/5 text-primary",
      ring: "ring-primary/25",
    };
  }
  if (normalized.includes("wireframe") || normalized.includes("nav")) {
    return {
      border: "border-primary/30",
      bg: "bg-primary/5",
      text: "text-primary",
      badge: "border-primary/30 bg-primary/5 text-primary",
      ring: "ring-primary/25",
    };
  }
  if (normalized.includes("content") || normalized.includes("screen")) {
    return {
      border: "border-primary/30",
      bg: "bg-primary/5",
      text: "text-primary",
      badge: "border-primary/30 bg-primary/5 text-primary",
      ring: "ring-primary/25",
    };
  }
  if (normalized.includes("panel") || normalized.includes("toolbar") || normalized.includes("list")) {
    return {
      border: "border-primary/30",
      bg: "bg-primary/5",
      text: "text-primary",
      badge: "border-primary/30 bg-primary/5 text-primary",
      ring: "ring-primary/25",
    };
  }
  return {
    border: "border-primary/30",
    bg: "bg-primary/5",
    text: "text-primary",
    badge: "border-primary/30 bg-primary/5 text-primary",
    ring: "ring-primary/25",
  };
}

function VisualRegionBox({
  parentId,
  targetType,
  region,
  compact = false,
}: {
  parentId: string;
  targetType: string;
  region: VisualRegion;
  compact?: boolean;
}) {
  const tone = visualTone(targetType, region.kind);
  return (
    <div
      className={cn(
        "absolute overflow-hidden rounded-md border-2 p-2 text-xs shadow-sm ring-1",
        tone.border,
        tone.bg,
        tone.ring,
        compact && "p-1.5 text-[11px]",
      )}
      style={regionStyle(region)}
      {...targetAttrs(parentId, targetType, region)}
    >
      <div className="flex min-w-0 items-center gap-1">
        {region.kind && <Badge variant="outline" className={tone.badge}>{region.kind}</Badge>}
        <span className={cn("truncate font-medium", tone.text)}>{region.label}</span>
      </div>
      {region.note && !compact && (
        <div className="mt-1 line-clamp-2 text-muted-foreground">{region.note}</div>
      )}
    </div>
  );
}

function SurfaceFrame({
  data,
  blockTag,
  blockType,
  label,
  regionTargetType,
  icon,
}: {
  data: SurfaceData;
  blockTag: string;
  blockType: string;
  label: string;
  regionTargetType: string;
  icon: "wireframe" | "screen" | "artboard";
}) {
  const Icon =
    icon === "wireframe"
      ? LayoutPanelTopIcon
      : icon === "screen"
        ? AppWindowIcon
        : FrameIcon;
  const shellTone =
    icon === "wireframe"
      ? "border-primary/30 bg-primary/5"
      : icon === "screen"
        ? "border-primary/30 bg-primary/5"
        : "border-primary/30 bg-primary/5";
  return (
    <section
      className={cn("not-prose my-4 overflow-hidden rounded-md border bg-background shadow-sm", shellTone)}
      data-mdx-block={blockTag}
      data-docs-block-type={blockType}
      data-source-id={data.id}
    >
      <div className="flex flex-wrap items-center gap-2 border-b bg-background/70 px-3 py-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {data.title && <span className="text-sm font-medium">{data.title}</span>}
        <Badge variant="outline">{data.surface}</Badge>
        <Badge variant="outline">{data.regions.length} targets</Badge>
        <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
      </div>
      <div className="p-3">
        <div className="mx-auto w-full max-w-[980px]">
        <div
          className="relative overflow-hidden rounded-md border bg-background shadow-inner"
          style={{ aspectRatio: surfaceAspect(data.surface) }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          <div className="absolute inset-x-0 top-0 h-7 border-b bg-background/85" />
          {data.regions.map((region) => (
            <VisualRegionBox
              key={region.id}
              parentId={data.id}
              targetType={regionTargetType}
              region={region}
            />
          ))}
          </div>
        </div>
      </div>
      {data.caption && (
        <div className="border-t bg-background/70 px-3 py-2 text-xs text-muted-foreground">{data.caption}</div>
      )}
    </section>
  );
}

function parseSurfaceData(
  attrs: Record<string, string>,
  body: string,
  fallbackTitle?: string,
): SurfaceData | null {
  const id = attr(attrs, "id");
  if (!id) return null;
  const sections = parseNamedSections(body, "regions");
  const regionsBody = sectionBody(sections, ["regions", "nodes", "screen"]) || body;
  const regions = parseRegions(regionsBody);
  if (regions.length === 0) return null;
  return {
    id,
    title: attr(attrs, "title") ?? fallbackTitle,
    surface: parseSurface(attr(attrs, "surface"), "desktop"),
    caption: attr(attrs, "caption"),
    regions,
  };
}

function parseBoardData(
  attrs: Record<string, string>,
  body: string,
  fallbackMode: "wireframe" | "design",
): BoardData | null {
  const id = attr(attrs, "id");
  if (!id) return null;
  const sections = parseNamedSections(body, "artboards");
  const frames = parseRegions(sectionBody(sections, ["artboards", "frames", "screens"]));
  if (frames.length === 0) return null;
  const frameIds = new Set(frames.map((frame) => frame.id));
  return {
    id,
    title: attr(attrs, "title"),
    mode: attr(attrs, "mode") === "design" ? "design" : fallbackMode,
    frames,
    connectors: parseConnections(sectionBody(sections, ["connectors", "flow", "transitions"]), frameIds),
    notes: parseNotes(sectionBody(sections, ["notes", "annotations"])),
  };
}

function parseCanvasSidecarData(attrs: Record<string, string>): CanvasSidecarData | null {
  const id = attr(attrs, "id");
  const src = attr(attrs, "src");
  if (!id || !src) return null;
  return {
    id,
    title: attr(attrs, "title"),
    src,
  };
}

function isCanvasSidecarData(data: BoardBlockData): data is CanvasSidecarData {
  return "src" in data;
}

function BoardSurface({ data, tag }: { data: BoardData; tag: "DesignBoard" | "Canvas" }) {
  const frameById = new Map(data.frames.map((frame) => [frame.id, frame]));
  const shellTone =
    tag === "Canvas"
      ? "border-primary/30 bg-primary/5"
      : "border-primary/30 bg-primary/5";
  return (
    <section
      className={cn("not-prose my-4 overflow-hidden rounded-md border bg-background shadow-sm", shellTone)}
      data-mdx-block={tag}
      data-docs-block-type={tag === "Canvas" ? "canvas" : "design-board"}
      data-source-id={data.id}
    >
      <div className="flex flex-wrap items-center gap-2 border-b bg-background/75 px-3 py-2">
        <PanelsTopLeftIcon className="h-4 w-4 text-muted-foreground" />
        <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {tag === "Canvas" ? "Canvas" : "Design Board"}
        </span>
        {data.title && <span className="text-sm font-medium">{data.title}</span>}
        <Badge variant="outline">{data.mode}</Badge>
        <Badge variant="outline">{data.frames.length} artboards</Badge>
        <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
      </div>
      <div className="p-3">
      <div className="relative min-h-[360px] overflow-hidden rounded-md border bg-background shadow-inner" style={{ aspectRatio: "16 / 9" }}>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="absolute inset-x-0 top-0 h-8 border-b bg-background/85" />
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker
              id={`${data.id}-arrow`}
              markerHeight="5"
              markerWidth="5"
              orient="auto"
              refX="4"
              refY="2.5"
            >
              <path d="M0,0 L5,2.5 L0,5 Z" className="fill-muted-foreground/65" />
            </marker>
          </defs>
          {data.connectors.map((connector, index) => {
            const from = frameById.get(connector.from);
            const to = frameById.get(connector.to);
            if (!from || !to) return null;
            const fromCenter = frameCenter(from);
            const toCenter = frameCenter(to);
            return (
              <line
                key={`${connector.from}-${connector.to}-${index}`}
                x1={fromCenter.x}
                y1={fromCenter.y}
                x2={toCenter.x}
                y2={toCenter.y}
                className="stroke-muted-foreground/60"
                strokeWidth="0.45"
                strokeDasharray="1.5 1.1"
                markerEnd={`url(#${data.id}-arrow)`}
              />
            );
          })}
        </svg>
        {data.frames.map((frame) => {
          const tone = visualTone("artboard", frame.kind);
          return (
            <div
              key={frame.id}
              className={cn(
                "absolute overflow-hidden rounded-md border-2 bg-background p-2 shadow-md ring-1",
                tone.border,
                tone.ring,
              )}
              style={regionStyle(frame)}
              {...targetAttrs(data.id, "artboard", frame)}
            >
              <div className={cn("mb-2 flex items-center gap-1.5 rounded-sm px-1.5 py-1", tone.bg)}>
                <FrameIcon className={cn("h-3.5 w-3.5", tone.text)} />
                <span className={cn("truncate text-xs font-semibold", tone.text)}>{frame.label}</span>
                {frame.kind && <Badge variant="outline" className={tone.badge}>{frame.kind}</Badge>}
              </div>
              <div className="grid h-[calc(100%-2rem)] gap-1 rounded border bg-muted/20 p-2">
                <div className={cn("h-2 rounded", tone.bg)} />
                <div className="grid grid-cols-[0.42fr_1fr] gap-1">
                  <div className={cn("rounded", tone.bg)} />
                  <div className="grid gap-1">
                    <div className="rounded bg-muted/70" />
                    <div className="rounded bg-muted/45" />
                    <div className="rounded bg-muted/30" />
                  </div>
                </div>
              </div>
              {frame.note && (
                <div className="mt-1 truncate text-[11px] text-muted-foreground">{frame.note}</div>
              )}
            </div>
          );
        })}
        {data.connectors.some((connector) => connector.label) && (
          <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1.5">
            {data.connectors.map((connector, index) =>
              connector.label ? (
                <Badge key={`${connector.from}-${connector.to}-${index}`} variant="outline" className="bg-background/90">
                  {connector.from} {"->"} {connector.to}: {connector.label}
                </Badge>
              ) : null,
            )}
          </div>
        )}
      </div>
      </div>
      {data.notes.length > 0 && (
        <div className="grid gap-2 border-t bg-background/70 p-3 text-xs text-muted-foreground sm:grid-cols-2">
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

class BoardDocsBlock extends DocsMdxBlock<BoardBlockData> {
  readonly tag: "DesignBoard" | "Canvas";
  readonly type: "design-board" | "canvas";
  readonly targetKind: "design-board" | "canvas";
  readonly label: string;
  readonly agentDescription: string;
  override readonly patchOps = [
    "append-artboard",
    "update-artboard",
    "append-board-connector",
    "remove-board-connector",
    "replace-mdx-block",
  ] as const;

  constructor(config: {
    tag: "DesignBoard" | "Canvas";
    type: "design-board" | "canvas";
    targetKind: "design-board" | "canvas";
    label: string;
    description: string;
    fallbackMode: "wireframe" | "design";
  }) {
    super();
    this.tag = config.tag;
    this.type = config.type;
    this.targetKind = config.targetKind;
    this.label = config.label;
    this.agentDescription = config.description;
    this.fallbackMode = config.fallbackMode;
  }

  private readonly fallbackMode: "wireframe" | "design";

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<BoardBlockData> | null {
    const sidecarData = this.tag === "Canvas" ? parseCanvasSidecarData(attrs) : null;
    const data = sidecarData ?? parseBoardData(attrs, body, this.fallbackMode);
    return data
      ? {
          tag: this.tag,
          type: this.type,
          targetKind: this.targetKind,
          sourceId: data.id,
          data,
        }
      : null;
  }

  render(
    block: DocsMdxParsedBlock<BoardBlockData>,
    ctx: DocsMdxBlockRenderContext,
  ) {
    if (isCanvasSidecarData(block.data)) {
      return ctx.renderCanvas ? (
        ctx.renderCanvas({
          id: block.data.id,
          src: block.data.src,
          title: block.data.title,
          sourceId: block.sourceId,
        })
      ) : (
        <section
          className="not-prose my-4 rounded-md border bg-background p-4 text-sm text-muted-foreground"
          data-mdx-block="Canvas"
          data-docs-block-type="canvas"
          data-source-id={block.data.id}
        >
          Canvas sidecar: {block.data.src}
        </section>
      );
    }
    return <BoardSurface data={block.data} tag={this.tag} />;
  }
}

export class WireframeDocsBlock extends DocsMdxBlock<SurfaceData> {
  readonly tag = "Wireframe";
  readonly type = "wireframe";
  readonly targetKind = "wireframe";
  readonly label = "Wireframe";
  readonly agentDescription =
    "A safe docs-native wireframe with targetable regions; arbitrary HTML/CSS is not rendered.";
  override readonly patchOps = [
    "append-wireframe-region",
    "update-wireframe-region",
    "remove-wireframe-region",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<SurfaceData> | null {
    const data = parseSurfaceData(attrs, body);
    return data
      ? {
          tag: this.tag,
          type: this.type,
          targetKind: this.targetKind,
          sourceId: data.id,
          data,
        }
      : null;
  }

  render(block: DocsMdxParsedBlock<SurfaceData>) {
    return (
      <SurfaceFrame
        data={block.data}
        blockTag={this.tag}
        blockType={this.type}
        label={this.label}
        regionTargetType="wireframe-region"
        icon="wireframe"
      />
    );
  }
}

export class ArtboardDocsBlock extends DocsMdxBlock<SurfaceData> {
  readonly tag = "Artboard";
  readonly type = "artboard";
  readonly targetKind = "artboard";
  readonly label = "Artboard";
  readonly agentDescription =
    "A standalone safe artboard with targetable layout regions.";
  override readonly patchOps = [
    "append-artboard-region",
    "update-artboard-region",
    "remove-artboard-region",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<SurfaceData> | null {
    const data = parseSurfaceData(attrs, body);
    return data
      ? {
          tag: this.tag,
          type: this.type,
          targetKind: this.targetKind,
          sourceId: data.id,
          data,
        }
      : null;
  }

  render(block: DocsMdxParsedBlock<SurfaceData>) {
    return (
      <SurfaceFrame
        data={block.data}
        blockTag={this.tag}
        blockType={this.type}
        label={this.label}
        regionTargetType="artboard-region"
        icon="artboard"
      />
    );
  }
}

export class ScreenDocsBlock extends DocsMdxBlock<SurfaceData> {
  readonly tag = "Screen";
  readonly type = "screen";
  readonly targetKind = "screen";
  readonly label = "Screen";
  readonly agentDescription =
    "A safe screen mockup with targetable regions, shared by wireframe and prototype docs.";
  override readonly patchOps = [
    "append-screen-region",
    "update-screen-region",
    "remove-screen-region",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<SurfaceData> | null {
    const data = parseSurfaceData(attrs, body);
    return data
      ? {
          tag: this.tag,
          type: this.type,
          targetKind: this.targetKind,
          sourceId: data.id,
          data,
        }
      : null;
  }

  render(block: DocsMdxParsedBlock<SurfaceData>) {
    return (
      <SurfaceFrame
        data={block.data}
        blockTag={this.tag}
        blockType={this.type}
        label={this.label}
        regionTargetType="screen-region"
        icon="screen"
      />
    );
  }
}

function parsePrototypeScreens(body: string, defaultSurface: SurfaceKind): PrototypeScreenData[] {
  return parseRegions(body).map((region) => ({
    id: region.id,
    title: region.label,
    summary: region.note,
    surface: defaultSurface,
    regions: [
      {
        id: `${region.id}-body`,
        label: region.note || `${region.label} body`,
        kind: "screen",
        x: 8,
        y: 12,
        width: 84,
        height: 76,
      },
    ],
    caption: undefined,
  }));
}

function parsePrototypeData(attrs: Record<string, string>, body: string): PrototypeData | null {
  const id = attr(attrs, "id");
  if (!id) return null;
  const surface = parseSurface(attr(attrs, "surface"), "desktop");
  const sections = parseNamedSections(body, "screens");
  const screens = parsePrototypeScreens(sectionBody(sections, ["screens"]), surface);
  if (screens.length === 0) return null;
  const screenIds = new Set(screens.map((screen) => screen.id));
  return {
    id,
    title: attr(attrs, "title"),
    initial: attr(attrs, "initial"),
    surface,
    screens,
    transitions: parseConnections(sectionBody(sections, ["transitions", "flow"]), screenIds),
  };
}

function PrototypePreview({ data }: { data: PrototypeData }) {
  const initial = data.initial && data.screens.some((screen) => screen.id === data.initial)
    ? data.initial
    : data.screens[0]?.id;
  const [activeId, setActiveId] = useState(initial);
  const activeScreen = useMemo(
    () => data.screens.find((screen) => screen.id === activeId) ?? data.screens[0],
    [activeId, data.screens],
  );
  const outgoingTransitions = data.transitions.filter((transition) => transition.from === activeScreen?.id);
  if (!activeScreen) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="rounded-md border bg-background p-2">
        <div className="mb-2 font-display text-[10px] uppercase tracking-wider text-muted-foreground">
          Screens
        </div>
        <div className="grid gap-1">
          {data.screens.map((screen) => {
            const selected = screen.id === activeScreen.id;
            return (
              <button
                key={screen.id}
                type="button"
                className={cn(
                  "rounded border px-2 py-1.5 text-left text-xs",
                  selected ? "bg-primary text-primary-foreground" : "bg-muted/20 text-foreground",
                )}
                onClick={() => setActiveId(screen.id)}
              >
                {screen.title}
              </button>
            );
          })}
        </div>
        {outgoingTransitions.length > 0 && (
          <div className="mt-3 grid gap-1">
            {outgoingTransitions.map((transition, index) => (
              <button
                key={`${transition.from}-${transition.to}-${index}`}
                type="button"
                className="flex items-center gap-1 rounded border bg-muted/20 px-2 py-1 text-left text-xs"
                onClick={() => setActiveId(transition.to)}
              >
                <ArrowRightIcon className="h-3 w-3" />
                {transition.label ?? transition.to}
              </button>
            ))}
          </div>
        )}
      </div>
      <SurfaceMiniFrame data={activeScreen} targetType="prototype-screen" parentId={data.id} />
    </div>
  );
}

function SurfaceMiniFrame({
  data,
  targetType,
  parentId,
}: {
  data: PrototypeScreenData;
  targetType: string;
  parentId: string;
}) {
  const screenRegion: VisualRegion = {
    id: data.id,
    label: data.title ?? data.id,
    note: data.summary,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };
  return (
    <div
      className="rounded-md border bg-background p-3"
      {...targetAttrs(parentId, targetType, screenRegion)}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <MonitorIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{data.title}</span>
        <Badge variant="outline">{data.surface}</Badge>
      </div>
      <div className="relative overflow-hidden rounded border bg-muted/20" style={{ aspectRatio: surfaceAspect(data.surface) }}>
        {data.regions.map((region) => (
          <VisualRegionBox
            key={region.id}
            parentId={data.id}
            targetType={`${targetType}-region`}
            region={region}
            compact
          />
        ))}
      </div>
      {data.summary && <div className="mt-2 text-xs text-muted-foreground">{data.summary}</div>}
    </div>
  );
}

export class PrototypeDocsBlock extends DocsMdxBlock<PrototypeData> {
  readonly tag = "Prototype";
  readonly type = "prototype";
  readonly targetKind = "prototype";
  readonly label = "Prototype";
  readonly agentDescription =
    "A safe prototype overview with switchable screens and typed transitions; no prototype HTML is executed.";
  override readonly patchOps = [
    "append-prototype-screen",
    "update-prototype-screen",
    "append-prototype-transition",
    "remove-prototype-transition",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<PrototypeData> | null {
    const data = parsePrototypeData(attrs, body);
    return data
      ? {
          tag: this.tag,
          type: this.type,
          targetKind: this.targetKind,
          sourceId: data.id,
          data,
        }
      : null;
  }

  render(block: DocsMdxParsedBlock<PrototypeData>) {
    const { data } = block;
    return (
      <section
        className="not-prose my-4 rounded-md border bg-muted/20 p-3"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <MousePointerClickIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Prototype
          </span>
          {data.title && <span className="text-sm font-medium">{data.title}</span>}
          <Badge variant="outline">{data.screens.length} screens</Badge>
          <Badge variant="outline">{data.transitions.length} transitions</Badge>
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        </div>
        <PrototypePreview data={data} />
      </section>
    );
  }
}

export class PrototypeScreenDocsBlock extends DocsMdxBlock<PrototypeScreenData> {
  readonly tag = "PrototypeScreen";
  readonly type = "prototype-screen";
  readonly targetKind = "prototype-screen";
  readonly label = "Prototype Screen";
  readonly agentDescription =
    "A standalone safe prototype screen with targetable regions.";
  override readonly patchOps = [
    "append-prototype-screen-region",
    "update-prototype-screen-region",
    "remove-prototype-screen-region",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<PrototypeScreenData> | null {
    const data = parseSurfaceData(attrs, body) as PrototypeScreenData | null;
    if (data) data.summary = attr(attrs, "summary");
    return data
      ? {
          tag: this.tag,
          type: this.type,
          targetKind: this.targetKind,
          sourceId: data.id,
          data,
        }
      : null;
  }

  render(block: DocsMdxParsedBlock<PrototypeScreenData>) {
    return (
      <SurfaceFrame
        data={block.data}
        blockTag={this.tag}
        blockType={this.type}
        label={this.label}
        regionTargetType="prototype-screen-region"
        icon="screen"
      />
    );
  }
}

export class PrototypeTransitionDocsBlock extends DocsMdxBlock<PrototypeTransitionData> {
  readonly tag = "PrototypeTransition";
  readonly type = "prototype-transition";
  readonly targetKind = "prototype-transition";
  readonly label = "Prototype Transition";
  readonly agentDescription =
    "An inert transition metadata block linking two prototype screen ids.";
  override readonly patchOps = [
    "update-prototype-transition",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<PrototypeTransitionData> | null {
    const id = attr(attrs, "id");
    const from = attr(attrs, "from");
    const to = attr(attrs, "to");
    if (!id || !from || !to) return null;
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: {
        id,
        from: slugify(from, from),
        to: slugify(to, to),
        label: attr(attrs, "label"),
        trigger: attr(attrs, "trigger"),
        body: body.trim() || undefined,
      },
    };
  }

  render(block: DocsMdxParsedBlock<PrototypeTransitionData>) {
    const { data } = block;
    return (
      <section
        className="not-prose my-4 rounded-md border bg-muted/20 p-3"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ArrowRightIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Prototype Transition
          </span>
          <Badge variant="outline">{data.from}</Badge>
          <ArrowRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <Badge variant="outline">{data.to}</Badge>
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        </div>
        {data.label && <div className="text-sm font-medium">{data.label}</div>}
        {data.trigger && <div className="mt-1 text-xs text-muted-foreground">Trigger: {data.trigger}</div>}
        {data.body && <div className="mt-2 text-sm text-muted-foreground">{data.body}</div>}
      </section>
    );
  }
}

export const visualDocsBlocks = [
  new WireframeDocsBlock(),
  new BoardDocsBlock({
    tag: "DesignBoard",
    type: "design-board",
    targetKind: "design-board",
    label: "Design Board",
    description:
      "A safe positioned board of targetable artboards and connectors, adapted from My Plans canvas concepts without arbitrary HTML execution.",
    fallbackMode: "design",
  }),
  new BoardDocsBlock({
    tag: "Canvas",
    type: "canvas",
    targetKind: "canvas",
    label: "Canvas",
    description:
      "A safe positioned canvas of targetable artboards, connectors, and notes for spatial docs review.",
    fallbackMode: "wireframe",
  }),
  new ArtboardDocsBlock(),
  new ScreenDocsBlock(),
  new PrototypeDocsBlock(),
  new PrototypeScreenDocsBlock(),
  new PrototypeTransitionDocsBlock(),
];
