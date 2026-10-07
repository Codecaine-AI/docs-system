import type { ReactNode } from "react";
import { cn } from "@codecaine-ai/docs-viewer/ui/cn";

export type ControlGroupProps = { children: ReactNode; className?: string };

export function ControlGroup({ children, className }: ControlGroupProps) {
  return <div className={cn("style-rail-control-group", className)}>{children}</div>;
}
