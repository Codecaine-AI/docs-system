"use client";

import type { ReactNode } from "react";

export type DocsMdxBlockRenderContext = {
  renderMarkdown: (markdown: string) => ReactNode;
  renderCanvas?: (input: {
    id: string;
    src: string;
    title?: string;
    sourceId?: string | null;
  }) => ReactNode;
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
  readonly patchOps: readonly string[] = [];

  abstract parse(input: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<TData> | null;

  abstract render(
    block: DocsMdxParsedBlock<TData>,
    ctx: DocsMdxBlockRenderContext,
  ): ReactNode;

  protected sourceId(attrs: Record<string, string>): string | null {
    return attrs.id?.trim() || null;
  }
}
