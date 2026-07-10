"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BlocksIcon, SearchIcon } from "lucide-react";
import type {
  DeltaSpan,
  DeltaSpanAttributes,
  DocBlock,
  DocBlockType,
  DocDocument,
} from "@codecaine-ai/docs-model/doc-schema";
import DocBlockRenderer from "./DocBlockRenderer";
import { getDocBlockDescriptor } from "./block-registry";
import { Badge } from "../ui/badge";
import { cn } from "../ui/cn";

/**
 * The block library (`#/blocks` in the docs workbench) is a catalog of the
 * doc.json block type vocabulary — one entry per doc-schema block type, each
 * rendered from a real DocDocument fragment through DocBlockRenderer, the
 * SAME read surface the workbench uses for docs. What you see here is
 * exactly what a doc looks like; the expandable doc.json source under each
 * example is exactly what a doc is.
 *
 * Canvas examples render through the host-injected `canvasEmbed` slot
 * (DocsClientProvider) like any canvas block; the image example uses an
 * inline data: URI and the video example an external provider URL so the
 * catalog never depends on bundle assets.
 */

function span(insert: string, attributes?: DeltaSpanAttributes): DeltaSpan {
  return attributes ? { insert, attributes } : { insert };
}

function block(
  id: string,
  type: DocBlockType,
  init: {
    props?: Record<string, unknown>;
    text?: DeltaSpan[];
    children?: string[];
  } = {},
): DocBlock {
  return {
    id,
    type,
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
  type: DocBlockType,
  blocks: DocBlock[],
  rootChildren?: string[],
): DocDocument {
  return {
    schemaVersion: 1,
    id: `library-${type}`,
    root: "root",
    blocks: {
      root: {
        id: "root",
        type: "paragraph",
        props: {},
        children: rootChildren ?? blocks.map((example) => example.id),
      },
      ...Object.fromEntries(blocks.map((example) => [example.id, example])),
    },
  };
}

type LibraryEntry = {
  type: DocBlockType;
  document: DocDocument;
};

type LibraryFamily = {
  id: string;
  label: string;
  summary: string;
  entries: LibraryEntry[];
};

function entry(
  type: DocBlockType,
  blocks: DocBlock[],
  rootChildren?: string[],
): LibraryEntry {
  return { type, document: exampleDoc(type, blocks, rootChildren) };
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
        // The canonical usage: an annotated JSON STATE OBJECT. The code block
        // holds a system's state as JSON; `props.annotations` explain the
        // design decisions behind individual fields, pairing with their line
        // ranges on click. (The ways to CHANGE this state belong in an
        // interaction-surface block — see the Structured family.)
        block("code-1", "code", {
          props: {
            language: "json",
            annotations: [
              {
                lines: "3",
                label: "Flat entries",
                note: "State is a flat entry list — directories derive from path prefixes, so there is no nested tree to keep consistent.",
              },
              {
                lines: "4",
                label: "Change markers",
                note: 'Diff state rides on each entry as a "change" marker instead of a separate changeset.',
              },
              {
                lines: "6",
                label: "Rename provenance",
                note: '"from" keeps the old path, so a rename stays one entry instead of a remove plus an add.',
              },
            ],
          },
          text: [
            span(
              [
                "{",
                '  "title": "Agent runtime layout",',
                '  "entries": [',
                '    { "path": "src/runtime/dispatch.ts", "change": "added", "note": "tool-call routing" },',
                '    { "path": "src/agents/planner.ts", "change": "renamed",',
                '      "from": "src/agents/orchestrator.ts" }',
                "  ]",
                "}",
              ].join("\n"),
            ),
          ],
        }),
      ]),
      entry("callout", [
        // `kind` replaces the tone text in the label chip — legacy semantic
        // cards (decision/requirement/...) coerce to callouts with a kind.
        block("callout-1", "callout", {
          props: { tone: "info", kind: "Decision", title: "One tool registry" },
          text: [
            span(
              "Agents share a single tool registry; per-agent allowlists narrow it instead of forking it.",
            ),
          ],
        }),
      ]),
      entry("divider", [
        block("divider-above", "paragraph", {
          text: [span("Content above the divider.")],
        }),
        block("divider-1", "divider"),
        block("divider-below", "paragraph", {
          text: [span("Content below the divider.")],
        }),
      ]),
    ],
  },
  {
    id: "structured",
    label: "Structured",
    summary: "Typed structured records rendered from props or a body grammar",
    entries: [
      entry("structured-table", [
        block("structured-table-1", "structured-table", {
          props: {
            title: "Agent roster",
            density: "compact",
            columns: ["Agent", "Model", "Purpose"],
            rows: [
              ["planner", "fable-5", "Decomposes the request into tasks"],
              ["worker", "sonnet-5", "Executes one task in isolation"],
              ["reviewer", "opus-4.8", "Accepts or rejects worker output"],
            ],
          },
        }),
      ]),
      entry("file-tree", [
        block("file-tree-1", "file-tree", {
          props: {
            title: "Agent runtime layout",
            entries: [
              // Explicit trailing-"/" directory entry with a note.
              { path: "src/runtime/", note: "agent runtime core" },
              {
                path: "src/runtime/registry.ts",
                note: "single tool registry",
                change: "modified",
              },
              {
                path: "src/runtime/dispatch.ts",
                note: "tool-call routing",
                change: "added",
              },
              {
                path: "src/runtime/legacy-router.ts",
                note: "superseded by dispatch.ts",
                change: "removed",
              },
              {
                path: "src/agents/planner.ts",
                change: "renamed",
                from: "src/agents/orchestrator.ts",
              },
              { path: "src/index.ts" },
            ],
          },
        }),
      ]),
      entry("interaction-surface", [
        // The ways to change a state — operation signatures on a system, not
        // HTTP endpoints. This example documents the file-tree block's own
        // surface (self-documenting: the same actions the docs kernel exposes).
        block("interaction-surface-1", "interaction-surface", {
          props: {
            title: "File-tree block surface",
            operations: [
              {
                name: "file-tree.addEntry",
                description: "Append a path entry to the tree",
                params: [
                  { name: "path", type: "string", required: true, description: "/-separated path" },
                  { name: "note", type: "string", required: false },
                  { name: "change", type: "string", required: false },
                ],
                returns: "props patch",
                kind: "action",
              },
              {
                name: "file-tree.updateEntry",
                description: "Patch note/change/from, or rename via newPath",
                params: [
                  { name: "path", type: "string", required: true },
                  { name: "newPath", type: "string", required: false },
                ],
                returns: "props patch",
                kind: "action",
              },
              {
                name: "file-tree.entries",
                description: "Read the current entry list",
                returns: "FileTreeEntry[]",
                kind: "query",
              },
              {
                name: "file-tree.changed",
                description: "Fires after an applied props patch",
                kind: "event",
              },
            ],
          },
        }),
      ]),
    ],
  },
  {
    id: "diagram-media",
    label: "Diagram & media",
    summary: "Diagrams, canvases, images, and video",
    entries: [
      entry("mermaid", [
        block("mermaid-1", "mermaid", {
          props: {
            title: "Delegation flow",
            caption: "The planner fans work out to workers; the reviewer gates the merge.",
          },
          text: [
            span(
              [
                "flowchart LR",
                "  U[User turn] --> P[Planner]",
                "  P --> W1[Worker A]",
                "  P --> W2[Worker B]",
                "  W1 --> R[Reviewer]",
                "  W2 --> R",
              ].join("\n"),
            ),
          ],
        }),
      ]),
      entry("canvas", [
        // canvasId "synthetic" renders the canvas package's built-in fixture
        // in the workbench's StandaloneCanvasEmbed; hosts without a
        // canvasEmbed slot get the neutral "embed unavailable" card.
        block("canvas-1", "canvas", {
          props: { canvasId: "synthetic", title: "Synthetic fixture canvas" },
        }),
      ]),
      entry("image", [
        block("image-1", "image", {
          props: {
            src: EXAMPLE_IMAGE_SRC,
            alt: "Placeholder illustration",
            caption:
              "props.src is usually a bundle asset path resolved by the host.",
          },
        }),
      ]),
      entry("video", [
        block("video-1", "video", {
          props: {
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            title: "External video example",
            caption:
              "props.url embeds YouTube/Vimeo/Loom players; props.src plays a bundle video asset.",
          },
        }),
      ]),
    ],
  },
];

