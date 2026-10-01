import { useCallback, useEffect, useState } from "react";
import type { CodeTheme, CodeThemeListEntry } from "@codecaine-ai/docs-model/code-theme";

import {
  IS_STATIC,
  getActiveCodeTheme,
  getCodeThemes,
  importCodeThemeFromEditor,
  setActiveCodeTheme,
} from "../data/api";

/**
 * The machine's ACTIVE code theme plus the rail's picker state.
 *
 * Reads the active theme on mount and whenever the window regains focus (a
 * `docs code-theme use|import --use` from a terminal shows up on return).
 * Every failure is soft: `theme` stays null and code panes keep the
 * stylesheets' built-in tokens — a static export never even asks.
 */

export type CodeThemeStatus = { kind: "ok" | "error"; text: string };

export type CodeThemeControls = {
  themes: CodeThemeListEntry[];
  activeId: string | null;
  busy: boolean;
  status: CodeThemeStatus | null;
  onSelect: (id: string) => void;
  onImport: () => void;
};

const EDITOR_NAMES: Record<string, string> = { cursor: "Cursor", vscode: "VS Code", file: "file" };

/** Picker label: the editor's own theme name plus where it came from ("Default Dark+ (Cursor)"). */
export function codeThemeOptionLabel(entry: Pick<CodeThemeListEntry, "name" | "source">): string {
  const { source } = entry;
  if (source.editor === "builtin") return `${entry.name} (built-in)`;
  // A custom --name wins over the editor's settings label.
  const custom = source.label !== undefined && entry.name !== source.label;
  const label = custom ? entry.name : (source.settingsId ?? entry.name);
  return `${label} (${EDITOR_NAMES[source.editor] ?? source.editor})`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useCodeTheme(): { theme: CodeTheme | null; controls: CodeThemeControls } {
  const [theme, setTheme] = useState<CodeTheme | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [themes, setThemes] = useState<CodeThemeListEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<CodeThemeStatus | null>(null);

  const refresh = useCallback(async () => {
    if (IS_STATIC) return;
    const [active, list] = await Promise.allSettled([getActiveCodeTheme(), getCodeThemes()]);
    if (active.status === "fulfilled") {
      setTheme(active.value.codeTheme);
      setActiveId(active.value.id);
    }
    if (list.status === "fulfilled") setThemes(list.value.codeThemes);
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const onSelect = useCallback((id: string) => {
    setBusy(true);
    setStatus(null);
    void setActiveCodeTheme(id)
      .then((active) => {
        setTheme(active.codeTheme);
        setActiveId(active.id);
      })
      .catch((error) => setStatus({ kind: "error", text: errorText(error) }))
      .finally(() => setBusy(false));
  }, []);

  const onImport = useCallback(() => {
    setBusy(true);
    setStatus(null);
    void importCodeThemeFromEditor("auto")
      .then(async ({ codeTheme, warnings }) => {
        const active = await setActiveCodeTheme(codeTheme.id);
        setTheme(active.codeTheme);
        setActiveId(active.id);
        setStatus({
          kind: "ok",
          text: [`Imported ${codeThemeOptionLabel(codeTheme)}`, ...warnings].join(" — "),
        });
        const list = await getCodeThemes().catch(() => null);
        if (list) setThemes(list.codeThemes);
      })
      .catch((error) => setStatus({ kind: "error", text: errorText(error) }))
      .finally(() => setBusy(false));
  }, []);

  return { theme, controls: { themes, activeId, busy, status, onSelect, onImport } };
}
