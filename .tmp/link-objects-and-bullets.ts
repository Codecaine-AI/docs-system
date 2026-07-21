/**
 * Ford's directives (2026-07-21, linking read-through):
 * 1. BETTER LINK OBJECTS — doc ref = {kind:"doc", path} (no label; the span
 *    text inlines the doc's name); code ref = {kind:"source", path} verified
 *    by links check. Sweep: every reference attr loses `label`; every plain
 *    code span whose text is an EXISTING repo path becomes code+source-ref.
 * 2. BULLET PATTERN (his structure-doc exemplar): bold-label top bullets
 *    carry the label ONLY — no "label — content" lines; facts become
 *    sub-bullets. Applied here to numbering + in-code-docs; the two linking
 *    docs are rewritten wholesale in the pattern with the new objects.
 * Canonical bytes everywhere.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const b = (text: string): DeltaSpan => ({ insert: text, attributes: { bold: true } });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });
const ref = (text: string, path: string): DeltaSpan => ({
  insert: text,
  attributes: { reference: { kind: "doc", path } },
});

const SEC = "docs/10-system-design/10-doc-standards";

function land(path: string, doc: unknown) {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} validation failed:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  writeFileSync(path, serializeDocDocument(result.document));
}
function li(id: string, text: DeltaSpan[], children: string[] = []) {
  return { id, type: "list-item", props: {}, text, children };
}

// ------------------------------------------------- corpus-wide object sweep
{
  const files = Array.from(new Bun.Glob("docs/**/doc.json").scanSync({ cwd: "." })).sort();
  let labelsDropped = 0;
  let sourceRefs = 0;
  for (const path of files) {
    const doc = JSON.parse(readFileSync(path, "utf8"));
    let touched = false;
    for (const block of Object.values(doc.blocks) as Array<{ text?: DeltaSpan[] }>) {
      if (!block.text) continue;
      for (const span of block.text) {
        const attrs = span.attributes as Record<string, unknown> | undefined;
        const r = attrs?.reference as { label?: string } | undefined;
        if (r && "label" in r) {
          delete r.label;
          labelsDropped += 1;
          touched = true;
        }
        // plain code span whose text is an existing repo path -> typed source ref
        if (
          attrs?.code === true &&
          !attrs.reference &&
          typeof span.insert === "string" &&
          span.insert.includes("/") &&
          !span.insert.includes(" ") &&
          existsSync(span.insert.replace(/\/$/, ""))
        ) {
          attrs.reference = { kind: "source", path: span.insert.replace(/\/$/, "") };
          sourceRefs += 1;
          touched = true;
        }
      }
    }
    if (touched) land(path, doc);
  }
  console.log(`sweep: ${labelsDropped} labels dropped, ${sourceRefs} code paths → source refs`);
}

// ------------------------------- bullet pattern: bold-lead em-dash -> subs
function splitBoldLeads(path: string, ids: string[]) {
  const doc = JSON.parse(readFileSync(path, "utf8"));
  let n = 0;
  for (const id of ids) {
    const block = doc.blocks[id];
    if (!block?.text || block.text.length < 2) continue;
    const [lead, ...rest] = block.text as DeltaSpan[];
    if (!lead.attributes?.bold) continue;
    const restText = rest
      .map((s) => s.insert)
      .join("")
      .replace(/^\s*—\s*/, "");
    if (!restText) continue;
    const subId = `${id}-sub`;
    const subText = restText.charAt(0).toUpperCase() + restText.slice(1);
    doc.blocks[subId] = li(subId, [t(subText)]);
    block.text = [lead];
    block.children = [subId, ...(block.children ?? [])];
    n += 1;
  }
  land(path, doc);
  console.log(`${path}: ${n} bold leads split`);
}
splitBoldLeads(`${SEC}/20-numbering/doc.json`, ["b-nwhy-human-1", "b-nwhy-agent-3"]);
splitBoldLeads(`${SEC}/50-in-code-docs/doc.json`, [
  "b-icd-header-3",
  "b-icd-docstring-4",
  "b-icd-comments-5",
  "b-icd-why-churn-19",
  "b-icd-why-flow-20",
]);