const BLOCK_TYPE_COUNT = LIBRARY_FAMILIES.reduce(
  (count, family) => count + family.entries.length,
  0,
);

/** The example's non-root blocks, pretty-printed as the doc.json vocabulary. */
function exampleSource(document: DocDocument): string {
  const { [document.root]: _root, ...blocks } = document.blocks;
  return JSON.stringify(blocks, null, 2);
}

type JsonTokenKind = "key" | "string" | "number" | "boolean" | "null" | "punct";

/**
 * JSON token tints, JSON Explorer heritage: keys sky, strings emerald,
 * numbers amber, booleans violet, null muted italic; structural punctuation
 * and whitespace muted.
 */
const JSON_TOKEN_CLASS: Record<JsonTokenKind, string> = {
  key: "text-sky-700 dark:text-sky-300",
  string: "text-emerald-700 dark:text-emerald-300",
  number: "text-amber-700 dark:text-amber-300",
  boolean: "text-violet-700 dark:text-violet-300",
  null: "italic text-muted-foreground",
  punct: "text-muted-foreground",
};

/**
 * Value tokens in JSON.stringify output: a string (key when followed by a
 * colon), a number, or a literal. Everything between matches is structural
 * punctuation/whitespace. The source is always our own pretty-printed
 * JSON.stringify output, so this tiny deterministic pass is enough — no
 * highlight.js needed.
 */
