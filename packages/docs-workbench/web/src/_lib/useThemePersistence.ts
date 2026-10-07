import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { CodeTheme } from "@codecaine-ai/docs-model/code-theme";
import { globalStorageKey, themeStorage } from "../data/project-storage";
import { GLOBAL_THEME_ID, saveTheme } from "../data/api";
import { normalizeSettings, setStyleRailBaseline, type StyleRailSettings } from "../shared/style-rail-settings";
import type { ThemePickerEntry } from "../_components/StyleRailPanel";
import { saveStyleRailSettings, STYLE_RAIL_STORAGE_KEY } from "./style-rail-storage";
import { applyBlockLayoutOverrideCss, applyStyleRailVars } from "./style-rail-apply";
import { THEME_STORAGE_KEY } from "./constants";
import { applyTheme, themeWritePayload } from "./theme-boot";
import { applyCodeThemeStyle } from "./code-theme-style";
import type { useThemeFolders } from "./useThemeFolders";

export type UseThemePersistenceProps = ReturnType<typeof useThemeFolders> & {
  isStatic: boolean;
  dark: boolean;
  setDark: Dispatch<SetStateAction<boolean>>;
  styleSettings: StyleRailSettings;
  setStyleSettings: Dispatch<SetStateAction<StyleRailSettings>>;
  codeTheme: CodeTheme | null;
};

