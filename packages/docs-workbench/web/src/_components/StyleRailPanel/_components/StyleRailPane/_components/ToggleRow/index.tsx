import type { StyleRailLeafRef } from "../../../../overrides";
import { RowLabel } from "../RowLabel";

export type ToggleRowProps = {
  label: string;
  leaf?: StyleRailLeafRef;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function ToggleRow({
  label,
  leaf,
  checked,
  onChange,
}: ToggleRowProps) {
  return (
    <label className="flex min-h-8 items-center justify-between gap-3 text-ui-xs">
      <RowLabel label={label} leaf={leaf} />
      <input
        checked={checked}
        className="style-toggle"
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
    </label>
  );
}