const JSON_TOKEN_PATTERN =
  /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\bnull\b/g;

/**
 * Renders pretty-printed JSON as colorized token spans. The concatenated
 * span text is exactly the input string, so `textContent` of the host
 * element stays valid parseable JSON.
 */
function JsonTokens({ source }: { source: string }) {
  const tokens: { kind: JsonTokenKind; text: string }[] = [];
  let cursor = 0;
  JSON_TOKEN_PATTERN.lastIndex = 0;
  for (
    let match = JSON_TOKEN_PATTERN.exec(source);
    match;
    match = JSON_TOKEN_PATTERN.exec(source)
  ) {
    if (match.index > cursor) {
      tokens.push({ kind: "punct", text: source.slice(cursor, match.index) });
    }
    const [, string, keyColon, number, boolean] = match;
    if (string !== undefined) {
      tokens.push({ kind: keyColon ? "key" : "string", text: string });
      if (keyColon) tokens.push({ kind: "punct", text: keyColon });
    } else if (number !== undefined) {
      tokens.push({ kind: "number", text: number });
    } else if (boolean !== undefined) {
      tokens.push({ kind: "boolean", text: boolean });
    } else {
      tokens.push({ kind: "null", text: match[0] });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) {
    tokens.push({ kind: "punct", text: source.slice(cursor) });
  }
  return (
    <>
      {tokens.map((token, index) => (
        <span key={index} data-json-token={token.kind} className={JSON_TOKEN_CLASS[token.kind]}>
          {token.text}
        </span>
      ))}
    </>
  );
}

/** Anchor id for a block type's example card, targeted by the sidebar. */
function cardAnchorId(type: DocBlockType): string {
  return `library-block-${type}`;
}

function BlockTypeCard({ entry }: { entry: LibraryEntry }) {
  const descriptor = getDocBlockDescriptor(entry.type);
  return (
    <section
      id={cardAnchorId(entry.type)}
      className="scroll-mt-4 overflow-hidden rounded-md border border-border/60 bg-background"
      data-library-type={entry.type}
    >
      <header className="border-b bg-muted/30 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="font-display text-sm font-semibold">
            {descriptor?.label ?? entry.type}
          </h3>
          <code className="font-mono text-[11px] text-muted-foreground">
            {entry.type}
          </code>
        </div>
        {descriptor?.agentDescription && (
          <p className="mt-1 text-xs text-muted-foreground">
            {descriptor.agentDescription}
          </p>
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
          <JsonTokens source={exampleSource(entry.document)} />
        </pre>
      </details>
    </section>
  );
}

/**
 * One compact sidebar row per block type: label plus the monospace type name,
 * echoing the retired DocsComponentGallery's label + mono-tag look.
 */
function SidebarEntry({
  entry,
  active,
  onSelect,
}: {
  entry: LibraryEntry;
  active: boolean;
  onSelect: (type: DocBlockType) => void;
}) {
  const descriptor = getDocBlockDescriptor(entry.type);
  return (
    <li>
      <button
        type="button"
        data-library-nav={entry.type}
        aria-current={active ? "true" : undefined}
        onClick={() => onSelect(entry.type)}
        className={cn(
          "flex w-full flex-col items-start gap-0.5 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:bg-muted/60",
          active && "border-border/60 bg-muted/60",
        )}
      >
        <span className="w-full truncate text-xs font-medium leading-tight">
          {descriptor?.label ?? entry.type}
        </span>
      </button>
    </li>
  );
}

export default function DocsBlockLibrary() {
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<DocBlockType | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const visibleFamilies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return LIBRARY_FAMILIES;
    return LIBRARY_FAMILIES.map((family) => ({
      ...family,
      entries: family.entries.filter((candidate) => {
        const descriptor = getDocBlockDescriptor(candidate.type);
        return [
          candidate.type,
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

  // Scroll-spy: highlight the sidebar entry for the topmost visible example
  // card. IntersectionObserver is absent in happy-dom, so guard and skip —
  // the click handler still drives the active state without it.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const content = contentRef.current;
    if (!content) return;
    const cards = Array.from(
      content.querySelectorAll<HTMLElement>("[data-library-type]"),
    );
    if (cards.length === 0) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const intersection of entries) {
          const type = intersection.target.getAttribute("data-library-type");
          if (!type) continue;
          if (intersection.isIntersecting) visible.add(type);
          else visible.delete(type);
        }
        const topmost = cards.find((card) =>
          visible.has(card.getAttribute("data-library-type") ?? ""),
        );
        const type = topmost?.getAttribute("data-library-type");
        if (type) setActiveType(type as DocBlockType);
      },
      { rootMargin: "0px 0px -55% 0px" },
    );
    for (const card of cards) observer.observe(card);
    return () => observer.disconnect();
  }, [visibleFamilies]);

  const selectType = (type: DocBlockType) => {
    setActiveType(type);
    const card = document.getElementById(cardAnchorId(type));
    if (!card) return;
    card.scrollIntoView?.({ behavior: "smooth", block: "start" });
    // Some embedded/headless browsers silently drop or stall smooth scrolls
    // (the animation never ticks, or creeps a few px and stops). Two guards,
    // both keyed on "has the card ARRIVED near the top" rather than "did
    // anything move" — a stalled animation can move a little and still never
    // arrive. In happy-dom rects are all zeros (top stays within the arrival
    // band), so both stay no-ops under tests.
    const arrived = () => {
      const top = card.getBoundingClientRect().top;
      return top >= -8 && top <= 64;
    };
    const before = card.getBoundingClientRect().top;
    window.setTimeout(() => {
      // Fully dropped: essentially no movement shortly after the call.
      if (
        Math.abs(card.getBoundingClientRect().top - before) < 2 &&
        !arrived()
      ) {
        card.scrollIntoView?.({ block: "start" });
      }
    }, 160);
    window.setTimeout(() => {
      // Stalled mid-flight: a healthy smooth scroll has finished by now.
      if (!arrived()) card.scrollIntoView?.({ block: "start" });
    }, 500);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <h1 className="text-xl font-semibold">Block Library</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <BlocksIcon className="h-4 w-4" />
            <span>{BLOCK_TYPE_COUNT} doc.json block types</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span>{LIBRARY_FAMILIES.length} families</span>
          </div>
        </div>
        <div className="relative w-full max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter block types"
            className="h-9 w-full rounded-md border bg-background pl-9 pr-3 font-sans text-sm outline-none ring-offset-background transition-shadow focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav
          aria-label="Block types"
          data-library-sidebar
          className="flex flex-col gap-4 lg:sticky lg:top-0 lg:max-h-[calc(100vh-8rem)] lg:w-60 lg:shrink-0 lg:overflow-y-auto lg:pr-2"
        >
          {visibleFamilies.map((family) => (
            <div key={family.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 px-2">
                <span className="font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {family.label}
                </span>
                <Badge variant="outline">{family.entries.length}</Badge>
              </div>
              <ul className="flex flex-col">
                {family.entries.map((familyEntry) => (
                  <SidebarEntry
                    key={familyEntry.type}
                    entry={familyEntry}
                    active={activeType === familyEntry.type}
                    onSelect={selectType}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div ref={contentRef} className="flex min-w-0 flex-1 flex-col gap-4">
          {visibleFamilies.length > 0 ? (
            visibleFamilies.map((family) => (
              <section key={family.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-primary">
                    {family.label}
                  </h2>
                  <Badge variant="outline">{family.entries.length}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {family.summary}
                  </span>
                </div>
                {family.entries.map((familyEntry) => (
                  <BlockTypeCard key={familyEntry.type} entry={familyEntry} />
                ))}
              </section>
            ))
          ) : (
            <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
              No matching block types.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
