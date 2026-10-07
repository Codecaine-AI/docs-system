import type { ReactNode } from "react";
import { ControlGroup } from "../ControlGroup";

export type SubgroupProps = { label: string; children: ReactNode };

export function Subgroup({ label, children }: SubgroupProps) {
  return (
    <section className="style-rail-subgroup">
      <h3 className="style-rail-section-label">{label}</h3>
      <ControlGroup>{children}</ControlGroup>
    </section>
  );
}
