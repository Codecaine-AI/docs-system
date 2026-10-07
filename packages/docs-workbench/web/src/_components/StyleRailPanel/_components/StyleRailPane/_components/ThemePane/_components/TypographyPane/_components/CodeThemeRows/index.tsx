import { cn } from "@codecaine-ai/docs-viewer/ui/cn";
import { codeThemeOptionLabel, type CodeThemeControls } from "../../../../../../../../../../shared/useCodeTheme";
import { RowLabel } from "../../../../../../_components/RowLabel";

export type CodeThemeRowsProps = { controls: CodeThemeControls };

export function CodeThemeRows({ controls }: CodeThemeRowsProps) {
  const { themes, activeId, busy, status, onSelect, onImport } = controls;
  if (themes.length === 0) return null;
  return (
    <>
      <label className="flex min-h-8 items-center justify-between gap-3 text-ui-xs">
        <RowLabel label="Code theme" />
        <select
          className="style-select"
          disabled={busy}
          onChange={(event) => onSelect(event.currentTarget.value)}
          value={activeId ?? ""}
        >
          {themes.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {codeThemeOptionLabel(entry)}
            </option>
          ))}
        </select>
      </label>
      <button
        className="style-rail-preset-button w-full border px-2 py-1.5 text-ui-xs text-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        disabled={busy}
        onClick={onImport}
        type="button"
      >
        {busy ? "Importing…" : "Import from editor"}
      </button>
      {status && (
        <p
          className={cn("text-ui-xs", status.kind === "error" ? "text-destructive" : "text-muted-foreground")}
          role={status.kind === "error" ? "alert" : "status"}
        >
          {status.text}
        </p>
      )}
    </>
  );
}
