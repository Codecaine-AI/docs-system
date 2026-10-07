import type { StyleRailLeafRef } from "../../../../overrides";
import { RowLabel } from "../RowLabel";

export type SelectRowProps <T extends string> = {
  label: string;
  leaf?: StyleRailLeafRef;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
};

export function SelectRow<T extends string>({
  label,
  leaf,
  value,
  options,
  onChange,
}: SelectRowProps<T>) {
  return (
    <label className="flex min-h-8 items-center justify-between gap-3 text-ui-xs">
      <RowLabel label={label} leaf={leaf} />
      <select
        className="style-select"
        onChange={(event) => onChange(event.currentTarget.value as T)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
