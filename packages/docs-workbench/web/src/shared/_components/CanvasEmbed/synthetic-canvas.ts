"use client";

/**
 * Local port of the canvas package's old `syntheticInteractiveCanvas` fixture.
 *
 * The live @codecaine-ai/canvas package no longer ships fixtures (the vendored
 * submodule copy did), so the docs-workbench synthetic embed keeps its own
 * copy here, migrated to the live schema vocabulary:
 *  - `label`/`body` → the unified required `text` field
 *  - `container` → `section` (the only grouping object)
 *  - legacy `tone`/`paletteToken` style enums → dropped (color roster only)
 *  - expanded-vocabulary types (source-node/document/person/database/chat/
 *    annotation-marker) → nearest live types
 *  - `links` → dropped (gone from the live schema)
 *  - connection style "dotted" → "dashed" (live styles are solid|dashed)
 */
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas";

export const syntheticInteractiveCanvas: InteractiveCanvasDocument = {
  schemaVersion: 1,
  id: "synthetic",
  title: "Synthetic Interview Flow",
  mode: "diagram",
  size: { width: 1240, height: 760 },
  viewport: { x: 0, y: 0, zoom: 1 },
  objects: [
    {
      id: "interview-flow",
      type: "section",
      text: "Interview Flow",
      parentId: null,
      geometry: { x: 72, y: 64, width: 1008, height: 584 },
      layout: { mode: "free", padding: 32, gap: 32 },
    },
    {
      id: "input-context",
      type: "section",
      text: "Input Context",
      parentId: "interview-flow",
      geometry: { x: 112, y: 136, width: 240, height: 376 },
      layout: { mode: "column", padding: 24, gap: 18 },
    },
    {
      id: "user-brief",
      type: "process",
      text: "User brief",
      parentId: "input-context",
      geometry: { x: 144, y: 208, width: 176, height: 72 },
      style: { shape: "rounded-rect" },
    },
    {
      id: "current-docs",
      type: "process",
      text: "Current docs",
      parentId: "input-context",
      geometry: { x: 144, y: 320, width: 176, height: 72 },
      style: { shape: "rounded-rect" },
    },
    {
      id: "agent-summarizes",
      type: "process",
      text: "Agent summarizes",
      parentId: "interview-flow",
      geometry: { x: 440, y: 176, width: 192, height: 88 },
      style: { shape: "rounded-rect" },
    },
    {
      id: "needs-clarification",
      type: "decision",
      text: "Need clarification?",
      parentId: "interview-flow",
      geometry: { x: 704, y: 168, width: 176, height: 112 },
      style: { shape: "diamond" },
    },
    {
      id: "write-spec",
      type: "process",
      text: "Write spec",
      parentId: "interview-flow",
      geometry: { x: 928, y: 176, width: 160, height: 88 },
      style: { shape: "rounded-rect" },
    },
    {
      id: "ask-follow-up",
      type: "sticky",
      text: "Ask follow-up",
      parentId: "interview-flow",
      geometry: { x: 680, y: 376, width: 216, height: 128 },
    },
    {
      id: "spec-document",
      type: "rectangle",
      text: "Spec document",
      parentId: "interview-flow",
      geometry: { x: 896, y: 480, width: 160, height: 120 },
    },
    {
      id: "stakeholder",
      type: "ellipse",
      text: "Stakeholder",
      parentId: "input-context",
      geometry: { x: 144, y: 408, width: 120, height: 88 },
    },
    {
      id: "memory-store",
      type: "octagon",
      text: "Memory store",
      parentId: null,
      geometry: { x: 72, y: 664, width: 140, height: 120 },
    },
  ],
  connections: [
    {
      id: "brief-to-summary",
      from: { objectId: "user-brief", anchor: "right" },
      to: { objectId: "agent-summarizes", anchor: "left" },
      label: "prompt",
      style: "solid",
      arrow: "forward",
    },
    {
      id: "docs-to-summary",
      from: { objectId: "current-docs", anchor: "right" },
      to: { objectId: "agent-summarizes", anchor: "left" },
      label: "context",
      style: "dashed",
      arrow: "forward",
    },
    {
      id: "summary-to-decision",
      from: { objectId: "agent-summarizes", anchor: "right" },
      to: { objectId: "needs-clarification", anchor: "left" },
      style: "solid",
      arrow: "forward",
    },
    {
      id: "decision-to-spec",
      from: { objectId: "needs-clarification", anchor: "right" },
      to: { objectId: "write-spec", anchor: "left" },
      label: "no",
      style: "solid",
      arrow: "forward",
    },
    {
      id: "decision-to-follow-up",
      from: { objectId: "needs-clarification", anchor: "bottom" },
      to: { objectId: "ask-follow-up", anchor: "top" },
      label: "yes",
      style: "dashed",
      arrow: "forward",
    },
  ],
  annotations: [
    {
      id: "annotation-summary-review",
      target: { kind: "object", objectId: "agent-summarizes" },
      intent: "agent-request",
      body: "Tighten this step after the first full editor pass.",
      status: "open",
      createdBy: "human",
      replies: [],
    },
  ],
};
