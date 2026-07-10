"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  BlocksIcon,
  CheckCircle2Icon,
  Code2Icon,
  CopyIcon,
  CrosshairIcon,
  EyeIcon,
  PaletteIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";
import { CanvasEmbedUnavailable, useCanvasEmbed } from "./client";
import { cn } from "./ui/cn";
import MdxDocumentRenderer, { docsMdxBlockRegistry } from "./MdxDocumentRenderer";

const BLOCK_EXAMPLES: Record<string, string> = {
  Decision: [
    '<Decision id="docs-lab-default" status="accepted" title="Default to MDX Lab">',
    "  Spectre renders docs as targetable MDX blocks while keeping source edits reviewable.",
    "</Decision>",
  ].join("\n"),
  Callout: [
    '<Callout id="docs-lab-risk" tone="risk" title="Review Anchor">',
    "  Anchors should carry source context and enough rendered context for agent edits.",
    "</Callout>",
  ].join("\n"),
  AgentContract: [
    '<AgentContract id="docs-revisor" agent="Docs Revisor" tools="docs.proposeEdit" approvals="Human review required">',
    "  Reads queued annotations, proposes source changes, and waits for approval before landing edits.",
    "</AgentContract>",
  ].join("\n"),
  FileTree: [
    '<FileTree id="docs-lab-files" title="Docs Lab Files">',
    "- [modified] apps/frontend/src/components/docs/MdxDocumentRenderer.tsx :: shared renderer",
    "- [added] apps/frontend/src/components/docs/DocsBlockLibrary.tsx :: block preview gallery",
    "</FileTree>",
  ].join("\n"),
  Constraint: [
    '<Constraint id="docs-safe-mdx" severity="hard" owner="docs-lab" title="Safe MDX">',
    "  Render allowlisted inert components only; arbitrary JSX stays unsupported.",
    "</Constraint>",
  ].join("\n"),
  Assumption: [
    '<Assumption id="docs-real-corpus" confidence="high" owner="docs-lab" title="Real Docs First">',
    "  Existing Spectre docs are the best test material for discovering useful block shapes.",
    "</Assumption>",
  ].join("\n"),
  Risk: [
    '<Risk id="docs-review-without-trust" severity="high" mitigation="hash-gated apply" title="Review Without Trust">',
    "  Agent-proposed docs edits must remain reviewable before source changes land.",
    "</Risk>",
  ].join("\n"),
  OpenQuestion: [
    '<OpenQuestion id="docs-canvas-targets" status="open" owner="frontend" title="Canvas Targets">',
    "  Which visual subtargets should become stable annotation anchors first?",
    "</OpenQuestion>",
  ].join("\n"),
  Status: [
    '<Status id="docs-lab-status" state="in-progress" updated="2026-06-24" title="MDX Lab">',
    "  Annotation review is active; broader block vocabulary is expanding in slices.",
    "</Status>",
  ].join("\n"),
  Milestone: [
    '<Milestone id="docs-semantic-blocks" state="in-progress" date="2026-06-24" title="Semantic Block Slice">',
    "  Promote constraints, assumptions, risks, questions, statuses, and milestones as safe MDX blocks.",
    "</Milestone>",
  ].join("\n"),
  Checklist: [
    '<Checklist id="docs-review-checklist" title="Review Checklist">',
    "- [x] Select text and create a queued annotation :: covered by focused tests",
    "- [x] Review a proposal diff before source changes land",
    "- [ ] Run desktop and narrow viewport QA",
    "</Checklist>",
  ].join("\n"),
  StructuredTable: [
    '<StructuredTable id="docs-block-status" title="Block Status" density="compact">',
    "| Block | Status | Notes |",
    "| --- | --- | --- |",
    "| Decision | implemented | initial semantic proof |",
    "| Checklist | implemented | read-only support block |",
    "| Canvas | implemented | safe docs-native visual surface |",
    "</StructuredTable>",
  ].join("\n"),
  Tabs: [
    '<Tabs id="docs-review-tabs" title="Review Modes">',
    "--- Source Diff ---",
    "Inspect the file-level change before applying it.",
    "",
    "--- Rendered Preview ---",
    "Check that the MDX renders as readable, inert docs content.",
    "</Tabs>",
  ].join("\n"),
  Columns: [
    '<Columns id="docs-human-agent-loop" title="Review Loop" columns="2">',
    "--- Human Reviewer ---",
    "Adds anchored feedback and approves source changes.",
    "",
    "--- Docs Agent ---",
    "Reads queued annotations and proposes reviewable edits.",
    "</Columns>",
  ].join("\n"),
  Code: [
    '<Code id="docs-api-client" filename="projects-api.ts" language="ts" caption="Typed API call shape">',
    "export async function applyProjectDocProposal(projectId: string, proposalId: string) {",
    "  return fetchDataApi(`/projects/${projectId}/docs/proposals/${proposalId}/apply`);",
    "}",
    "</Code>",
  ].join("\n"),
  ImplementationMap: [
    '<ImplementationMap id="docs-lab-implementation-map" title="Docs Lab Implementation">',
    "- [modified] apps/data-backend/src/index.ts (ts) :: docs proposal lifecycle routes",
    "- [modified] apps/frontend/src/components/docs/docs-blocks/registry.ts (ts) :: block registry entries",
    "- [added] apps/frontend/src/components/docs/docs-blocks/engineering/EngineeringDocsBlocks.tsx (tsx) :: engineering block renderers",
    "</ImplementationMap>",
  ].join("\n"),
  ApiEndpoint: [
    '<ApiEndpoint id="docs-apply-proposal" method="POST" path="/projects/:id/docs/proposals/:proposalId/apply" summary="Apply a reviewed docs proposal" auth="project access">',
    "Applies proposed docs content only when the current content hash still matches the proposal original hash.",
    "- param path id string required :: Project id",
    "- param path proposalId string required :: Proposal id",
    "- param body original_hash string required :: Hash precondition captured when the proposal was created",
    "- response 200 :: Applied proposal, updated annotations, and action event",
    "- response 409 :: Stale proposal conflict",
    "</ApiEndpoint>",
  ].join("\n"),
  ApiSurface: [
    '<ApiSurface id="docs-lab-api" title="Docs Lab API">',
    "- GET /projects/:id/docs/tree :: Load the project docs tree",
    "- GET /projects/:id/docs/file :: Load one docs artifact with hash metadata",
    "- POST /projects/:id/docs/propose-edit :: Request a reviewable docs proposal",
    "- POST /projects/:id/docs/proposals/:proposalId/apply :: Apply a proposal with hash preconditions",
    "</ApiSurface>",
  ].join("\n"),
  DataModel: [
    '<DataModel id="docs-lab-data-model" title="Docs Lab Review State">',
    "--- DocsAnnotation ---",
    "- id: string pk :: Stable annotation id",
    "- status: queued|in_review|resolved|rejected :: Review lifecycle state",
    "- document_path: string :: Source document",
    "",
    "--- DocsEditProposal ---",
    "- proposal_id: string pk :: Stable proposal id",
    "- original_hash: string :: Stale-write guard",
    "- status: pending|applied|rejected :: Proposal lifecycle state",
    "</DataModel>",
  ].join("\n"),
  Diff: [
    '<Diff id="docs-proposal-diff" filename="docs/10-system-design/40-docs-mdx-lab.mdx" language="mdx">',
    "--- before ---",
    "The docs lab can request proposals.",
    "--- after ---",
    "The docs lab can request, review, apply, and reject proposals.",
    "</Diff>",
  ].join("\n"),
  JsonExplorer: [
    '<JsonExplorer id="docs-anchor-json" title="Docs Anchor Payload" collapsedDepth="2">',
    "{",
    '  "document_path": "docs/10-system-design/40-docs-mdx-lab.mdx",',
    '  "target_kind": "block",',
    '  "target": { "kind": "block", "block_type": "api-endpoint" }',
    "}",
    "</JsonExplorer>",
  ].join("\n"),
  AnnotatedCode: [
    '<AnnotatedCode id="docs-proposal-apply-code" filename="projects-api.ts" language="ts">',
    "--- code ---",
    "export async function applyProjectDocProposal(projectId: string, proposalId: string, originalHash: string) {",
    "  return fetchDataApi(`/projects/${projectId}/docs/proposals/${proposalId}/apply`, {",
    "    method: \"POST\",",
    "    body: JSON.stringify({ original_hash: originalHash }),",
    "  });",
    "}",
    "--- annotations ---",
    "- 1 | Route wrapper :: Sends project and proposal identity through the typed client.",
    "- 4 | Hash guard :: The original hash is the stale-write precondition.",
    "</AnnotatedCode>",
  ].join("\n"),
  Diagram: [
    '<Diagram id="docs-lab-review-diagram" title="Docs Review Lifecycle" caption="Read-only node/edge diagram; HTML fragments stay unsupported." layout="positioned">',
    "--- nodes ---",
    "- cue | Anchored Cue @ 12,30 :: User selects text or a rendered block.",
    "- queue | Action Queue @ 38,58 :: Annotation becomes shared review state.",
    "- proposal | Proposal @ 66,30 :: Agent prepares staged source content.",
    "- apply | Apply Or Reject @ 88,58 :: Human lands or rejects the proposal.",
    "--- edges ---",
    "- cue -> queue :: save",
    "- queue -> proposal :: request",
    "- proposal -> apply :: review",
    "--- notes ---",
    "- Hash guards protect apply from stale source content.",
    "</Diagram>",
  ].join("\n"),
  Flow: [
    '<Flow id="docs-lab-review-flow" title="Docs Review Flow">',
    "- [done] Select target :: Choose exact text or block context",
    "- [done] Queue annotation :: Preserve the cue in the action pane",
    "- [current] Review proposal :: Compare source diff and rendered preview",
    "- [queued] Apply or reject :: Update proposal and annotation state",
    "</Flow>",
  ].join("\n"),
  Mermaid: [
    '<Mermaid id="docs-lab-sequence-source" title="Proposal Sequence" diagramType="sequenceDiagram" caption="Mermaid remains source-backed until sanitizer policy is installed.">',
    "sequenceDiagram",
    "  participant Reviewer",
    "  participant DocsLab",
    "  Reviewer->>DocsLab: Queue anchored cue",
    "  DocsLab-->>Reviewer: Reviewable proposal",
    "</Mermaid>",
  ].join("\n"),
  Wireframe: [
    '<Wireframe id="docs-lab-review-wireframe" title="Docs Review Workspace" surface="desktop" caption="Safe regions are targetable; raw HTML is unsupported.">',
    "--- regions ---",
    "- tree | Docs tree | nav @ 4,8 20x84 :: Project documentation files",
    "- document | Rendered document | content @ 28,8 44x84 :: MDX blocks and prose targets",
    "- actions | Action pane | panel @ 76,8 20x84 :: Queue, proposal, and events",
    "</Wireframe>",
  ].join("\n"),
  DesignBoard: [
    '<DesignBoard id="docs-lab-design-board" title="Docs Lab Visual Review" mode="design">',
    "--- artboards ---",
    "- browse | Browse Docs | desktop @ 5,14 28x34 :: Navigate real docs",
    "- annotate | Annotate Target | desktop @ 38,18 28x34 :: Pinpoint a rendered block",
    "- review | Review Proposal | desktop @ 70,14 25x38 :: Apply or reject edits",
    "--- connectors ---",
    "- browse -> annotate :: select",
    "- annotate -> review :: request proposal",
    "--- notes ---",
    "- visual-targets | Artboards are selectable docs targets.",
    "</DesignBoard>",
  ].join("\n"),
  Canvas: [
    '<Canvas id="docs-lab-canvas" title="Docs Lab Canvas">',
    "--- artboards ---",
    "- viewer | Viewer | desktop @ 8,16 32x36 :: Rendered MDX surface",
    "- pane | Action Pane | panel @ 54,18 28x34 :: Review and proposal controls",
    "--- flow ---",
    "- viewer -> pane :: queue action",
    "</Canvas>",
  ].join("\n"),
  Artboard: [
    '<Artboard id="docs-lab-artboard" title="Action Pane Artboard" surface="panel">',
    "--- regions ---",
    "- context | Selected Context | content @ 8,8 84x18 :: Current target summary",
    "- queue | Queue | list @ 8,32 84x30 :: Pending annotations",
    "- proposal | Proposal Review | content @ 8,68 84x22 :: Diff and preview",
    "</Artboard>",
  ].join("\n"),
  Screen: [
    '<Screen id="docs-lab-screen" title="Proposal Review Screen" surface="desktop">',
    "--- regions ---",
    "- diff | Source Diff | content @ 6,10 42x78 :: Review file-level changes",
    "- preview | Rendered Preview | content @ 52,10 42x78 :: Verify safe MDX output",
    "</Screen>",
  ].join("\n"),
  Prototype: [
    '<Prototype id="docs-lab-prototype" title="Docs Proposal Prototype" initial="browse" surface="desktop">',
    "--- screens ---",
    "- browse | Browse Docs @ 6,12 28x72 :: User opens a real doc",
    "- annotate | Annotate Target @ 38,12 28x72 :: User adds an anchored cue",
    "- review | Review Proposal @ 70,12 24x72 :: User applies or rejects",
    "--- transitions ---",
    "- browse -> annotate :: select block",
    "- annotate -> review :: request proposal",
    "</Prototype>",
  ].join("\n"),
  PrototypeScreen: [
    '<PrototypeScreen id="docs-lab-prototype-screen" title="Review Proposal" surface="desktop" summary="Standalone prototype screen fixture.">',
    "--- regions ---",
    "- header | Review header | toolbar @ 6,6 88x12 :: Proposal metadata",
    "- diff | Diff pane | content @ 6,22 42x68 :: Source changes",
    "- rendered | Rendered pane | content @ 52,22 42x68 :: Preview output",
    "</PrototypeScreen>",
  ].join("\n"),
  PrototypeTransition: [
    '<PrototypeTransition id="docs-lab-transition" from="annotate" to="review" label="Request Proposal" trigger="click Request proposal">',
    "The transition is metadata only; runtime navigation stays inside allowlisted screen ids.",
    "</PrototypeTransition>",
  ].join("\n"),
};

