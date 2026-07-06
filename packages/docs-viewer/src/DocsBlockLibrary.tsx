"use client";

import { useMemo, useState } from "react";
import { BlocksIcon, SearchIcon } from "lucide-react";
import type {
  DeltaSpan,
  DeltaSpanAttributes,
  DocBlock,
  DocBlockFlavour,
  DocDocument,
} from "@codecaine-ai/docs-model/doc-schema";
import DocBlockRenderer from "./DocBlockRenderer";
import { getDocFlavourDescriptor } from "./flavour-registry";
import { Badge } from "./ui/badge";

/**
 * The block library (`#/blocks` in the docs workbench) is a catalog of the
 * doc.json flavour vocabulary — one entry per doc-schema flavour, each
 * rendered from a real DocDocument fragment through DocBlockRenderer, the
 * SAME read surface the workbench uses for docs. What you see here is
 * exactly what a doc looks like; the expandable doc.json source under each
 * example is exactly what a doc is.
 *
 * Canvas examples render through the host-injected `canvasEmbed` slot
 * (DocsClientProvider) like any canvas block; image/attachment examples use
 * inline data: URIs so the catalog never depends on bundle assets.
 */

function span(insert: string, attributes?: DeltaSpanAttributes): DeltaSpan {
  return attributes ? { insert, attributes } : { insert };
}

function block(
  id: string,
  flavour: DocBlockFlavour,
  init: { props?: Record<string, unknown>; text?: DeltaSpan[]; children?: string[] } = {},
): DocBlock {
  return {
    id,
    flavour,
    props: init.props ?? {},
    ...(init.text ? { text: init.text } : {}),
    children: init.children ?? [],
  };
}

/**
 * Wraps example blocks in a minimal one-page DocDocument. `rootChildren`
 * lists the top-level order explicitly when some blocks are nested children
 * of others (list-item); by default every block mounts at the root.
 */
function exampleDoc(
  flavour: DocBlockFlavour,
  blocks: DocBlock[],
  rootChildren?: string[],
): DocDocument {
  return {
    schemaVersion: 1,
    id: `library-${flavour}`,
    root: "root",
    blocks: {
      root: {
        id: "root",
        flavour: "paragraph",
        props: {},
        children: rootChildren ?? blocks.map((example) => example.id),
      },
      ...Object.fromEntries(blocks.map((example) => [example.id, example])),
    },
  };
}

type LibraryEntry = {
  flavour: DocBlockFlavour;
  document: DocDocument;
};

type LibraryFamily = {
  id: string;
  label: string;
  summary: string;
  entries: LibraryEntry[];
};

function entry(
  flavour: DocBlockFlavour,
  blocks: DocBlock[],
  rootChildren?: string[],
): LibraryEntry {
  return { flavour, document: exampleDoc(flavour, blocks, rootChildren) };
}

