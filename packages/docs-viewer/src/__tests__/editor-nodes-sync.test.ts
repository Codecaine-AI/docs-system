import { describe, expect, test } from "bun:test";
import * as canvasEditorNodes from "../components/canvas/editor-nodes";
import * as codeEditorNodes from "../components/code/editor-nodes";
import * as fileTreeEditorNodes from "../components/file-tree/editor-nodes";
import * as interactionSurfaceEditorNodes from "../components/interaction-surface/editor-nodes";
import * as mermaidEditorNodes from "../components/mermaid/editor-nodes";
import * as richTextEditorNodes from "../components/rich-text/editor-nodes";
import * as structuredTableEditorNodes from "../components/structured-table/editor-nodes";
import {
  BLOCK_TYPE_TO_NODE_TYPE,
  NODE_TYPE_TO_BLOCK_TYPE,
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
  test("the central node-type maps exactly match all per-component exports", () => {
    const componentNodes = componentNodeModules.flatMap((module) => Object.values(module));
    const componentNodeTypes = componentNodes.map((node) => node.name);

    expect(new Set(componentNodeTypes).size).toBe(componentNodeTypes.length);
    expect(Object.keys(NODE_TYPE_TO_BLOCK_TYPE).sort()).toEqual(
      [...componentNodeTypes].sort(),
    );
    expect(Object.keys(BLOCK_TYPE_TO_NODE_TYPE).sort()).toEqual(
      Object.values(NODE_TYPE_TO_BLOCK_TYPE).sort(),
    );

    for (const node of componentNodes) {
      const blockType = NODE_TYPE_TO_BLOCK_TYPE[node.name];
      expect(blockType).toBeDefined();
      expect(BLOCK_TYPE_TO_NODE_TYPE[blockType]).toBe(node.name);
    }
  });
});