function exampleForTag(tag: string): string | null {
  return BLOCK_EXAMPLES[tag] ?? null;
}

type BlockDescriptor = ReturnType<typeof docsMdxBlockRegistry.describeForAgent>[number];

type BlockFamily = {
  id: string;
  label: string;
  summary: string;
  tags: string[];
  tone: {
    border: string;
    bg: string;
    text: string;
    soft: string;
    ring: string;
    stripe: string;
  };
};

const BLOCK_FAMILIES: BlockFamily[] = [
  {
    id: "foundation",
    label: "Foundation",
    summary: "Core docs primitives",
    tags: ["Decision", "Callout", "AgentContract", "FileTree"],
    tone: {
      border: "border-primary/30",
      bg: "bg-primary/5",
      text: "text-primary",
      soft: "bg-primary/5",
      ring: "ring-sky-500/30",
      stripe: "bg-primary",
    },
  },
  {
    id: "semantic",
    label: "Semantic",
    summary: "Review meaning",
    tags: ["Constraint", "Assumption", "Risk", "OpenQuestion", "Status", "Milestone"],
    tone: {
      border: "border-primary/30",
      bg: "bg-primary/5",
      text: "text-primary",
      soft: "bg-primary/5",
      ring: "ring-amber-500/30",
      stripe: "bg-primary",
    },
  },
  {
    id: "support",
    label: "Support",
    summary: "Readable structure",
    tags: ["Checklist", "StructuredTable", "Tabs", "Columns", "Code"],
    tone: {
      border: "border-primary/30",
      bg: "bg-primary/5",
      text: "text-primary",
      soft: "bg-primary/5",
      ring: "ring-emerald-500/30",
      stripe: "bg-primary",
    },
  },
  {
    id: "engineering",
    label: "Engineering",
    summary: "APIs, data, diffs",
    tags: [
      "ImplementationMap",
      "ApiEndpoint",
      "ApiSurface",
      "DataModel",
      "Diff",
      "JsonExplorer",
      "AnnotatedCode",
    ],
    tone: {
      border: "border-primary/30",
      bg: "bg-primary/5",
      text: "text-primary",
      soft: "bg-primary/5",
      ring: "ring-cyan-500/30",
      stripe: "bg-primary",
    },
  },
  {
    id: "diagram",
    label: "Diagram",
    summary: "Flows and diagrams",
    tags: ["Diagram", "Flow", "Mermaid"],
    tone: {
      border: "border-primary/30",
      bg: "bg-primary/5",
      text: "text-primary",
      soft: "bg-primary/5",
      ring: "ring-teal-500/30",
      stripe: "bg-primary",
    },
  },
  {
    id: "visual",
    label: "Interactive",
    summary: "Editable visual surfaces",
    tags: [
      "Wireframe",
      "DesignBoard",
      "Canvas",
      "Artboard",
      "Screen",
      "Prototype",
      "PrototypeScreen",
      "PrototypeTransition",
    ],
    tone: {
      border: "border-primary/30",
      bg: "bg-primary/5",
      text: "text-primary",
      soft: "bg-primary/5",
      ring: "ring-rose-500/30",
      stripe: "bg-primary",
    },
  },
];

