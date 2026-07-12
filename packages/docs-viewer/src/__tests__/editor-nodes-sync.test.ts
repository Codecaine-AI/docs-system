import { describe, expect, test } from "bun:test";
import * as canvasEditorNodes from "../components/canvas/editor-nodes";
import * as codeEditorNodes from "../components/code/editor-nodes";
import * as fileTreeEditorNodes from "../components/file-tree/editor-nodes";
import * as interactionSurfaceEditorNodes from "../components/interaction-surface/editor-nodes";
import * as mermaidEditorNodes from "../components/mermaid/editor-nodes";
import * as richTextEditorNodes from "../components/rich-text/editor-nodes";
import * as structuredTableEditorNodes from "../components/structured-table/editor-nodes";
import {
  ATOM_BLOCK_NODES,
  BLOCK_TYPE_TO_NODE_TYPE,
  NODE_TYPE_TO_BLOCK_TYPE,
  TEXT_BLOCK_NODES,
} from "../editor/core/schema";

const componentNodeModules = [
  richTextEditorNodes,
  codeEditorNodes,
  mermaidEditorNodes,
  fileTreeEditorNodes,
  structuredTableEditorNodes,
  interactionSurfaceEditorNodes,
  canvasEditorNodes,
];

describe("component editor nodes", () => {
  test("the schema node lists have exact membership and construction order", () => {
    expect(TEXT_BLOCK_NODES.map((node) => node.name)).toEqual([
      "docBlockText",
      "docParagraph",
      "docHeading",
      "docListItem",
      "docCodeBlock",
      "docQuote",
      "docCallout",
    ]);
    expect(ATOM_BLOCK_NODES.map((node) => node.name)).toEqual([
      "docDivider",
      "docImage",
      "docVideo",
      "docCanvas",
      "docFileTree",
      "docStructuredTable",
      "docInteractionSurface",
      "docMermaid",
    ]);
  });

  test("the central node-type maps exactly match all per-component exports", () => {
    const componentNodes = componentNodeModules.flatMap((module) => Object.values(module));
    const componentNodeTypes = componentNodes.map((node) => node.name);

    expect(new Set(componentNodeTypes).size).toBe(componentNodeTypes.length);
    expect(Object.keys(NODE_TYPE_TO_BLOCK_TYPE).sort()).toEqual(
      [...componentNodeTypes].sort(),
    );
    expect(BLOCK_TYPE_TO_NODE_TYPE).toEqual({
      paragraph: "docParagraph",
      heading: "docHeading",
      "list-item": "docListItem",
      code: "docCodeBlock",
      quote: "docQuote",
      callout: "docCallout",
      divider: "docDivider",
      image: "docImage",
      video: "docVideo",
      canvas: "docCanvas",
      "file-tree": "docFileTree",
      "structured-table": "docStructuredTable",
      "interaction-surface": "docInteractionSurface",
      mermaid: "docMermaid",
    });

    for (const node of componentNodes) {
      const blockType = NODE_TYPE_TO_BLOCK_TYPE[node.name];
      expect(blockType).toBeDefined();
      expect(BLOCK_TYPE_TO_NODE_TYPE[blockType]).toBe(node.name);
    }
  });
});