export function useThemePersistence({
  isStatic, dark, setDark, styleSettings, setStyleSettings, codeTheme,
  themeId, globalTheme, themeWritable, themeLocked, themeReady,
  settingsSeededRef, activeThemeRef, lastPersistedThemeRef,
}: UseThemePersistenceProps) {
  // Every knob change updates the active theme: debounce-write the current
  // look (knobs + mode + component overrides as real token files) to the
  // repo's themes/<active-id> folder. localStorage still carries an instant
  // cache; the folder is the durable, committable record every consumer reads.
  //
  // `canAuthorTheme` is the ONE place that decides whether this host may
  // write the theme at all. A theme-locked serve is a CONSUMER of
  // themes/default, never an author — and until the serve config answers,
  // this serve must be ASSUMED locked (a write racing the config fetch
  // could clobber the primary theme with this origin's stale rail state).
  // The server independently refuses the POST with 403 when locked; this
  // flag just keeps a doomed request (and the Save button) off screen.
  const canAuthorTheme = !isStatic && themeReady && themeLocked === false && themeWritable;
  const themeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!canAuthorTheme) return;
    // Never write the theme folder before the boot seed has resolved — a
    // fresh browser would otherwise overwrite it with stock defaults.
    if (!settingsSeededRef.current) return;
    const payload = themeWritePayload(
      styleSettings,
      dark,
      themeId,
      activeThemeRef.current ?? undefined,
    );
    const signature = JSON.stringify(payload);
    // Theme boot/selection loaded this exact value from the repo. Do not
    // rewrite it merely because async initialization caused a React render.
    if (signature === lastPersistedThemeRef.current) return;
    if (themeSaveTimer.current !== null) clearTimeout(themeSaveTimer.current);
    themeSaveTimer.current = setTimeout(() => {
      themeSaveTimer.current = null;
      void saveTheme(payload)
        .then(() => {
          lastPersistedThemeRef.current = signature;
        })
        .catch(() => {
          // Offline/static hosts just keep the localStorage copy.
        });
    }, 1500);
    return () => {
      if (themeSaveTimer.current !== null) clearTimeout(themeSaveTimer.current);
    };
  }, [styleSettings, dark, themeId, canAuthorTheme]);

  // Bumped whenever the baseline changes without the knobs changing, purely
  // to re-render: the baseline lives in a module, so React has no other way
  // to learn that the override dots and the Reset target just moved.
  const [, setBaselineVersion] = useState(0);

  // Explicit "save to repo": skips the debounce, writes the active theme now,
  // and promotes what was written to the baseline so the rail immediately
  // reports zero overrides — the knobs and the committed file agree.
  const handleSaveStyleToRepo = () => {
    if (!canAuthorTheme) return;
    if (themeSaveTimer.current !== null) {
      clearTimeout(themeSaveTimer.current);
      themeSaveTimer.current = null;
    }
    const payload = themeWritePayload(
      styleSettings,
      dark,
      themeId,
      activeThemeRef.current ?? undefined,
    );
    void saveTheme(payload)
      .then(() => {
        lastPersistedThemeRef.current = JSON.stringify(payload);
        setStyleRailBaseline(payload.manifest.railDefaults);
        setBaselineVersion((version) => version + 1);
      })
      .catch(() => {
        // A refused write (403 on a locked serve, or an offline host) must
        // NOT move the baseline: the repo file is unchanged, so the knobs
        // stay reported as local overrides.
      });
  };

  // The picker shows ONE theme (Ford: still figuring the theme out —
  // nothing clickable that could wipe the working look): the shared Global
  // theme when the host serves it (or when a static export snapshotted it),
  // otherwise the repo's Default.
  const themePickerEntries: ThemePickerEntry[] = globalTheme || themeId === GLOBAL_THEME_ID
    ? [{ id: GLOBAL_THEME_ID, name: "Global", source: "global" }]
    : [{ id: "default", name: "Default", source: "builtin" }];

  // Other tabs (any project on this origin) changing the global theme write
  // the shared cache instantly; follow them without a reload. The incoming
  // value is recorded as already persisted so this tab does not echo the
  // other tab's debounced POST back to the server.
  const styleSettingsRef = useRef(styleSettings);
  styleSettingsRef.current = styleSettings;
  const darkRef = useRef(dark);
  darkRef.current = dark;
  useEffect(() => {
    if (!globalTheme || !themeReady || themeLocked !== false) return;
    const settingsKey = globalStorageKey(STYLE_RAIL_STORAGE_KEY);
    const darkKey = globalStorageKey(THEME_STORAGE_KEY);
    const onStorage = (event: StorageEvent) => {
      if (event.newValue === null) return;
      let nextSettings = styleSettingsRef.current;
      let nextDark = darkRef.current;
      if (event.key === settingsKey) {
        try {
          nextSettings = normalizeSettings(JSON.parse(event.newValue));
        } catch {
          return;
        }
      } else if (event.key === darkKey) {
        nextDark = event.newValue === "dark";
      } else {
        return;
      }
      lastPersistedThemeRef.current = JSON.stringify(
        themeWritePayload(nextSettings, nextDark, GLOBAL_THEME_ID, activeThemeRef.current ?? undefined),
      );
      setStyleSettings(nextSettings);
      setDark(nextDark);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [globalTheme, themeLocked, themeReady]);

  useEffect(() => {
    applyTheme(dark);
    if (!themeReady || themeLocked !== false) return;
    themeStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  }, [dark, themeLocked, themeReady]);

  useEffect(() => {
    applyStyleRailVars(styleSettings);
    // Per-block-type lane overrides ride alongside the custom properties.
    // They cannot BE custom properties — each one targets a different
    // `[data-doc-lane][data-doc-block-type]` pair — so they go out as real
    // rules in a managed <style> element. Applied in the same effect so the
    // two halves of the rail's output can never drift a frame apart.
    applyBlockLayoutOverrideCss(styleSettings);
    // Rail state never persists on a locked (or not-yet-resolved) serve:
    // the settings in play are the repo theme's, and echoing them into this
    // origin's localStorage would seed drift for any future unlocked run.
    if (!themeReady || themeLocked !== false) return;
    saveStyleRailSettings(styleSettings);
  }, [styleSettings, themeLocked, themeReady]);

  useEffect(() => {
    // The active code theme, scoped to code panes. It reads the rail's vars
    // so an explicit rail override of a code token keeps winning.
    applyCodeThemeStyle(codeTheme, styleSettings);
  }, [codeTheme, styleSettings]);

  return { canAuthorTheme, handleSaveStyleToRepo, themePickerEntries };
}