/** Inline SVG placeholder so the image example renders without any asset route. */
const EXAMPLE_IMAGE_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(
  [
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="140">',
    '<rect width="480" height="140" rx="8" fill="#e2e8f0"/>',
    '<circle cx="70" cy="70" r="34" fill="#94a3b8"/>',
    '<rect x="130" y="46" width="240" height="14" rx="7" fill="#cbd5e1"/>',
    '<rect x="130" y="74" width="180" height="14" rx="7" fill="#cbd5e1"/>',
    "</svg>",
  ].join(""),
)}`;

/** Inline text payload so the attachment card's download href stays live. */
const EXAMPLE_ATTACHMENT_SRC = "data:text/plain,Example%20attachment%20payload";

const LIBRARY_FAMILIES: LibraryFamily[] = [
  {
    id: "text",
    label: "Text",
    summary: "Prose primitives carrying delta-span rich text",
    entries: [
      entry("paragraph", [
        block("paragraph-1", "paragraph", {
          text: [
            span("Paragraphs carry "),
            span("bold", { bold: true }),
            span(", "),
            span("italic", { italic: true }),
            span(", "),
            span("struck", { strike: true }),
            span(", "),
            span("inline code", { code: true }),
            span(", and "),
            span("linked", { link: "https://example.com" }),
            span(" text as delta spans."),
          ],
        }),
      ]),
      entry("heading", [
        block("heading-1", "heading", {
          props: { level: 2 },
          text: [span("Section heading (props.level = 2)")],
        }),
        block("heading-2", "heading", {
          props: { level: 3 },
          text: [span("Subsection heading (props.level = 3)")],
        }),
      ]),
      entry(
        "list-item",
        [
          block("item-1", "list-item", {
            text: [span("First item")],
            children: ["item-1-nested"],
          }),
          block("item-1-nested", "list-item", {
            text: [span("Nested item — nesting is a child list-item block")],
          }),
          block("item-2", "list-item", { text: [span("Second item")] }),
        ],
        ["item-1", "item-2"],
      ),
      entry("quote", [
        block("quote-1", "quote", {
          text: [span("Stable block ids are a system invariant.")],
        }),
      ]),
      entry("code", [
        block("code-1", "code", {
          props: { language: "ts" },
          text: [span("export type DocBlockFlavour = (typeof DOC_BLOCK_FLAVOURS)[number];")],
        }),
      ]),
    ],
  },
  {
    id: "semantic",
    label: "Semantic cards",
    summary: "Callouts, decisions, and structured review context",
    entries: [
      entry("callout", [
        block("callout-1", "callout", {
          props: { tone: "risk", title: "Review anchor" },
          text: [
            span(
              "Callouts highlight notes, risks, warnings, and successes with a tone badge.",
            ),
          ],
        }),
      ]),
      entry("decision", [
        block("decision-1", "decision", {
          props: { status: "accepted", title: "Docs are doc.json bundles" },
          text: [
            span("Documents are normalized block trees rendered through the flavour registry."),
          ],
        }),
      ]),
      entry("constraint", [
        block("constraint-1", "constraint", {
          props: { severity: "hard", owner: "docs-system", title: "Stable ids" },
          text: [
            span("Block ids never change once assigned — comments and patches anchor to them."),
          ],
        }),
      ]),
      entry("assumption", [
        block("assumption-1", "assumption", {
          props: { confidence: "high", owner: "docs-system", title: "Real docs first" },
          text: [
            span("Existing docs are the best material for discovering useful block shapes."),
          ],
        }),
      ]),
    ],
  },
  {
    id: "engineering",
    label: "Engineering records",
    summary: "Review findings, agent contracts, and source-aware records",
    entries: [
      entry("observation", [
        block("observation-1", "observation", {
          props: { title: "Hover targeting" },
          text: [span("Reviewers hover rendered blocks far more often than raw source lines.")],
        }),
      ]),
      entry("outcome", [
        block("outcome-1", "outcome", {
          props: { title: "Migration landed" },
          text: [span("All docs now load as doc.json bundles; the MDX read path is retired.")],
        }),
      ]),
      entry("requirement", [
        block("requirement-1", "requirement", {
          props: { title: "Round-trip safety" },
          text: [span("Every editor save must re-validate against the doc schema before write.")],
        }),
      ]),
      entry("implementation", [
        block("implementation-1", "implementation", {
          props: { title: "Flavour registry" },
          text: [
            span("Rendering goes through "),
            span("flavour-registry.ts", { code: true }),
            span(" descriptors keyed by block flavour."),
          ],
        }),
      ]),
      entry("testing", [
        block("testing-1", "testing", {
          props: { title: "Fixture coverage" },
          text: [span("The sample fixture doc exercises every flavour in one render pass.")],
        }),
      ]),
      entry("agent-contract", [
        block("agent-contract-1", "agent-contract", {
          props: {
            agent: "Docs Revisor",
            title: "Docs Revisor",
            tools: "docs.proposeEdit",
            approvals: "Human review required",
          },
          text: [
            span(
              "Reads queued annotations, proposes doc patches, and waits for approval before landing edits.",
            ),
          ],
        }),
      ]),
      entry("file-tree", [
        block("file-tree-1", "file-tree", {
          props: {
            title: "Touched files",
            entries: [
              {
                path: "packages/docs-viewer/src/DocBlockRenderer.tsx",
                note: "shared read surface",
                change: "modified",
              },
              {
                path: "packages/docs-viewer/src/DocsBlockLibrary.tsx",
                note: "flavour catalog",
                change: "added",
              },
            ],
          },
        }),
      ]),
    ],
  },
  {
    id: "media",
    label: "Media & atoms",
    summary: "Dividers, images, and attachment cards",
    entries: [
      entry("divider", [
        block("divider-above", "paragraph", {
          text: [span("Content above the divider.")],
        }),
        block("divider-1", "divider"),
        block("divider-below", "paragraph", {
          text: [span("Content below the divider.")],
        }),
      ]),
      entry("image", [
        block("image-1", "image", {
          props: {
            src: EXAMPLE_IMAGE_SRC,
            alt: "Placeholder illustration",
            caption: "props.src is usually a bundle asset path resolved by the host.",
          },
        }),
      ]),
      entry("attachment", [
        block("attachment-1", "attachment", {
          props: { src: EXAMPLE_ATTACHMENT_SRC, name: "design-notes.txt", size: 142_000 },
        }),
      ]),
    ],
  },
  {
    id: "canvas",
    label: "Canvas",
    summary: "Interactive canvas embeds through the host slot",
    entries: [
      entry("canvas", [
        // canvasId "synthetic" renders the canvas package's built-in fixture
        // in the workbench's StandaloneCanvasEmbed; hosts without a
        // canvasEmbed slot get the neutral "embed unavailable" card.
        block("canvas-1", "canvas", {
          props: { canvasId: "synthetic", title: "Synthetic fixture canvas" },
        }),
      ]),
    ],
  },
];

const FLAVOUR_COUNT = LIBRARY_FAMILIES.reduce(
  (count, family) => count + family.entries.length,
  0,
);

/** The example's non-root blocks, pretty-printed as the doc.json vocabulary. */
function exampleSource(document: DocDocument): string {
  const { [document.root]: _root, ...blocks } = document.blocks;
  return JSON.stringify(blocks, null, 2);
}

function FlavourCard({ entry }: { entry: LibraryEntry }) {
  const descriptor = getDocFlavourDescriptor(entry.flavour);
  return (
    <section
      className="overflow-hidden rounded-md border border-border/60 bg-background"
      data-library-flavour={entry.flavour}
    >
      <header className="border-b bg-muted/30 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="font-display text-sm font-semibold">
            {descriptor?.label ?? entry.flavour}
          </h3>
          <code className="font-mono text-[11px] text-muted-foreground">{entry.flavour}</code>
        </div>
        {descriptor?.agentDescription && (
          <p className="mt-1 text-xs text-muted-foreground">{descriptor.agentDescription}</p>
        )}
      </header>
      <div className="px-4 py-2">
        <DocBlockRenderer document={entry.document} />
      </div>
      <details className="border-t bg-muted/10 px-4 py-2">
        <summary className="cursor-pointer select-none font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          doc.json
        </summary>
        <pre className="my-2 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
          {exampleSource(entry.document)}
        </pre>
      </details>
    </section>
  );
}

export default function DocsBlockLibrary() {
  const [query, setQuery] = useState("");

  const visibleFamilies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return LIBRARY_FAMILIES;
    return LIBRARY_FAMILIES.map((family) => ({
      ...family,
      entries: family.entries.filter((candidate) => {
        const descriptor = getDocFlavourDescriptor(candidate.flavour);
        return [
          candidate.flavour,
          descriptor?.label ?? "",
          descriptor?.agentDescription ?? "",
          family.label,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    })).filter((family) => family.entries.length > 0);
  }, [query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <h1 className="text-xl font-semibold">Block Library</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <BlocksIcon className="h-4 w-4" />
            <span>{FLAVOUR_COUNT} doc.json block flavours</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span>{LIBRARY_FAMILIES.length} families</span>
          </div>
        </div>
        <div className="relative w-full max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter flavours"
            className="h-9 w-full rounded-md border bg-background pl-9 pr-3 font-sans text-sm outline-none ring-offset-background transition-shadow focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {visibleFamilies.length > 0 ? (
        visibleFamilies.map((family) => (
          <section key={family.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-primary">
                {family.label}
              </h2>
              <Badge variant="outline">{family.entries.length}</Badge>
              <span className="text-xs text-muted-foreground">{family.summary}</span>
            </div>
            {family.entries.map((familyEntry) => (
              <FlavourCard key={familyEntry.flavour} entry={familyEntry} />
            ))}
          </section>
        ))
      ) : (
        <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
          No matching flavours.
        </div>
      )}
    </div>
  );
}
