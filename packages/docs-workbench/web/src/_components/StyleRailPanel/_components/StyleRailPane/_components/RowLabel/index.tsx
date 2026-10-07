import type { StyleRailLeafRef } from "../../../../overrides";
import { OverrideDot } from "./_components/OverrideDot";

export type RowLabelProps = { label: string; leaf?: StyleRailLeafRef };

export function RowLabel({ label, leaf }: RowLabelProps) {
  return (
    <span className="style-rail-row-label">
      <OverrideDot leaf={leaf} />
      <span>{label}</span>
    </span>
  );
}
