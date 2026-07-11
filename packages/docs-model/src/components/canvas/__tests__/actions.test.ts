"use client";

import { describe, expect, it } from "bun:test";
import { TypeGuard } from "@sinclair/typebox";

import { checkParams } from "../../define";
import { liftCanvasOperations } from "../actions/lift";

const ACTION_KEYS = [
  "canvas.addObject",
  "canvas.updateObject",
  "canvas.addConnection",
  "canvas.addAnnotation",
  "canvas.fitContainerToChildren",
] as const;

const PAYLOAD_PROPERTIES = ["object", "objectId", "connection", "annotation", "containerId"];

const VALID_ADD_OBJECT = {
  object: {
    id: "agent-draft",
    type: "process",
    label: "Draft response",
    geometry: { x: 440, y: 176, width: 192, height: 88 },
  },
};

describe("canvas actions", () => {
  it("lifts all operations in descriptor order as canvas forwards", () => {
    const actions = liftCanvasOperations();

    expect(actions).toHaveLength(5);
    expect(actions.map((action) => action.action)).toEqual([...ACTION_KEYS]);
    actions.forEach((action, index) => {
      expect(TypeGuard.IsObject(action.params)).toBe(true);
      expect(action.params.properties.type).toBeUndefined();
      expect(action.params.properties[PAYLOAD_PROPERTIES[index]]).toBeDefined();
      expect("forward" in action && action.forward.authority).toBe("canvas");
      expect("apply" in action).toBe(false);
    });
  });

  it("validates the lifted addObject payload with params paths", () => {
    const addObject = liftCanvasOperations()[0];

    expect(checkParams(addObject, VALID_ADD_OBJECT)).toEqual([]);
    const issues = checkParams(addObject, {
      object: { ...VALID_ADD_OBJECT.object, geometry: { x: 0, y: 0, width: 0, height: 88 } },
    });
    expect(issues.some((issue) => issue.path === "$.params.object.geometry.width")).toBe(true);
  });
});