// -------------------------------------------------- 30-cross-doc-linking
{
  const path = `${SEC}/30-cross-doc-linking/doc.json`;
  const old = JSON.parse(readFileSync(path, "utf8"));
  const decision = old.blocks["b-xlink-decision-13"];
  if (!decision) {
    console.error("decision callout missing; aborting");
    process.exit(1);
  }

  const blocks: Record<string, unknown> = {};
  const add = (id: string, block: Record<string, unknown>) => {
    blocks[id] = { id, children: [], ...block };
    return id;
  };
  const children = [
    add("b-xl2-intro-1", {
      type: "paragraph",
      props: {},
      text: [
        t(
          "Docs link to docs with typed reference spans — tracked by the backlinks index, held at zero stale, rewritten when targets move — never with raw paths in prose. This page states the reference object, which directions links run, and the restraint rules against overlinking.",
        ),
      ],
    }),
    add("b-xl2-laidout-h-2", { type: "heading", props: { level: 2 }, text: [t("How it's laid out")] }),
    add("b-xl2-code-3", {
      type: "code",
      props: {
        language: "json",
        annotations: [
          {
            lines: "2",
            label: "The doc's name",
            note: "The span text inlines the target's name — it is the display on both surfaces; the object carries no label.",
          },
          {
            lines: "6",
            label: "The lookup key",
            note: "The docs path the backlinks index tracks; moving the target rewrites it here.",
          },
        ],
      },
      text: [
        t(
          '{\n  "insert": "structure",\n  "attributes": {\n    "reference": {\n      "kind": "doc",\n      "path": "10-system-design/10-doc-standards/10-structure"\n    }\n  }\n}',
        ),
      ],
    }),
    add("b-xl2-obj-4", {
      ...li("b-xl2-obj-4", [b("The object is the path")], ["b-xl2-obj-sub1-5", "b-xl2-obj-sub2-6"]),
    }),
    add("b-xl2-text-7", {
      ...li("b-xl2-text-7", [b("The text is the doc's name")], ["b-xl2-text-sub1-8"]),
    }),
    add("b-xl2-rule-h-9", { type: "heading", props: { level: 2 }, text: [t("The rule")] }),
    add("b-xl2-spans-10", {
      ...li("b-xl2-spans-10", [b("Reference spans, never raw paths")], ["b-xl2-spans-sub1-11"]),
    }),
    add("b-xl2-home-12", {
      ...li("b-xl2-home-12", [b("One canonical home")], ["b-xl2-home-sub1-13", "b-xl2-home-sub2-14"]),
    }),
    add("b-xl2-ancestors-15", {
      ...li("b-xl2-ancestors-15", [b("No ancestor links")], ["b-xl2-anc-sub1-16"]),
    }),
    add("b-xl2-claim-17", {
      ...li("b-xl2-claim-17", [b("A link is a claim")], [
        "b-xl2-claim-sub1-18",
        "b-xl2-claim-sub2-19",
        "b-xl2-claim-sub3-20",
      ]),
    }),
    add("b-xl2-deferral-21", {
      ...li("b-xl2-deferral-21", [b("No mutual deferral")], ["b-xl2-def-sub1-22", "b-xl2-def-sub2-23"]),
    }),
    "b-xlink-decision-13",
    add("b-xl2-why-h-24", { type: "heading", props: { level: 2 }, text: [t("Why")] }),
    add("b-xl2-why-rot-25", {
      ...li("b-xl2-why-rot-25", [b("Tracked links cannot rot")], ["b-xl2-rot-sub1-26"]),
    }),
    add("b-xl2-why-name-27", {
      ...li("b-xl2-why-name-27", [b("The name is the prose")], ["b-xl2-name-sub1-28"]),
    }),
    add("b-xl2-why-tree-29", {
      ...li("b-xl2-why-tree-29", [b("A tree for navigation, a web for substance")], ["b-xl2-tree-sub1-30"]),
    }),
    add("b-xl2-why-restraint-31", {
      ...li("b-xl2-why-restraint-31", [b("Restraint keeps links meaningful")], [
        "b-xl2-res-sub1-32",
        "b-xl2-res-sub2-33",
      ]),
    }),
    add("b-xl2-why-home-34", {
      ...li("b-xl2-why-home-34", [b("One home per concept")], ["b-xl2-home2-sub1-35"]),
    }),
  ];
  const subs: Array<[string, DeltaSpan[]]> = [
    ["b-xl2-obj-sub1-5", [c("kind"), t(": "), c('"doc"'), t(" plus the target's docs path — nothing else.")]],
    [
      "b-xl2-obj-sub2-6",
      [
        t("The backlinks index tracks every reference; "),
        c("docs links check"),
        t(" holds them at zero stale; moving a doc rewrites its inbound paths."),
      ],
    ],
    ["b-xl2-text-sub1-8", [t("The span text inlines the target's name, so a reference reads as prose on both surfaces.")]],
    ["b-xl2-spans-sub1-11", [t("A plain path in prose is invisible to the system and is not a link.")]],
    ["b-xl2-home-sub1-13", [t("Link to the concept's home doc, never into another section's internals.")]],
    ["b-xl2-home-sub2-14", [t("What crosses a boundary is referenced at the boundary.")]],
    ["b-xl2-anc-sub1-16", [t("The tree already provides them: parent docs link down, children do not link up.")]],
    ["b-xl2-claim-sub1-18", [t("It says the reader may need the target for the task at hand.")]],
    ["b-xl2-claim-sub2-19", [t("Link the first mention in a doc, not every mention.")]],
    ["b-xl2-claim-sub3-20", [t("Decorative links are cut.")]],
    ["b-xl2-def-sub1-22", [t("Two docs each pointing at the other for the full explanation means neither owns it.")]],
    ["b-xl2-def-sub2-23", [t("One doc owns the substance; the other references it.")]],
    ["b-xl2-rot-sub1-26", [t("A link the system tracks is held at zero stale, so a reader can trust every one they follow.")]],
    ["b-xl2-name-sub1-28", [t("A reference reads as the target's name mid-sentence — no bracket noise on either surface.")]],
    ["b-xl2-tree-sub1-30", [t("Parent docs stay the one place navigation happens, so moving through the docs feels the same everywhere.")]],
    ["b-xl2-res-sub1-32", [t("When every link is a claim of need, a reader can afford to follow them.")]],
    ["b-xl2-res-sub2-33", [t("Docs that link everything rank nothing.")]],
    ["b-xl2-home2-sub1-35", [t("Every link points at the concept's one home.")]],
  ];
  for (const [id, text] of subs) blocks[id] = li(id, text);
  blocks["b-xlink-decision-13"] = decision;
  const rootId = old.root;
  blocks[rootId] = { id: rootId, type: "paragraph", props: {}, children };
  land(path, {
    schemaVersion: 1,
    id: "10-system-design-10-doc-standards-30-cross-doc-linking",
    title: "Cross-doc linking",
    root: rootId,
    blocks,
  });
  console.log("rewrote 30-cross-doc-linking");
}

