"use client";

import { BlocksIcon, Code2Icon, WrenchIcon } from "lucide-react";
import { Badge } from "./ui/badge";
import { cn } from "./ui/cn";
import { docsMdxBlockRegistry } from "./docs-blocks/registry";

export interface DocsComponentGalleryProps {
  className?: string;
  showHeader?: boolean;
}

export default function DocsComponentGallery({
  className,
  showHeader = true,
}: DocsComponentGalleryProps) {
  const blocks = docsMdxBlockRegistry.describeForAgent();

  return (
    <div className={cn("space-y-3", className)}>
      {showHeader && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <BlocksIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Registered Blocks
            </span>
          </div>
          <Badge variant="outline">{blocks.length}</Badge>
        </div>
      )}

      <div className="space-y-2">
        {blocks.map((block) => (
          <section
            key={block.tag}
            className="rounded-md border bg-muted/20 p-3 text-xs"
          >
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary">{block.label}</Badge>
              <Badge variant="outline">{block.targetKind}</Badge>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <Code2Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <code className="truncate font-mono text-[11px] text-foreground">
                &lt;{block.tag}&gt;
              </code>
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {block.type}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {block.description}
            </p>
            <div className="mt-3">
              <div className="mb-1 flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-muted-foreground">
                <WrenchIcon className="h-3 w-3" />
                Patch Ops
              </div>
              <div className="flex flex-wrap gap-1">
                {block.patchOps.length > 0 ? (
                  block.patchOps.map((op) => (
                    <span
                      key={op}
                      className="rounded-sm border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                    >
                      {op}
                    </span>
                  ))
                ) : (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    none
                  </span>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
