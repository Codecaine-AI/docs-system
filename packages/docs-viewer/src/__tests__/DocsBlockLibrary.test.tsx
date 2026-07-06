import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DocsBlockLibrary from "../DocsBlockLibrary";
import { DocsClientProvider, type CanvasEmbedProps } from "../client";

/**
 * The Canvas block's "Interactive Canvas Lab" preview renders through the
 * host-injected `CanvasEmbedComponent` slot (in Spectre this file asserted
 * the REAL InteractiveCanvasViewer's synthetic-canvas content; the viewer
 * package has no canvas dependency, so a recording fake stands in).
 */
function FakeCanvasEmbed(props: CanvasEmbedProps) {
  return <div data-testid="fake-canvas-embed">canvas embed: {props.id}</div>;
}

afterEach(() => {
  cleanup();
});

describe("DocsBlockLibrary", () => {
  it("renders live previews for the registered docs block types", () => {
    render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocsBlockLibrary />
      </DocsClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Block Library" })).toBeTruthy();
    [
      "Decision",
      "Callout",
      "Agent Contract",
      "File Tree",
      "Constraint",
      "Assumption",
      "Risk",
      "Open Question",
      "Status",
      "Milestone",
      "Checklist",
      "Structured Table",
      "Tabs",
      "Columns",
      "Code",
      "Implementation Map",
      "API Endpoint",
      "API Surface",
      "Data Model",
      "Diff",
      "JSON Explorer",
      "Annotated Code",
      "Diagram",
      "Flow",
      "Mermaid",
      "Wireframe",
      "Design Board",
      "Canvas",
      "Artboard",
      "Screen",
      "Prototype",
      "Prototype Screen",
      "Prototype Transition",
    ].forEach((label) => {
      expect(screen.getByRole("button", { name: `Select ${label}` })).toBeTruthy();
    });
    expect(screen.getByText("Default to MDX Lab")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Callout" }));
    expect(screen.getByText("Review Anchor")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Agent Contract" }));
    expect(screen.getAllByText("Docs Revisor").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Select File Tree" }));
    expect(screen.getByText("Docs Lab Files")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Constraint" }));
    expect(screen.getByText("Safe MDX")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Open Question" }));
    expect(screen.getByText("Canvas Targets")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Checklist" }));
    expect(screen.getByText("Review Checklist")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Structured Table" }));
    expect(screen.getByText("Block Status")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Tabs" }));
    expect(screen.getByText("Review Modes")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Columns" }));
    expect(screen.getByText("Review Loop")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Code" }));
    expect(screen.getByText("Typed API call shape")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Implementation Map" }));
    expect(screen.getByText("Docs Lab Implementation")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select API Endpoint" }));
    expect(screen.getByText("Apply a reviewed docs proposal")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select API Surface" }));
    expect(screen.getByText("Docs Lab API")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Data Model" }));
    expect(screen.getByText("Docs Lab Review State")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Diff" }));
    expect(screen.getByText("-The docs lab can request proposals.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select JSON Explorer" }));
    expect(screen.getByText("Docs Anchor Payload")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Annotated Code" }));
    expect(screen.getByText("Hash guard")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Diagram" }));
    expect(screen.getByText("Docs Review Lifecycle")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Flow" }));
    expect(screen.getByText("Docs Review Flow")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Mermaid" }));
    expect(screen.getByText("Proposal Sequence")).toBeTruthy();
    expect(screen.getByText("inert source")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Wireframe" }));
    expect(screen.getByText("Docs Review Workspace")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Design Board" }));
    expect(screen.getByText("Docs Lab Visual Review")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Canvas" }));
    expect(screen.getByText("Docs Lab Canvas")).toBeTruthy();
    expect(screen.getByText("Interactive Canvas Lab")).toBeTruthy();
    // The injected embed slot receives the synthetic fixture id.
    expect(screen.getByText("canvas embed: synthetic")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Artboard" }));
    expect(screen.getByText("Action Pane Artboard")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Screen" }));
    expect(screen.getByText("Proposal Review Screen")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Prototype" }));
    expect(screen.getByText("Docs Proposal Prototype")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Prototype Screen" }));
    expect(screen.getByText("Review Proposal")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Prototype Transition" }));
    expect(screen.getAllByText(/runtime navigation stays inside allowlisted screen ids/).length).toBeGreaterThan(0);
  });

  it("groups blocks, edits source live, and exposes preview targets", async () => {
    render(<DocsBlockLibrary />);

    expect(screen.getByRole("heading", { name: "Foundation" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Semantic" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Engineering" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Interactive" })).toBeTruthy();

    expect(screen.getByRole("tab", { name: /Preview/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Source/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mobile" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Source/ }));
    const editor = screen.getByLabelText("MDX source editor");
    fireEvent.change(editor, {
      target: {
        value: [
          '<Decision id="edited-decision" status="accepted" title="Edited Live">',
          "  Live source edits update the rendered preview.",
          "</Decision>",
        ].join("\n"),
      },
    });

    fireEvent.click(screen.getByRole("tab", { name: /Preview/ }));
    expect(screen.getByText("Edited Live")).toBeTruthy();
    expect(screen.getAllByText("edited-decision").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Select Design Board" }));
    expect(screen.getAllByText("Interactive").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Add artboard" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add artboard" }));
    expect(screen.getByText("New Artboard")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Lab Draft" },
    });
    expect(screen.getByText("Lab Draft")).toBeTruthy();
    expect((screen.getByLabelText("MDX source editor") as HTMLTextAreaElement).value).toContain(
      "Lab Draft",
    );

    fireEvent.click(screen.getByRole("tab", { name: /Source/ }));
    await waitFor(() => {
      expect(screen.getByText("docs-lab-design-board:browse")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("Filter blocks"), {
      target: { value: "prototype" },
    });
    expect(screen.getByRole("button", { name: "Select Prototype" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select Prototype Screen" })).toBeTruthy();
  });
});