// ------------------------------------------------------- 40-code-linking
{
  const path = `${SEC}/40-code-linking/doc.json`;
  const blocks: Record<string, unknown> = {};
  const add = (id: string, block: Record<string, unknown>) => {
    blocks[id] = { id, children: [], ...block };
    return id;
  };
  const children = [
    add("b-cl2-intro-1", {
      type: "paragraph",
      props: {},
      text: [
        t(
          "Docs point at code with typed source references; code never points back. This page states the source-link object, how paths are written, and why the docs side pays all of the maintenance.",
        ),
      ],
    }),
    add("b-cl2-laidout-h-2", { type: "heading", props: { level: 2 }, text: [t("How it's laid out")] }),
    add("b-cl2-code-3", {
      type: "code",
      props: {
        language: "json",
        annotations: [
          {
            lines: "6",
            label: "A different object",
            note: "kind \"source\" targets a repo file — resolved against the filesystem, not the docs lookup a doc link uses.",
          },
          {
            lines: "7",
            label: "Full path, checkable",
            note: "Repo-relative from the root — docs links check verifies the file exists.",
          },
        ],
      },
      text: [
        t(
          '{\n  "insert": "packages/docs-viewer/src/render/doc-title.ts",\n  "attributes": {\n    "code": true,\n    "reference": {\n      "kind": "source",\n      "path": "packages/docs-viewer/src/render/doc-title.ts"\n    }\n  }\n}',
        ),
      ],
    }),
    add("b-cl2-obj-4", {
      ...li("b-cl2-obj-4", [b("A source link is its own object")], ["b-cl2-obj-sub1-5", "b-cl2-obj-sub2-6"]),
    }),
    add("b-cl2-rule-h-7", { type: "heading", props: { level: 2 }, text: [t("The rule")] }),
    add("b-cl2-oneway-8", {
      ...li("b-cl2-oneway-8", [b("One-way, doc to code")], ["b-cl2-ow-sub1-9"]),
    }),
    add("b-cl2-paths-10", {
      ...li("b-cl2-paths-10", [b("Full paths")], ["b-cl2-paths-sub1-11", "b-cl2-paths-sub2-12"]),
    }),
    add("b-cl2-inline-13", {
      ...li("b-cl2-inline-13", [b("Inline, with context")], ["b-cl2-inline-sub1-14"]),
    }),
    add("b-cl2-related-15", {
      ...li("b-cl2-related-15", [b("Related Files only at four plus")], ["b-cl2-rel-sub1-16"]),
    }),
    add("b-cl2-moves-17", {
      ...li("b-cl2-moves-17", [b("Code moves, docs update")], ["b-cl2-mv-sub1-18", "b-cl2-mv-sub2-19"]),
    }),
    add("b-cl2-incode-20", {
      type: "paragraph",
      props: {},
      text: [
        t("What the code itself carries — file headers, docstrings, inline comments — is "),
        ref("in-code docs", "10-system-design/10-doc-standards/50-in-code-docs"),
        t("'s subject."),
      ],
    }),
    add("b-cl2-why-h-21", { type: "heading", props: { level: 2 }, text: [t("Why")] }),
    add("b-cl2-why-bill-22", {
      ...li("b-cl2-why-bill-22", [b("The maintenance bill lands where it can be paid")], [
        "b-cl2-bill-sub1-23",
        "b-cl2-bill-sub2-24",
      ]),
    }),
    add("b-cl2-why-claim-25", {
      ...li("b-cl2-why-claim-25", [b("A full path is a checkable claim")], ["b-cl2-claim-sub1-26"]),
    }),
    add("b-cl2-why-inline-27", {
      ...li("b-cl2-why-inline-27", [b("Inline beats a link farm")], ["b-cl2-inl-sub1-28"]),
    }),
  ];
  const subs: Array<[string, DeltaSpan[]]> = [
    [
      "b-cl2-obj-sub1-5",
      [c("kind"), t(": "), c('"source"'), t(" with a repo-relative path — optionally a symbol and line.")],
    ],
    [
      "b-cl2-obj-sub2-6",
      [
        c("docs links check"),
        t(" verifies the target file exists; a doc link resolves through the docs lookup instead."),
      ],
    ],
    ["b-cl2-ow-sub1-9", [t("No doc links in code comments; the source stays ignorant of the docs.")]],
    [
      "b-cl2-paths-sub1-11",
      [c("src/auth/session/manager.ts"), t(" — never bare filenames, function names without paths, or vague pointers.")],
    ],
    ["b-cl2-paths-sub2-12", [t("The typed reference carries the path, so the claim is machine-checkable.")]],
    [
      "b-cl2-inline-sub1-14",
      [t("Introduce a path where the concept is discussed, with enough context to say why the file matters.")],
    ],
    [
      "b-cl2-rel-sub1-16",
      [t("A full-path list with one-line purposes, at the end, only when a doc references four or more files.")],
    ],
    ["b-cl2-mv-sub1-18", [t("When code moves or renames, the doc updates; "), c("docs links check"), t(" reports references whose target no longer exists.")]],
    ["b-cl2-mv-sub2-19", [t("No generated navigation scripts — list files and explain briefly.")]],
    ["b-cl2-bill-sub1-23", [t("Docs know about code, so a refactor ends with a docs pass.")]],
    ["b-cl2-bill-sub2-24", [t("The code never waits on one and never carries stale doc paths outward.")]],
    [
      "b-cl2-claim-sub1-26",
      [t("A bare filename is a vibe; a typed path is verified, and a reader opens it without a search.")],
    ],
    ["b-cl2-inl-sub1-28", [t("The reader arrives at the path with the question already framed.")]],
  ];
  for (const [id, text] of subs) blocks[id] = li(id, text);
  const rootId = "b-clink-root";
  blocks[rootId] = { id: rootId, type: "paragraph", props: {}, children };
  land(path, {
    schemaVersion: 1,
    id: "10-system-design-10-doc-standards-40-code-linking",
    title: "Code linking",
    root: rootId,
    blocks,
  });
  console.log("rewrote 40-code-linking");
}

console.log("link objects + bullets complete");
