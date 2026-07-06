"use client";

import { AgentContractDocsBlock } from "./agent-contract/AgentContractDocsBlock";
import type { DocsMdxBlock, DocsMdxParsedBlock } from "./base";
import { CalloutDocsBlock } from "./callout/CalloutDocsBlock";
import { DecisionDocsBlock } from "./decision/DecisionDocsBlock";
import { diagramDocsBlocks } from "./diagram/DiagramDocsBlocks";
import { engineeringDocsBlocks } from "./engineering/EngineeringDocsBlocks";
import { FileTreeDocsBlock } from "./file-tree/FileTreeDocsBlock";
import { semanticDocsBlocks } from "./semantic/SemanticDocsBlocks";
import { supportDocsBlocks } from "./support/SupportDocsBlocks";
import { visualDocsBlocks } from "./visual/VisualDocsBlocks";

export type AnyDocsMdxParsedBlock = DocsMdxParsedBlock<unknown>;

export class DocsMdxBlockRegistry {
  private readonly blocks = new Map<string, DocsMdxBlock<any>>();

  register(block: DocsMdxBlock<any>): void {
    this.blocks.set(block.tag, block);
  }

  has(tag: string): boolean {
    return this.blocks.has(tag);
  }

  get(tag: string): DocsMdxBlock<any> | null {
    return this.blocks.get(tag) ?? null;
  }

  parse(input: {
    tag: string;
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): AnyDocsMdxParsedBlock | null {
    return this.get(input.tag)?.parse(input) ?? null;
  }

  describeForAgent() {
    return [...this.blocks.values()].map((block) => ({
      tag: block.tag,
      type: block.type,
      targetKind: block.targetKind,
      label: block.label,
      description: block.agentDescription,
      patchOps: block.patchOps,
    }));
  }
}

export const docsMdxBlockRegistry = new DocsMdxBlockRegistry();
docsMdxBlockRegistry.register(new DecisionDocsBlock());
docsMdxBlockRegistry.register(new CalloutDocsBlock());
docsMdxBlockRegistry.register(new AgentContractDocsBlock());
docsMdxBlockRegistry.register(new FileTreeDocsBlock());
for (const block of semanticDocsBlocks) {
  docsMdxBlockRegistry.register(block);
}
for (const block of supportDocsBlocks) {
  docsMdxBlockRegistry.register(block);
}
for (const block of engineeringDocsBlocks) {
  docsMdxBlockRegistry.register(block);
}
for (const block of diagramDocsBlocks) {
  docsMdxBlockRegistry.register(block);
}
for (const block of visualDocsBlocks) {
  docsMdxBlockRegistry.register(block);
}

export const DOCS_MDX_BLOCK_REGISTRY = {
  Decision: {
    tag: "Decision",
    type: "decision",
    targetKind: "decision",
  },
  Callout: {
    tag: "Callout",
    type: "callout",
    targetKind: "callout",
  },
  AgentContract: {
    tag: "AgentContract",
    type: "agent-contract",
    targetKind: "agent-contract",
  },
  FileTree: {
    tag: "FileTree",
    type: "file-tree",
    targetKind: "file-tree",
  },
  Constraint: {
    tag: "Constraint",
    type: "constraint",
    targetKind: "constraint",
  },
  Assumption: {
    tag: "Assumption",
    type: "assumption",
    targetKind: "assumption",
  },
  Risk: {
    tag: "Risk",
    type: "risk",
    targetKind: "risk",
  },
  OpenQuestion: {
    tag: "OpenQuestion",
    type: "open-question",
    targetKind: "open-question",
  },
  Status: {
    tag: "Status",
    type: "status",
    targetKind: "status",
  },
  Milestone: {
    tag: "Milestone",
    type: "milestone",
    targetKind: "milestone",
  },
  Checklist: {
    tag: "Checklist",
    type: "checklist",
    targetKind: "checklist",
  },
  StructuredTable: {
    tag: "StructuredTable",
    type: "structured-table",
    targetKind: "structured-table",
  },
  Tabs: {
    tag: "Tabs",
    type: "tabs",
    targetKind: "tabs",
  },
  Columns: {
    tag: "Columns",
    type: "columns",
    targetKind: "columns",
  },
  Code: {
    tag: "Code",
    type: "code",
    targetKind: "code",
  },
  ImplementationMap: {
    tag: "ImplementationMap",
    type: "implementation-map",
    targetKind: "implementation-map",
  },
  ApiEndpoint: {
    tag: "ApiEndpoint",
    type: "api-endpoint",
    targetKind: "api-endpoint",
  },
  ApiSurface: {
    tag: "ApiSurface",
    type: "api-surface",
    targetKind: "api-surface",
  },
  DataModel: {
    tag: "DataModel",
    type: "data-model",
    targetKind: "data-model",
  },
  Diff: {
    tag: "Diff",
    type: "diff",
    targetKind: "diff",
  },
  JsonExplorer: {
    tag: "JsonExplorer",
    type: "json-explorer",
    targetKind: "json-explorer",
  },
  AnnotatedCode: {
    tag: "AnnotatedCode",
    type: "annotated-code",
    targetKind: "annotated-code",
  },
  Diagram: {
    tag: "Diagram",
    type: "diagram",
    targetKind: "diagram",
  },
  Flow: {
    tag: "Flow",
    type: "flow",
    targetKind: "flow",
  },
  Mermaid: {
    tag: "Mermaid",
    type: "mermaid",
    targetKind: "mermaid",
  },
  Wireframe: {
    tag: "Wireframe",
    type: "wireframe",
    targetKind: "wireframe",
  },
  DesignBoard: {
    tag: "DesignBoard",
    type: "design-board",
    targetKind: "design-board",
  },
  Canvas: {
    tag: "Canvas",
    type: "canvas",
    targetKind: "canvas",
  },
  Artboard: {
    tag: "Artboard",
    type: "artboard",
    targetKind: "artboard",
  },
  Screen: {
    tag: "Screen",
    type: "screen",
    targetKind: "screen",
  },
  Prototype: {
    tag: "Prototype",
    type: "prototype",
    targetKind: "prototype",
  },
  PrototypeScreen: {
    tag: "PrototypeScreen",
    type: "prototype-screen",
    targetKind: "prototype-screen",
  },
  PrototypeTransition: {
    tag: "PrototypeTransition",
    type: "prototype-transition",
    targetKind: "prototype-transition",
  },
} as const;
