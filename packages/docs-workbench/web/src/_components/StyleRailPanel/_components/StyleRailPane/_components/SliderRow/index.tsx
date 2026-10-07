import type { StyleRailLeafRef } from "../../../../overrides";
import { RowLabel } from "../RowLabel";

export type SliderRowProps = {
  label: string;
  leaf?: StyleRailLeafRef;
  value: number;
  min: number;
  max: number;
  step: number;
  valueLabel: string;
  onChange: (value: number) => void;
};

export function SliderRow({
  label,
  leaf,
  value,
  min,
  max,
  step,
  valueLabel,
  onChange,
}: SliderRowProps) {
  return (
    <label className="grid gap-1.5 text-ui-xs">
      <span className="flex items-center justify-between gap-3">
        <RowLabel label={label} leaf={leaf} />
        <span className="text-ui-2xs text-foreground">{valueLabel}</span>
      </span>
      <input
        className="style-range"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}
