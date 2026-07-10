"use client";

import { Type } from "@sinclair/typebox";
import type { DocBlockType } from "../../doc-schema";
import type { BlockStateDefinition } from "../types";

export const ParagraphState = Type.Object({}, { additionalProperties: false });

export const HeadingState = Type.Object(
  {
    level: Type.Optional(Type.Integer({ minimum: 1, maximum: 6 })),
  },
  { additionalProperties: false },
);

export const ListItemState = Type.Object(
  {
    ordered: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const QuoteState = Type.Object({}, { additionalProperties: false });

export const CalloutState = Type.Object(
  {
    tone: Type.Optional(
      Type.Union([
        Type.Literal("info"),
        Type.Literal("decision"),
        Type.Literal("risk"),
        Type.Literal("warning"),
        Type.Literal("success"),
      ]),
    ),
    kind: Type.Optional(Type.String()),
    title: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const DividerState = Type.Object({}, { additionalProperties: false });

export const ImageState = Type.Object(
  {
    src: Type.String(),
    alt: Type.Optional(Type.String()),
    caption: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const VideoState = Type.Object(
  {
    src: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    title: Type.Optional(Type.String()),
    caption: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const RICH_TEXT_STATES: Partial<Record<DocBlockType, BlockStateDefinition>> = {
  paragraph: { schema: ParagraphState, carriesText: true },
  heading: { schema: HeadingState, carriesText: true },
  "list-item": { schema: ListItemState, carriesText: true },
  quote: { schema: QuoteState, carriesText: true },
  callout: { schema: CalloutState, carriesText: true },
  divider: { schema: DividerState, carriesText: false },
  image: { schema: ImageState, carriesText: false },
  video: { schema: VideoState, carriesText: false },
};
