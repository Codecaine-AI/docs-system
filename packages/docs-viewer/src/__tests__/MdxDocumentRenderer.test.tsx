import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MdxDocumentRenderer, {
  DOCS_MDX_BLOCK_REGISTRY,
  docsMdxBlockRegistry,
} from "../MdxDocumentRenderer";

afterEach(() => {
  cleanup();
});

describe("MdxDocumentRenderer", () => {
  it("does not render leading document frontmatter", () => {
    render(
      <MdxDocumentRenderer
        content={["---", "format: mdx", "---", "", "# Vision"].join("\n")}
      />,
    );

    expect(screen.getByText("Vision")).toBeTruthy();
    expect(screen.queryByText("format: mdx")).toBeNull();
    expect(document.querySelector("hr")).toBeNull();
  });

  it("renders registered Decision blocks as inert components", () => {
    render(
      <MdxDocumentRenderer
        content={[
          "# Foundation",
          "",
          '<Decision id="docs-as-memory" status="accepted" title="Docs as memory">',
          "  Documentation preserves project context.",
          "</Decision>",
        ].join("\n")}
      />,
    );

    expect(screen.getByText("Decision")).toBeTruthy();
    expect(screen.getByText("accepted")).toBeTruthy();
    expect(screen.getByText("Docs as memory")).toBeTruthy();
    expect(screen.getByText("Documentation preserves project context.")).toBeTruthy();
    expect(DOCS_MDX_BLOCK_REGISTRY.Decision.targetKind).toBe("decision");
    expect(
      document.querySelector('[data-docs-block-type="decision"]'),
    ).toBeTruthy();
  });

  it("renders unknown MDX components as unsupported source blocks", () => {
    render(
      <MdxDocumentRenderer
        content={[
          "# Foundation",
          "",
          '<Widget id="not-registered">',
          "  should not execute",
          "</Widget>",
        ].join("\n")}
      />,
    );

    expect(screen.getByText("Unsupported MDX block: <Widget>")).toBeTruthy();
    expect(
      screen.getByText((_, element) =>
        element?.tagName === "PRE" &&
        (element.textContent?.includes('<Widget id="not-registered">') ?? false),
      ),
    ).toBeTruthy();
    expect(screen.queryByText("should not execute")).toBeNull();
  });

  it("routes sidecar Canvas blocks through the render context", () => {
    render(
      <MdxDocumentRenderer
        content={
          '<Canvas id="synthetic" title="Synthetic Canvas" src="./assets/canvases/synthetic.canvas.json" />'
        }
        renderCanvas={(canvas) => (
          <div data-testid="sidecar-canvas">
            {canvas.id}:{canvas.src}:{canvas.title}
          </div>
        )}
      />,
    );

    expect(screen.getByTestId("sidecar-canvas").textContent).toContain(
      "synthetic:./assets/canvases/synthetic.canvas.json:Synthetic Canvas",
    );
  });

  it("keeps sidecar Canvas inert when no loader context exists", () => {
    render(
      <MdxDocumentRenderer
        content={
          '<Canvas id="synthetic" src="./assets/canvases/synthetic.canvas.json" />'
        }
      />,
    );

    expect(screen.getByText("Canvas sidecar: ./assets/canvases/synthetic.canvas.json")).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="canvas"]')).toBeTruthy();
  });

  it("renders starter docs block slices through the registry", () => {
    render(
      <MdxDocumentRenderer
        content={[
          '<Callout id="risk-1" tone="risk" title="Watch this">',
          "  This needs careful review.",
          "</Callout>",
          "",
          '<AgentContract id="docs-revisor" agent="Docs Revisor" tools="docs.proposePatch" approvals="Human approval required">',
          "  Reads queued annotations and proposes staged MDX edits.",
          "</AgentContract>",
          "",
          '<FileTree id="docs-files" title="Docs Lab Files">',
          "- [modified] apps/frontend/src/components/docs/MdxDocumentRenderer.tsx :: registry renderer",
          "- apps/data-backend/src/index.ts :: docs action ledger",
          "</FileTree>",
        ].join("\n")}
      />,
    );

    expect(screen.getByText("Callout")).toBeTruthy();
    expect(screen.getByText("Watch this")).toBeTruthy();
    expect(screen.getByText("Agent Contract")).toBeTruthy();
    expect(screen.getAllByText("Docs Revisor").length).toBeGreaterThan(0);
    expect(screen.getByText("File Tree")).toBeTruthy();
    expect(screen.getByText("registry renderer")).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="callout"]')).toBeTruthy();
    expect(
      document.querySelector('[data-docs-block-type="agent-contract"]'),
    ).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="file-tree"]')).toBeTruthy();
  });

  it("renders semantic docs block families through the registry", () => {
    render(
      <MdxDocumentRenderer
        content={[
          '<Constraint id="safe-mdx" severity="hard" owner="docs-lab" title="Safe MDX">',
          "  Only allowlisted blocks render.",
          "</Constraint>",
          "",
          '<Assumption id="real-docs" confidence="high" title="Real docs first">',
          "  The existing docs corpus reveals useful block shapes.",
          "</Assumption>",
          "",
          '<Risk id="unsafe-html" severity="critical" mitigation="unsupported fallback">',
          "  Raw HTML must not execute from docs content.",
          "</Risk>",
          "",
          '<OpenQuestion id="canvas-targets" status="open" owner="frontend">',
          "  Which canvas subtargets should be addressable first?",
          "</OpenQuestion>",
          "",
          '<Status id="lab-status" state="in-progress" updated="2026-06-24">',
          "  The docs lab is expanding in vertical slices.",
          "</Status>",
          "",
          '<Milestone id="semantic-slice" state="done" date="2026-06-24">',
          "  Semantic block registry coverage is in place.",
          "</Milestone>",
        ].join("\n")}
      />,
    );

    expect(screen.getByText("Safe MDX")).toBeTruthy();
    expect(screen.getByText("Real docs first")).toBeTruthy();
    expect(screen.getByText("unsupported fallback")).toBeTruthy();
    expect(screen.getByText("Which canvas subtargets should be addressable first?")).toBeTruthy();
    expect(screen.getByText("The docs lab is expanding in vertical slices.")).toBeTruthy();
    expect(screen.getByText("Semantic block registry coverage is in place.")).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="constraint"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="assumption"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="risk"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="open-question"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="status"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="milestone"]')).toBeTruthy();
  });

  it("renders document support block families through the registry", () => {
    render(
      <MdxDocumentRenderer
        content={[
          '<Checklist id="review-checklist" title="Review Checklist">',
          "- [x] Queue annotation :: saved as docs action",
          "- [ ] Run manual QA",
          "</Checklist>",
          "",
          '<StructuredTable id="block-status" title="Block Status" density="compact">',
          "| Block | Status |",
          "| --- | --- |",
          "| Checklist | implemented |",
          "| Canvas | planned |",
          "</StructuredTable>",
          "",
          '<Tabs id="review-tabs" title="Review Tabs">',
          "--- Source ---",
          "Inspect the source diff.",
          "",
          "--- Preview ---",
          "Inspect the rendered preview.",
          "</Tabs>",
          "",
          '<Columns id="review-columns" title="Review Columns" columns="2">',
          "--- Human ---",
          "Adds anchored feedback.",
          "",
          "--- Agent ---",
          "Proposes reviewable edits.",
          "</Columns>",
          "",
          '<Code id="proposal-client" filename="projects-api.ts" language="ts" caption="Typed call">',
          "export const proposalStatus = 'pending';",
          "</Code>",
        ].join("\n")}
      />,
    );

    expect(screen.getByText("Review Checklist")).toBeTruthy();
    expect(screen.getByText("Run manual QA")).toBeTruthy();
    expect(screen.getByText("Block Status")).toBeTruthy();
    expect(screen.getAllByText("Checklist").length).toBeGreaterThan(0);
    expect(screen.getByText("Review Tabs")).toBeTruthy();
    expect(screen.getByText("Inspect the source diff.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByText("Inspect the rendered preview.")).toBeTruthy();
    expect(screen.getByText("Review Columns")).toBeTruthy();
    expect(screen.getByText("Adds anchored feedback.")).toBeTruthy();
    expect(
      screen.getByText((_, element) =>
        element?.tagName === "CODE" &&
        (element.textContent?.includes("proposalStatus") ?? false),
      ),
    ).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="checklist"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="structured-table"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="tabs"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="columns"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="code"]')).toBeTruthy();
  });

  it("renders engineering docs block families through the registry", () => {
    render(
      <MdxDocumentRenderer
        content={[
          '<ImplementationMap id="implementation-map" title="Engineering Slice">',
          "- [modified] apps/data-backend/src/index.ts (ts) :: proposal lifecycle routes",
          "- [added] apps/frontend/src/components/docs/docs-blocks/engineering/EngineeringDocsBlocks.tsx (tsx) :: engineering renderers",
          "</ImplementationMap>",
          "",
          '<ApiEndpoint id="apply-proposal" method="POST" path="/projects/:id/docs/proposals/:proposalId/apply" summary="Apply proposal" auth="project access">',
          "Applies a docs proposal when hashes still match.",
          "- param path proposalId string required :: Proposal id",
          "- response 409 :: Stale proposal conflict",
          "</ApiEndpoint>",
          "",
          '<ApiSurface id="docs-api" title="Docs API">',
          "- GET /projects/:id/docs/tree :: Load tree",
          "- POST /projects/:id/docs/propose-edit :: Request proposal",
          "</ApiSurface>",
          "",
          '<DataModel id="docs-model" title="Docs Model">',
          "--- DocsAnnotation ---",
          "- id: string pk :: Stable annotation id",
          "- status: queued|resolved :: Lifecycle state",
          "",
          "--- DocsEditProposal ---",
          "- proposal_id: string pk :: Stable proposal id",
          "- original_hash: string :: Stale-write guard",
          "</DataModel>",
          "",
          '<Diff id="proposal-diff" filename="docs/example.mdx" language="mdx">',
          "--- before ---",
          "Old docs sentence.",
          "--- after ---",
          "New docs sentence.",
          "</Diff>",
          "",
          '<JsonExplorer id="anchor-json" title="Anchor JSON">',
          "{",
          '  "target_kind": "block",',
          '  "target": { "block_type": "api-endpoint" }',
          "}",
          "</JsonExplorer>",
          "",
          '<AnnotatedCode id="annotated-client" filename="projects-api.ts" language="ts">',
          "--- code ---",
          "export const status = 'pending';",
          "--- annotations ---",
          "- 1 | Status :: Proposal state starts pending.",
          "</AnnotatedCode>",
        ].join("\n")}
      />,
    );

    expect(screen.getByText("Engineering Slice")).toBeTruthy();
    expect(screen.getByText("proposal lifecycle routes")).toBeTruthy();
    expect(screen.getByText("Apply proposal")).toBeTruthy();
    expect(screen.getByText("Stale proposal conflict")).toBeTruthy();
    expect(screen.getByText("Docs API")).toBeTruthy();
    expect(screen.getByText("DocsAnnotation")).toBeTruthy();
    expect(screen.getByText("-Old docs sentence.")).toBeTruthy();
    expect(screen.getByText("+New docs sentence.")).toBeTruthy();
    expect(screen.getByText("Anchor JSON")).toBeTruthy();
    expect(screen.getByText("Object(2)")).toBeTruthy();
    expect(screen.getByText("Proposal state starts pending.")).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="implementation-map"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="api-endpoint"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="api-surface"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="data-model"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="diff"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="json-explorer"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="annotated-code"]')).toBeTruthy();
  });

  it("renders diagram docs block families safely through the registry", () => {
    render(
      <MdxDocumentRenderer
        content={[
          '<Diagram id="review-diagram" title="Review Diagram">',
          "--- nodes ---",
          "- cue | Anchored Cue :: Exact rendered target",
          "- proposal | Proposal :: Diff and preview",
          "--- edges ---",
          "- cue -> proposal :: request edit",
          "--- notes ---",
          "- Source remains reviewable.",
          "</Diagram>",
          "",
          '<Flow id="review-flow" title="Review Flow">',
          "- [done] Select target :: Choose rendered context",
          "- [current] Queue annotation :: Preserve source context",
          "- [queued] Apply or reject :: Land the reviewed edit",
          "</Flow>",
          "",
          '<Mermaid id="proposal-sequence" title="Proposal Sequence" diagramType="sequenceDiagram">',
          "sequenceDiagram",
          "  Reviewer->>DocsLab: Queue cue",
          "  <script>alert('nope')</script>",
          "</Mermaid>",
        ].join("\n")}
      />,
    );

    expect(screen.getByText("Review Diagram")).toBeTruthy();
    expect(screen.getByText("Anchored Cue")).toBeTruthy();
    expect(screen.getByText("request edit")).toBeTruthy();
    expect(screen.getByText("Source remains reviewable.")).toBeTruthy();
    expect(screen.getByText("Review Flow")).toBeTruthy();
    expect(screen.getByText("Queue annotation")).toBeTruthy();
    expect(screen.getByText("Proposal Sequence")).toBeTruthy();
    expect(screen.getByText("inert source")).toBeTruthy();
    expect(
      screen.getByText((_, element) =>
        element?.tagName === "CODE" &&
        (element.textContent?.includes("<script>alert('nope')</script>") ?? false),
      ),
    ).toBeTruthy();
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector('[data-docs-block-type="diagram"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="flow"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="mermaid"]')).toBeTruthy();
  });

  it("renders visual surface docs block families with targetable subregions", () => {
    render(
      <MdxDocumentRenderer
        content={[
          '<Wireframe id="review-wireframe" title="Review Workspace" surface="desktop">',
          "--- regions ---",
          "- tree | Docs tree | nav @ 4,8 20x84 :: Project docs",
          "- actions | Action pane | panel @ 76,8 20x84 :: Queue and proposal",
          "</Wireframe>",
          "",
          '<DesignBoard id="review-board" title="Visual Board" mode="design">',
          "--- artboards ---",
          "- browse | Browse Docs | desktop @ 5,14 28x34 :: Navigate docs",
          "- review | Review Proposal | desktop @ 70,14 25x38 :: Apply or reject",
          "--- connectors ---",
          "- browse -> review :: request proposal",
          "</DesignBoard>",
          "",
          '<Canvas id="review-canvas" title="Review Canvas">',
          "--- artboards ---",
          "- viewer | Viewer | desktop @ 8,16 32x36 :: Rendered MDX",
          "- pane | Action Pane | panel @ 54,18 28x34 :: Proposal controls",
          "--- flow ---",
          "- viewer -> pane :: queue action",
          "</Canvas>",
          "",
          '<Artboard id="action-artboard" title="Action Pane" surface="panel">',
          "--- regions ---",
          "- queue | Queue | list @ 8,32 84x30 :: Pending annotations",
          "</Artboard>",
          "",
          '<Screen id="proposal-screen" title="Proposal Screen" surface="desktop">',
          "--- regions ---",
          "- diff | Source Diff | content @ 6,10 42x78 :: Review changes",
          "</Screen>",
          "",
          '<Prototype id="proposal-prototype" title="Proposal Prototype" initial="browse" surface="desktop">',
          "--- screens ---",
          "- browse | Browse Docs @ 6,12 28x72 :: User opens a doc",
          "- review | Review Proposal @ 70,12 24x72 :: User applies or rejects",
          "--- transitions ---",
          "- browse -> review :: request proposal",
          "</Prototype>",
          "",
          '<PrototypeScreen id="review-prototype-screen" title="Review Screen" surface="desktop">',
          "--- regions ---",
          "- preview | Rendered Preview | content @ 52,22 42x68 :: Safe output",
          "</PrototypeScreen>",
          "",
          '<PrototypeTransition id="to-review" from="browse" to="review" label="Request Proposal" trigger="click Request proposal">',
          "Transition metadata only.",
          "</PrototypeTransition>",
        ].join("\n")}
      />,
    );

    expect(screen.getByText("Review Workspace")).toBeTruthy();
    expect(screen.getByText("Visual Board")).toBeTruthy();
    expect(screen.getByText("Review Canvas")).toBeTruthy();
    expect(screen.getAllByText("Action Pane").length).toBeGreaterThan(0);
    expect(screen.getByText("Proposal Screen")).toBeTruthy();
    expect(screen.getByText("Proposal Prototype")).toBeTruthy();
    expect(screen.getByText("Review Screen")).toBeTruthy();
    expect(screen.getByText("Request Proposal")).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="wireframe"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="design-board"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="canvas"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="artboard"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="screen"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="prototype"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="prototype-screen"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="prototype-transition"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-target-type="wireframe-region"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-target-type="artboard"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-target-type="prototype-screen"]')).toBeTruthy();
  });

  it("exposes registered block metadata for agent vocabulary", () => {
    expect(docsMdxBlockRegistry.describeForAgent()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tag: "Decision",
          type: "decision",
          targetKind: "decision",
        }),
        expect.objectContaining({
          tag: "AgentContract",
          type: "agent-contract",
        }),
        expect.objectContaining({
          tag: "FileTree",
          type: "file-tree",
        }),
        expect.objectContaining({
          tag: "Constraint",
          type: "constraint",
        }),
        expect.objectContaining({
          tag: "OpenQuestion",
          type: "open-question",
        }),
        expect.objectContaining({
          tag: "Checklist",
          type: "checklist",
        }),
        expect.objectContaining({
          tag: "StructuredTable",
          type: "structured-table",
        }),
        expect.objectContaining({
          tag: "Tabs",
          type: "tabs",
        }),
        expect.objectContaining({
          tag: "Columns",
          type: "columns",
        }),
        expect.objectContaining({
          tag: "Code",
          type: "code",
        }),
        expect.objectContaining({
          tag: "ImplementationMap",
          type: "implementation-map",
        }),
        expect.objectContaining({
          tag: "ApiEndpoint",
          type: "api-endpoint",
        }),
        expect.objectContaining({
          tag: "ApiSurface",
          type: "api-surface",
        }),
        expect.objectContaining({
          tag: "DataModel",
          type: "data-model",
        }),
        expect.objectContaining({
          tag: "Diff",
          type: "diff",
        }),
        expect.objectContaining({
          tag: "JsonExplorer",
          type: "json-explorer",
        }),
        expect.objectContaining({
          tag: "AnnotatedCode",
          type: "annotated-code",
        }),
        expect.objectContaining({
          tag: "Diagram",
          type: "diagram",
        }),
        expect.objectContaining({
          tag: "Flow",
          type: "flow",
        }),
        expect.objectContaining({
          tag: "Mermaid",
          type: "mermaid",
        }),
        expect.objectContaining({
          tag: "Wireframe",
          type: "wireframe",
        }),
        expect.objectContaining({
          tag: "DesignBoard",
          type: "design-board",
        }),
        expect.objectContaining({
          tag: "Canvas",
          type: "canvas",
        }),
        expect.objectContaining({
          tag: "Artboard",
          type: "artboard",
        }),
        expect.objectContaining({
          tag: "Screen",
          type: "screen",
        }),
        expect.objectContaining({
          tag: "Prototype",
          type: "prototype",
        }),
        expect.objectContaining({
          tag: "PrototypeScreen",
          type: "prototype-screen",
        }),
        expect.objectContaining({
          tag: "PrototypeTransition",
          type: "prototype-transition",
        }),
      ]),
    );
    expect(DOCS_MDX_BLOCK_REGISTRY.Milestone.targetKind).toBe("milestone");
    expect(DOCS_MDX_BLOCK_REGISTRY.Checklist.targetKind).toBe("checklist");
    expect(DOCS_MDX_BLOCK_REGISTRY.Code.targetKind).toBe("code");
    expect(DOCS_MDX_BLOCK_REGISTRY.ApiEndpoint.targetKind).toBe("api-endpoint");
    expect(DOCS_MDX_BLOCK_REGISTRY.AnnotatedCode.targetKind).toBe("annotated-code");
    expect(DOCS_MDX_BLOCK_REGISTRY.Diagram.targetKind).toBe("diagram");
    expect(DOCS_MDX_BLOCK_REGISTRY.Flow.targetKind).toBe("flow");
    expect(DOCS_MDX_BLOCK_REGISTRY.Mermaid.targetKind).toBe("mermaid");
    expect(DOCS_MDX_BLOCK_REGISTRY.Wireframe.targetKind).toBe("wireframe");
    expect(DOCS_MDX_BLOCK_REGISTRY.DesignBoard.targetKind).toBe("design-board");
    expect(DOCS_MDX_BLOCK_REGISTRY.Prototype.targetKind).toBe("prototype");
  });
});