const FAMILY_BY_TAG = new Map(
  BLOCK_FAMILIES.flatMap((family) => family.tags.map((tag) => [tag, family] as const)),
);

const FALLBACK_FAMILY: BlockFamily = {
  id: "other",
  label: "Other",
  summary: "Unsorted",
  tags: [],
  tone: {
    border: "border-border",
    bg: "bg-muted",
    text: "text-muted-foreground",
    soft: "bg-muted/40",
    ring: "ring-border",
    stripe: "bg-muted-foreground",
  },
};

type SourceInspection =
  | {
      state: "ok";
      tag: string;
      type: string;
      targetKind: string;
      sourceId: string | null;
    }
  | { state: "unsupported"; tag: string }
  | { state: "invalid"; tag: string }
  | { state: "markdown" };

type TargetSummary = {
  sourceId: string;
  type: string;
  label: string;
};

type VisualLabItem = {
  id: string;
  label: string;
  kind?: string;
  note?: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type VisualLabConnection = {
  from: string;
  to: string;
  label?: string;
};

type VisualLabNote = {
  id: string;
  text: string;
};

type VisualLabModel = {
  tag: string;
  id: string;
  title?: string;
  openingLine: string;
  itemSectionLabel: string;
  itemLabel: string;
  itemTargetType: string;
  items: VisualLabItem[];
  connectionSectionLabel?: string;
  connections: VisualLabConnection[];
  notes: VisualLabNote[];
};

const ATTR_RE = /([A-Za-z_:][A-Za-z0-9_:.-]*)=(?:"([^"]*)"|'([^']*)')/g;

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTR_RE)) {
    attrs[match[1]] = match[2] ?? match[3] ?? "";
  }
  return attrs;
}

