"use client";

import { Type } from "@sinclair/typebox";

export const MermaidState = Type.Object(
  {
    title: Type.Optional(Type.String()),
    // caption is read by the viewer, so it is declared in the schema.
    caption: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
