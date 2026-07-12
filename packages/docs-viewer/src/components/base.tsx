"use client";

import type { ReactNode } from "react";

/**
 * Base shape of a docs-block component implementation. These originated in
 * the MDX-tag era (hence the parsed-block field names); today their only
 * consumer is block-registry.ts, which constructs a `DocsMdxParsedBlock`
 * from doc.json props + a delta->markdown body projection and delegates to
 * `render`. The MDX parsing side (tag registry, attr/body parsers) is gone.
 */

export type DocsMdxBlockRenderContext = {
  renderMarkdown: (markdown: string) => ReactNode;
};

export type DocsMdxParsedBlock<TData> = {
  tag: string;
  type: string;
  targetKind: string;
  sourceId: string | null;
  data: TData;
};

export abstract class DocsMdxBlock<TData> {
  abstract readonly tag: string;
  abstract readonly type: string;
  abstract readonly targetKind: string;
  abstract readonly label: string;
  abstract readonly agentDescription: string;

  abstract render(
    block: DocsMdxParsedBlock<TData>,
    ctx: DocsMdxBlockRenderContext,
  ): ReactNode;
}
