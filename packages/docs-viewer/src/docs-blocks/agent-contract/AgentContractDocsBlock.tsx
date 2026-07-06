"use client";

import { BotIcon, ShieldCheckIcon, WrenchIcon } from "lucide-react";
import { Badge } from "../../ui/badge";
import {
  DocsMdxBlock,
  type DocsMdxBlockRenderContext,
  type DocsMdxParsedBlock,
} from "../base";

type AgentContractData = {
  id: string;
  agent?: string;
  title?: string;
  tools?: string;
  approvals?: string;
  body: string;
};

export class AgentContractDocsBlock extends DocsMdxBlock<AgentContractData> {
  readonly tag = "AgentContract";
  readonly type = "agent-contract";
  readonly targetKind = "agent-contract";
  readonly label = "Agent Contract";
  readonly agentDescription =
    "A docs-native description of what an agent reads, writes, may call, and where approval gates apply.";
  override readonly patchOps = [
    "update-mdx-block-props",
    "update-mdx-block-body",
    "replace-mdx-block",
  ] as const;

  parse({
    attrs,
    body,
  }: {
    attrs: Record<string, string>;
    body: string;
    source: string;
  }): DocsMdxParsedBlock<AgentContractData> | null {
    const id = attrs.id?.trim();
    if (!id) return null;
    return {
      tag: this.tag,
      type: this.type,
      targetKind: this.targetKind,
      sourceId: id,
      data: {
        id,
        agent: attrs.agent?.trim() || undefined,
        title: attrs.title?.trim() || undefined,
        tools: attrs.tools?.trim() || undefined,
        approvals: attrs.approvals?.trim() || undefined,
        body: body.trim(),
      },
    };
  }

  render(
    block: DocsMdxParsedBlock<AgentContractData>,
    ctx: DocsMdxBlockRenderContext,
  ) {
    const { data } = block;
    return (
      <section
        className="not-prose my-4 rounded-md border border-primary/30 bg-primary/5 p-3"
        data-mdx-block={this.tag}
        data-docs-block-type={this.type}
        data-source-id={data.id}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <BotIcon className="h-4 w-4 text-muted-foreground" />
          <Badge variant="outline">agent</Badge>
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Agent Contract
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        </div>
        <h3 className="mb-2 font-display text-sm font-semibold text-foreground">
          {data.title ?? data.agent ?? data.id}
        </h3>
        <div className="mb-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          {data.agent && (
            <div className="rounded border bg-background/60 p-2">
              <div className="font-display text-[10px] uppercase tracking-wider">Agent</div>
              <div className="mt-1 font-mono">{data.agent}</div>
            </div>
          )}
          {data.tools && (
            <div className="rounded border bg-background/60 p-2">
              <div className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider">
                <WrenchIcon className="h-3 w-3" />
                Tools
              </div>
              <div className="mt-1 font-mono">{data.tools}</div>
            </div>
          )}
          {data.approvals && (
            <div className="rounded border bg-background/60 p-2 sm:col-span-2">
              <div className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider">
                <ShieldCheckIcon className="h-3 w-3" />
                Approval Gates
              </div>
              <div className="mt-1">{data.approvals}</div>
            </div>
          )}
        </div>
        {data.body && (
          <div className="spectre-markdown prose prose-sm dark:prose-invert max-w-none font-sans text-sm leading-[1.7]">
            {ctx.renderMarkdown(data.body)}
          </div>
        )}
      </section>
    );
  }
}