function splitNote(value: string): [string, string | undefined] {
  const [main, ...noteParts] = value.split(/\s+(?:--|::)\s+/);
  return [main.trim(), noteParts.join(" - ").trim() || undefined];
}

function slugify(value: string, fallback: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 56) || fallback
  );
}

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

type NamedSection = {
  label: string;
  body: string;
};

function parseNamedSections(body: string, fallbackLabel: string): NamedSection[] {
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

function firstSectionLabel(sections: NamedSection[], labels: string[], fallback: string): string {
  const labelSet = new Set(labels);
  return sections.find((section) => labelSet.has(section.label))?.label ?? fallback;
}

function parseSpatialItem(line: string, index: number): VisualLabItem | null {
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
  const fallbackY = 12 + Math.floor(index / 3) * 26;
  return {
    id: slugify(rawId || label, `item-${index + 1}`),
    label,
    kind,
    note,
    x: clampPercent(Number.parseFloat(geometryMatch?.[1] ?? ""), fallbackX),
    y: clampPercent(Number.parseFloat(geometryMatch?.[2] ?? ""), fallbackY),
    width: clampPercent(Number.parseFloat(geometryMatch?.[3] ?? ""), 26),
    height: clampPercent(Number.parseFloat(geometryMatch?.[4] ?? ""), 24),
  };
}

function parseSpatialItems(body: string): VisualLabItem[] {
  return body
    .split("\n")
    .map(parseSpatialItem)
    .filter((item): item is VisualLabItem => item !== null);
}

function parseConnection(line: string): VisualLabConnection | null {
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

function parseConnections(body: string): VisualLabConnection[] {
  return body
    .split("\n")
    .map(parseConnection)
    .filter((connection): connection is VisualLabConnection => connection !== null);
}

function parseNote(line: string, index: number): VisualLabNote | null {
  const cleaned = line.trim().replace(/^[-*]\s+/, "");
  if (!cleaned) return null;
  const [rawId, text] = cleaned.split("|").map((part) => part.trim());
  const noteText = text || cleaned;
  return {
    id: slugify(text ? rawId : noteText, `note-${index + 1}`),
    text: noteText,
  };
}

function parseNotes(body: string): VisualLabNote[] {
  return body
    .split("\n")
    .map(parseNote)
    .filter((note): note is VisualLabNote => note !== null);
}

function parseVisualLabSource(source: string): VisualLabModel | null {
  const trimmed = source.trim();
  const lines = trimmed.split("\n");
  const openingLine = lines[0]?.trim();
  const opening = openingLine?.match(/^<([A-Z][A-Za-z0-9]*)\b([^>]*)>/);
  if (!opening || lines.length < 2) return null;

  const tag = opening[1];
  const closingLine = `</${tag}>`;
  if (lines.at(-1)?.trim() !== closingLine) return null;

  const attrs = parseAttrs(opening[2] ?? "");
  const id = attrs.id?.trim();
  if (!id) return null;

  const body = lines.slice(1, -1).join("\n");
  const isBoard = tag === "DesignBoard" || tag === "Canvas";
  const isSurface =
    tag === "Wireframe" ||
    tag === "Artboard" ||
    tag === "Screen" ||
    tag === "PrototypeScreen";
  const isPrototype = tag === "Prototype";
  if (!isBoard && !isSurface && !isPrototype) return null;

  const fallbackLabel = isPrototype ? "screens" : isBoard ? "artboards" : "regions";
  const sections = parseNamedSections(body, fallbackLabel);
  const itemLabels = isPrototype
    ? ["screens"]
    : isBoard
      ? ["artboards", "frames", "screens"]
      : ["regions", "nodes", "screen"];
  const items = parseSpatialItems(sectionBody(sections, itemLabels) || body);
  if (items.length === 0) return null;

  const connectionLabels = isPrototype ? ["transitions", "flow"] : ["connectors", "flow", "transitions"];
  const connectionSectionLabel = firstSectionLabel(
    sections,
    connectionLabels,
    isPrototype ? "transitions" : tag === "Canvas" ? "flow" : "connectors",
  );

  return {
    tag,
    id,
    title: attrs.title,
    openingLine,
    itemSectionLabel: firstSectionLabel(sections, itemLabels, fallbackLabel),
    itemLabel: isPrototype ? "screen" : isBoard ? "artboard" : "region",
    itemTargetType: isPrototype
      ? "prototype-screen"
      : isBoard
        ? "artboard"
        : `${tag.toLowerCase()}-region`,
    items,
    connectionSectionLabel,
    connections: parseConnections(sectionBody(sections, connectionLabels)),
    notes: parseNotes(sectionBody(sections, ["notes", "annotations"])),
  };
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function serializeVisualItem(item: VisualLabItem): string {
  const kind = item.kind ? ` | ${item.kind}` : "";
  const note = item.note ? ` :: ${item.note}` : "";
  return `- ${item.id} | ${item.label}${kind} @ ${formatPercent(item.x)},${formatPercent(item.y)} ${formatPercent(item.width)}x${formatPercent(item.height)}${note}`;
}

function serializeVisualLabSource(model: VisualLabModel): string {
  const lines = [
    model.openingLine,
    `--- ${model.itemSectionLabel} ---`,
    ...model.items.map(serializeVisualItem),
  ];

  if (model.connections.length > 0 && model.connectionSectionLabel) {
    lines.push(
      `--- ${model.connectionSectionLabel} ---`,
      ...model.connections.map((connection) => {
        const label = connection.label ? ` :: ${connection.label}` : "";
        return `- ${connection.from} -> ${connection.to}${label}`;
      }),
    );
  }

  if (model.notes.length > 0) {
    lines.push(
      "--- notes ---",
      ...model.notes.map((note) => `- ${note.id} | ${note.text}`),
    );
  }

  lines.push(`</${model.tag}>`);
  return lines.join("\n");
}

function uniqueVisualId(items: VisualLabItem[], base: string): string {
  const ids = new Set(items.map((item) => item.id));
  if (!ids.has(base)) return base;
  let index = 2;
  while (ids.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function itemStyle(item: VisualLabItem) {
  return {
    left: `${item.x}%`,
    top: `${item.y}%`,
    width: `${item.width}%`,
    height: `${item.height}%`,
  };
}

function inspectSource(source: string): SourceInspection {
  const trimmed = source.trim();
  const opening = trimmed.match(/<([A-Z][A-Za-z0-9]*)\b([^>]*)>/);
  if (!opening) return { state: "markdown" };

  const tag = opening[1];
  const attrs = parseAttrs(opening[2] ?? "");
  if (!docsMdxBlockRegistry.has(tag)) return { state: "unsupported", tag };

  const openEnd = opening.index! + opening[0].length;
  const closing = new RegExp(`</${tag}>\\s*$`).exec(trimmed);
  const isSelfClosing = /\/>\s*$/.test(opening[0]);
  const body = isSelfClosing
    ? ""
    : closing
      ? trimmed.slice(openEnd, closing.index).trim()
      : "";
  const block = docsMdxBlockRegistry.parse({
    tag,
    attrs,
    body,
    source: trimmed,
  });
  if (!block) return { state: "invalid", tag };
  return {
    state: "ok",
    tag,
    type: block.type,
    targetKind: block.targetKind,
    sourceId: block.sourceId,
  };
}

function sourceForTag(tag: string): string {
  return exampleForTag(tag) ?? `<${tag} id="scratch-${tag.toLowerCase()}">\n</${tag}>`;
}

function collectTargets(root: HTMLElement | null): TargetSummary[] {
  if (!root) return [];
  const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-source-id]"));
  const seen = new Set<string>();
  return targets
    .map((element) => {
      const sourceId = element.dataset.sourceId;
      if (!sourceId || seen.has(sourceId)) return null;
      seen.add(sourceId);
      return {
        sourceId,
        type:
          element.dataset.docsTargetType ??
          element.dataset.docsBlockType ??
          element.dataset.mdxBlock ??
          "target",
        label:
          element.dataset.docsTargetLabel ??
          element.textContent?.replace(/\s+/g, " ").trim().slice(0, 72) ??
          sourceId,
      };
    })
    .filter((target): target is TargetSummary => target !== null);
}

function visibleFamilies(blocks: BlockDescriptor[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return BLOCK_FAMILIES.map((family) => {
    const familyBlocks = family.tags
      .map((tag) => blocks.find((block) => block.tag === tag))
      .filter((block): block is BlockDescriptor => {
        if (!block) return false;
        if (!normalizedQuery) return true;
        return [
          block.tag,
          block.label,
          block.type,
          block.targetKind,
          family.label,
          family.summary,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      });
    return { family, blocks: familyBlocks };
  }).filter((group) => group.blocks.length > 0);
}

function VisualBlockPlayground({
  source,
  blockType,
  onSourceChange,
}: {
  source: string;
  blockType: string;
  onSourceChange: (source: string) => void;
}) {
  const model = useMemo(() => parseVisualLabSource(source), [source]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    startX: number;
    startY: number;
    item: VisualLabItem;
  } | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const selectedItem = useMemo(() => {
    if (!model) return null;
    return (
      model.items.find((item) => item.id === selectedId) ??
      model.items[0] ??
      null
    );
  }, [model, selectedId]);

  useEffect(() => {
    if (!model) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !model.items.some((item) => item.id === selectedId)) {
      setSelectedId(model.items[0]?.id ?? null);
    }
  }, [model, selectedId]);

  if (!model || !selectedItem) {
    return <MdxDocumentRenderer content={source} />;
  }

  const commitModel = (nextModel: VisualLabModel) => {
    onSourceChange(serializeVisualLabSource(nextModel));
  };

  const patchItem = (id: string, patch: Partial<VisualLabItem>) => {
    commitModel({
      ...model,
      items: model.items.map((item) => {
        if (item.id !== id) return item;
        const nextWidth = clampPercent(patch.width ?? item.width, item.width);
        const nextHeight = clampPercent(patch.height ?? item.height, item.height);
        const nextX = Math.min(
          100 - Math.max(4, nextWidth),
          clampPercent(patch.x ?? item.x, item.x),
        );
        const nextY = Math.min(
          100 - Math.max(4, nextHeight),
          clampPercent(patch.y ?? item.y, item.y),
        );
        return {
          ...item,
          ...patch,
          x: Math.max(0, nextX),
          y: Math.max(0, nextY),
          width: Math.max(4, nextWidth),
          height: Math.max(4, nextHeight),
        };
      }),
    });
  };

  const addItem = () => {
    const id = uniqueVisualId(model.items, `new-${model.itemLabel}`);
    const index = model.items.length;
    const item: VisualLabItem = {
      id,
      label: `New ${model.itemLabel.replace(/^\w/, (letter) => letter.toUpperCase())}`,
      kind: model.itemLabel === "artboard" ? "desktop" : "content",
      note: "Draft target",
      x: 8 + (index % 3) * 24,
      y: 14 + (index % 2) * 22,
      width: model.itemLabel === "region" ? 34 : 24,
      height: model.itemLabel === "region" ? 18 : 24,
    };
    commitModel({ ...model, items: [...model.items, item] });
    setSelectedId(id);
  };

  const deleteSelectedItem = () => {
    if (model.items.length <= 1 || !selectedItem) return;
    const nextItems = model.items.filter((item) => item.id !== selectedItem.id);
    commitModel({
      ...model,
      items: nextItems,
      connections: model.connections.filter(
        (connection) =>
          connection.from !== selectedItem.id && connection.to !== selectedItem.id,
      ),
    });
    setSelectedId(nextItems[0]?.id ?? null);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) / rect.width) * 100;
    const dy = ((event.clientY - drag.startY) / rect.height) * 100;
    patchItem(drag.id, {
      x: drag.item.x + dx,
      y: drag.item.y + dy,
    });
  };

  return (
    <section
      className="not-prose overflow-hidden rounded-md border bg-background"
      data-mdx-block={model.tag}
      data-docs-block-type={blockType}
      data-source-id={model.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Interactive
          </div>
          <div className="truncate text-sm font-medium">
            {model.title ?? model.id}
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addItem}>
          <PlusIcon className="h-3.5 w-3.5" />
          Add {model.itemLabel}
        </Button>
      </div>

      <div className="grid gap-3 p-3">
        <div
          ref={boardRef}
          className="relative min-h-[320px] touch-none overflow-hidden rounded-md border bg-background shadow-inner"
          style={{ aspectRatio: model.itemLabel === "region" ? "16 / 10" : "16 / 9" }}
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          {model.connections.length > 0 && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {model.connections.map((connection, index) => {
                const from = model.items.find((item) => item.id === connection.from);
                const to = model.items.find((item) => item.id === connection.to);
                if (!from || !to) return null;
                return (
                  <line
                    key={`${connection.from}-${connection.to}-${index}`}
                    x1={from.x + from.width / 2}
                    y1={from.y + from.height / 2}
                    x2={to.x + to.width / 2}
                    y2={to.y + to.height / 2}
                    className="stroke-muted-foreground/60"
                    strokeWidth="0.45"
                    strokeDasharray="1.5 1.1"
                  />
                );
              })}
            </svg>
          )}
          {model.items.map((item) => {
            const selected = item.id === selectedItem.id;
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "absolute overflow-hidden rounded-md border-2 bg-background p-2 text-left text-xs shadow-sm transition-shadow",
                  selected
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border hover:border-primary/60",
                )}
                style={itemStyle(item)}
                data-docs-target="true"
                data-docs-target-type={model.itemTargetType}
                data-source-id={`${model.id}:${item.id}`}
                data-docs-target-label={`${model.itemTargetType}: ${item.label}`}
                onClick={() => setSelectedId(item.id)}
                onPointerDown={(event) => {
                  setSelectedId(item.id);
                  setDrag({
                    id: item.id,
                    startX: event.clientX,
                    startY: event.clientY,
                    item,
                  });
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
              >
                <div className="truncate font-semibold">{item.label}</div>
                {item.kind && (
                  <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {item.kind}
                  </div>
                )}
                {item.note && (
                  <div className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">
                    {item.note}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <aside className="grid content-start gap-3">
          <section className="rounded-md border bg-muted/10 p-3">
            <div className="mb-3 font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Selected {model.itemLabel}
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <label className="grid gap-1 text-xs">
                <span className="text-muted-foreground">Name</span>
                <Input
                  value={selectedItem.label}
                  onChange={(event) =>
                    patchItem(selectedItem.id, { label: event.target.value })
                  }
                />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-muted-foreground">Kind</span>
                <Input
                  value={selectedItem.kind ?? ""}
                  onChange={(event) =>
                    patchItem(selectedItem.id, { kind: event.target.value })
                  }
                />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-muted-foreground">Note</span>
                <Input
                  value={selectedItem.note ?? ""}
                  onChange={(event) =>
                    patchItem(selectedItem.id, { note: event.target.value })
                  }
                />
              </label>
              <div className="grid grid-cols-4 gap-2 md:col-span-2">
                {(["x", "y", "width", "height"] as const).map((key) => (
                  <label key={key} className="grid gap-1 text-xs">
                    <span className="text-muted-foreground">{key}</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={formatPercent(selectedItem[key])}
                      onChange={(event) =>
                        patchItem(selectedItem.id, {
                          [key]: Number.parseFloat(event.target.value),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="md:self-end"
                disabled={model.items.length <= 1}
                onClick={deleteSelectedItem}
              >
                <Trash2Icon className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          </section>

          {model.connections.length > 0 && (
            <section className="rounded-md border bg-muted/10 p-3">
              <div className="mb-2 font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Connections
              </div>
              <div className="grid gap-1">
                {model.connections.map((connection, index) => (
                  <div
                    key={`${connection.from}-${connection.to}-${index}`}
                    className="rounded border bg-background px-2 py-1.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {connection.from} {"->"} {connection.to}
                    {connection.label ? `: ${connection.label}` : ""}
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}

export default function DocsBlockLibrary() {
  // Host-injected canvas embed slot (see ./client.tsx) — used by the
  // "Interactive Canvas Lab" preview beside the Canvas block playground.
  const CanvasEmbed = useCanvasEmbed();
  const blocks = docsMdxBlockRegistry.describeForAgent();
  const [selectedTag, setSelectedTag] = useState<string | null>(
    blocks[0]?.tag ?? null,
  );
  const [query, setQuery] = useState("");
  const [sourcesByTag, setSourcesByTag] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [targets, setTargets] = useState<TargetSummary[]>([]);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const selectedBlock = useMemo(
    () => blocks.find((block) => block.tag === selectedTag) ?? blocks[0] ?? null,
    [blocks, selectedTag],
  );
  const selectedSource = selectedBlock
    ? sourcesByTag[selectedBlock.tag] ?? sourceForTag(selectedBlock.tag)
    : "";
  const defaultSource = selectedBlock ? sourceForTag(selectedBlock.tag) : "";
  const selectedFamily = selectedBlock
    ? FAMILY_BY_TAG.get(selectedBlock.tag) ?? FALLBACK_FAMILY
    : FALLBACK_FAMILY;
  const filteredFamilies = useMemo(() => visibleFamilies(blocks, query), [blocks, query]);
  const inspection = useMemo(() => inspectSource(selectedSource), [selectedSource]);
  const hasVisualPlayground = useMemo(
    () => parseVisualLabSource(selectedSource) !== null,
    [selectedSource],
  );
  const sourceChanged = selectedSource !== defaultSource;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTargets(collectTargets(previewRef.current));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedSource, selectedTag]);

  const updateSelectedSource = (source: string) => {
    if (!selectedBlock) return;
    setSourcesByTag((current) => ({
      ...current,
      [selectedBlock.tag]: source,
    }));
  };

  const resetSelectedSource = () => {
    if (!selectedBlock) return;
    setSourcesByTag((current) => {
      const next = { ...current };
      delete next[selectedBlock.tag];
      return next;
    });
  };

  const copySelectedSource = async () => {
    if (!selectedSource) return;
    await navigator.clipboard?.writeText(selectedSource);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] min-h-[720px] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <h1 className="text-xl font-semibold">Block Library</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <BlocksIcon className="h-4 w-4" />
            <span>{blocks.length} registered docs MDX blocks</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span>{BLOCK_FAMILIES.length} families</span>
          </div>
        </div>
        <div className="relative w-full max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter blocks"
            className="h-9 w-full rounded-md border bg-background pl-9 pr-3 font-sans text-sm outline-none ring-offset-background transition-shadow focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-hidden rounded-md border border-border/60 bg-background">
          <div className="flex h-full flex-col">
            <div className="border-b bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2 font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <PaletteIcon className="h-3.5 w-3.5" />
                Families
              </div>
            </div>
            <div className="min-h-0 overflow-auto p-2">
              {filteredFamilies.length > 0 ? (
                <div className="grid gap-2">
                  {filteredFamilies.map(({ family, blocks: familyBlocks }) => (
                    <section
                      key={family.id}
                      className={cn("overflow-hidden rounded-md border bg-background", family.tone.border)}
                    >
                      <div className={cn("border-b px-3 py-2", family.tone.soft)}>
                        <div className="flex items-center justify-between gap-2">
                          <h2 className={cn("font-display text-[11px] font-semibold uppercase tracking-widest", family.tone.text)}>
                            {family.label}
                          </h2>
                          <Badge variant="outline">{familyBlocks.length}</Badge>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {family.summary}
                        </div>
                      </div>
                      <ul className="flex flex-col">
                        {familyBlocks.map((block, index) => {
                          const isSelected = block.tag === selectedBlock?.tag;
                          return (
                            <li key={block.tag}>
                              <button
                                type="button"
                                aria-label={`Select ${block.label}`}
                                onClick={() => setSelectedTag(block.tag)}
                        className={cn(
                          "relative flex w-full px-3 py-3 pl-4 text-left transition-colors",
                          index > 0 && "border-t border-border/30",
                          isSelected
                            ? cn(family.tone.bg, "ring-1", family.tone.ring)
                                    : "hover:bg-muted/40",
                                )}
                              >
                                <span
                                  aria-hidden
                                  className={cn(
                                    "absolute inset-y-1 left-1 w-[3px] rounded-full transition-opacity",
                                    family.tone.stripe,
                                    isSelected ? "opacity-100" : "opacity-0",
                                  )}
                                />
                        <span className="flex w-full items-center justify-between gap-2">
                          <span
                            className={cn(
                              "font-sans text-sm",
                              isSelected && "font-semibold text-foreground",
                                    )}
                                  >
                                    {block.label}
                                  </span>
                                  <span className="font-mono text-[10px] text-muted-foreground">
                            {block.patchOps.length} ops
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                  No matching blocks.
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden bg-transparent p-3">
          {selectedBlock ? (
            <div className="mx-auto flex h-full min-h-0 w-full max-w-[980px] flex-col overflow-hidden rounded-md border border-border/60 bg-background">
              <div className={cn("border-b px-4 py-3", selectedFamily.tone.soft)}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg">{selectedBlock.label}</h2>
                    <p className="mt-1 max-w-4xl text-sm text-foreground/85">
                      {selectedBlock.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={resetSelectedSource}
                      disabled={!sourceChanged}
                    >
                      <RotateCcwIcon className="h-3.5 w-3.5" />
                      Reset
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={copySelectedSource}>
                      <CopyIcon className="h-3.5 w-3.5" />
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
              </div>

              <Tabs defaultValue="preview" className="min-h-0 flex-1 gap-0 overflow-hidden">
                <div className="border-b border-border/60 px-3 py-2">
                  <div className="flex justify-center">
                    <TabsList>
                    <TabsTrigger value="preview">
                      <EyeIcon className="h-3.5 w-3.5" />
                      Preview
                    </TabsTrigger>
                    <TabsTrigger value="source">
                      <Code2Icon className="h-3.5 w-3.5" />
                      Source
                    </TabsTrigger>
                    </TabsList>
                  </div>
                </div>

                <TabsContent
                  forceMount
                  value="preview"
                  className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden"
                  style={{
                    backgroundImage:
                      "linear-gradient(color-mix(in oklab, var(--border) 35%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--border) 35%, transparent) 1px, transparent 1px)",
                    backgroundSize: "32px 32px",
                  }}
                >
                  <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
                    <div
                      className={cn(
                        "rounded-md border bg-background shadow-sm",
                        selectedFamily.tone.border,
                      )}
                    >
                      <div className={cn("border-b px-3 py-2", selectedFamily.tone.soft)}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <BlocksIcon className={cn("h-4 w-4", selectedFamily.tone.text)} />
                            <span className="truncate font-display text-xs font-medium uppercase tracking-wider">
                              {selectedBlock.label}
                            </span>
                            <code className="font-mono text-[11px] text-muted-foreground">
                              {inspection.state === "ok" ? inspection.sourceId : selectedBlock.tag}
                            </code>
                          </div>
                        </div>
                      </div>
                      <div ref={previewRef} className="p-4 sm:p-7">
                        <div className="docs-markdown prose prose-sm dark:prose-invert max-w-none font-sans text-sm leading-[1.7]">
                          {selectedSource.trim() ? (
                            hasVisualPlayground ? (
                              <div className="grid gap-4">
                                <VisualBlockPlayground
                                  source={selectedSource}
                                  blockType={selectedBlock.type}
                                  onSourceChange={updateSelectedSource}
                                />
                                {selectedBlock.tag === "Canvas" && (
                                  <section className="rounded-md border bg-background p-3">
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                      <div>
                                        <div className="font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                          Interactive Canvas Lab
                                        </div>
                                        <div className="text-sm font-medium">
                                          Sidecar subsystem fixture
                                        </div>
                                      </div>
                                      <Badge variant="outline">.canvas.json</Badge>
                                    </div>
                                    {CanvasEmbed ? (
                                      // id="synthetic" with no projectId renders the
                                      // built-in synthetic fixture canvas in Spectre's
                                      // CanvasSidecarEmbed implementation of this slot.
                                      <CanvasEmbed id="synthetic" />
                                    ) : (
                                      <CanvasEmbedUnavailable title="Sidecar subsystem fixture" />
                                    )}
                                  </section>
                                )}
                              </div>
                            ) : (
                              <MdxDocumentRenderer content={selectedSource} />
                            )
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              Empty source.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent
                  forceMount
                  value="source"
                  className="min-h-0 flex-1 overflow-auto bg-muted/10 data-[state=inactive]:hidden"
                >
                  <div className="grid w-full gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <section className="overflow-hidden rounded-md border bg-background">
                      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                        <div className="flex items-center gap-2 font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          <Code2Icon className="h-3.5 w-3.5" />
                          Source Editor
                        </div>
                      </div>
                      <div className="p-3">
                        <Textarea
                          aria-label="MDX source editor"
                          value={selectedSource}
                          onChange={(event) => updateSelectedSource(event.target.value)}
                          spellCheck={false}
                          className="min-h-[520px] resize-y font-mono text-xs leading-relaxed"
                        />
                      </div>
                    </section>

                    <aside className="grid content-start gap-3">
                      <section className="rounded-md border bg-background p-3">
                        <div className="mb-2 flex items-center gap-2 font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          <CheckCircle2Icon className="h-3.5 w-3.5" />
                          Parse
                        </div>
                        <dl className="grid gap-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <dt className="text-muted-foreground">State</dt>
                            <dd className="font-mono">{inspection.state}</dd>
                          </div>
                          {"tag" in inspection && (
                            <div className="flex items-center justify-between gap-2">
                              <dt className="text-muted-foreground">Tag</dt>
                              <dd className="font-mono">{inspection.tag}</dd>
                            </div>
                          )}
                          {inspection.state === "ok" && (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <dt className="text-muted-foreground">Type</dt>
                                <dd className="font-mono">{inspection.type}</dd>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <dt className="text-muted-foreground">Source id</dt>
                                <dd className="truncate font-mono">{inspection.sourceId ?? "none"}</dd>
                              </div>
                            </>
                          )}
                        </dl>
                      </section>

                      <section className="rounded-md border bg-background p-3">
                        <div className="mb-2 flex items-center gap-2 font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          <WrenchIcon className="h-3.5 w-3.5" />
                          Patch Ops
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedBlock.patchOps.length > 0 ? (
                            selectedBlock.patchOps.map((op) => (
                              <span
                                key={op}
                                className="rounded-sm border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                              >
                                {op}
                              </span>
                            ))
                          ) : (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              none
                            </span>
                          )}
                        </div>
                      </section>

                      <section className="rounded-md border bg-background p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            <CrosshairIcon className="h-3.5 w-3.5" />
                            Rendered Targets
                          </div>
                          <Badge variant="outline">{targets.length}</Badge>
                        </div>
                        <div className="grid max-h-64 gap-1 overflow-auto pr-1">
                          {targets.length > 0 ? (
                            targets.map((target) => (
                              <div
                                key={target.sourceId}
                                className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded border bg-muted/15 px-2 py-1.5 text-xs"
                              >
                                <span className="truncate font-mono">{target.sourceId}</span>
                                <span className="font-mono text-muted-foreground">{target.type}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-muted-foreground">No rendered targets.</div>
                          )}
                        </div>
                      </section>
                    </aside>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a block to view details
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
