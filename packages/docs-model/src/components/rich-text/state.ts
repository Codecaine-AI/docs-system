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
    // Task-list state: absent is an ordinary bullet, false an open task,
    // true a done task. Projects to `- [ ]` / `- [x]`.
    checked: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

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
    /** Visual style; renderers treat a missing variant as "eyebrow". */
    variant: Type.Optional(
      Type.Union([
        Type.Literal("eyebrow"),
        Type.Literal("hairline"),
        Type.Literal("rail"),
        Type.Literal("tab"),
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

export const ImageGridItemState = Type.Object({
  src: Type.String({ minLength: 1 }),
  heading: Type.Optional(Type.String()),
  alt: Type.Optional(Type.String()),
  caption: Type.Optional(Type.String()),
}, { additionalProperties: false });

export const ImageGridState = Type.Object({
  images: Type.Array(ImageGridItemState),
  columns: Type.Optional(Type.Union([Type.Literal("auto"), Type.Integer({ minimum: 1, maximum: 4 })])),
}, { additionalProperties: false });

export const VideoState = Type.Object(
  {
    src: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    title: Type.Optional(Type.String()),
    caption: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

/** Self-contained HTML only. Browser sandbox and CSP are enforced by the viewer. */
export const HtmlState = Type.Object({
  html: Type.String({ maxLength: 1048576 }),
  title: Type.String(),
  caption: Type.Optional(Type.String({ description: "Legacy metadata, retained for compatibility and not rendered. Put captions inside html." })),
  height: Type.Optional(Type.Integer({ minimum: 120, maximum: 2000 })),
  allowScripts: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

/** Default and bounds of an app embed's frame height, in px. */
export const APP_EMBED_DEFAULT_HEIGHT = 480;
export const APP_EMBED_MIN_HEIGHT = 240;
export const APP_EMBED_MAX_HEIGHT = 2000;

/**
 * A live app view that a codebase declares, run in a sandboxed iframe. The doc
 * stores only the reference: the host resolves it to a URL at render time, so a
 * doc carries no ports or hosts and renders a quiet unavailable state elsewhere.
 */
export const AppEmbedState = Type.Object({
  codebase: Type.Optional(Type.String({ description: "Codebase ent_ id. Omit for the codebase whose docs project holds this doc." })),
  app: Type.String({ description: "App id the codebase declares." }),
  view: Type.Optional(Type.String({ description: "View id inside the app." })),
  params: Type.Optional(Type.String({ description: "Extra query string for the view, without a leading '?'." })),
  title: Type.Optional(Type.String()),
  height: Type.Optional(Type.Integer({ minimum: APP_EMBED_MIN_HEIGHT, maximum: APP_EMBED_MAX_HEIGHT })),
  poster: Type.Optional(Type.String({ description: "Bundle image asset (./assets/images/...) shown before Start." })),
}, { additionalProperties: false });

export const RICH_TEXT_STATES: Partial<Record<DocBlockType, BlockStateDefinition>> = {
  paragraph: { schema: ParagraphState, carriesText: true },
  heading: { schema: HeadingState, carriesText: true },
  "list-item": { schema: ListItemState, carriesText: true },
  callout: { schema: CalloutState, carriesText: true },
  divider: { schema: DividerState, carriesText: false },
  image: { schema: ImageState, carriesText: false },
  "image-grid": { schema: ImageGridState, carriesText: false },
  video: { schema: VideoState, carriesText: false },
  html: { schema: HtmlState, carriesText: false },
  "app-embed": { schema: AppEmbedState, carriesText: false },
};
