import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { isGlobalThemeActive, projectStorage, setGlobalThemeActive, themeStorage } from "../data/project-storage";
import { GLOBAL_THEME_ID, getServeConfig } from "../data/api";
import { applyThemeCss, type ThemeDefinition } from "../theme/theme-folders";
import { setStyleRailBaseline, type StyleRailSettings } from "../shared/style-rail-settings";
import { loadStyleRailSettings } from "./style-rail-storage";
import { THEME_FOLDER_KEY, THEME_STORAGE_KEY } from "./constants";
import { resolveGlobalTheme, resolveThemeById, themeWritePayload } from "./theme-boot";

export type UseThemeFoldersProps = {
  isStatic: boolean;
  dark: boolean;
  setDark: Dispatch<SetStateAction<boolean>>;
  setStyleSettings: Dispatch<SetStateAction<StyleRailSettings>>;
};

export function useThemeFolders({ isStatic, dark, setDark, setStyleSettings }: UseThemeFoldersProps) {
  const [themeId, setThemeId] = useState<string>(() =>
    isGlobalThemeActive() ? GLOBAL_THEME_ID : projectStorage.getItem(THEME_FOLDER_KEY) ?? "default",
  );
  // `globalTheme` from GET /api/serve-config: the host serves one shared
  // theme (reserved id `global`, stored outside every repo) and EVERY project
  // renders it. A per-project THEME_FOLDER_KEY is ignored (not rewritten)
  // while it is on, so a host without it falls back to exactly today's pick.
  const [globalTheme, setGlobalTheme] = useState(false);
  // False only when the global theme read failed for a reason other than
  // "not created yet" — see resolveGlobalTheme.
  const [themeWritable, setThemeWritable] = useState(true);
  // Serve-level theme lock (`docs-cli serve --theme-locked`): null until
  // GET /api/serve-config answers. Secondary apps serving their docs with
  // this framework are theme CONSUMERS — the repo default theme is law, the
  // rail is hidden, and NOTHING persists (localStorage rail state or the
  // themes/default folder) while the answer is unknown or locked.
  const [themeLocked, setThemeLocked] = useState<boolean | null>(null);
  // Lock status and the active theme are two separate async reads. The rail
  // stays unavailable until both have settled so a fast unlocked-config
  // response cannot expose controls whose edits would be overwritten by the
  // still-pending authoritative theme response.
  const [themeReady, setThemeReady] = useState(false);
  // False until the active repo/export theme has been read. A localStorage
  // blob may paint the first frame, but it is only a cache: it must never get
  // a chance to write over the repo while the authoritative read is pending.
  const settingsSeededRef = useRef(false);
  const activeThemeRef = useRef<ThemeDefinition | null>(null);
  const lastPersistedThemeRef = useRef<string | null>(null);
  // Theme-folder boot, gated on the serve config so the locked/unlocked
  // branch is decided before any theme state applies.
  //
  // The first thing that happens either way is installing the resolved
  // theme's railDefaults as the rail BASELINE: from here on "default" means
  // the repo file, not the compiled-in stock constant. That single call is
  // what carries the repo's style settings to a locked serve, a static
  // export, and any browser that has never seen this rail.
  //
  // A repo/export theme with railDefaults is authoritative in both unlocked
  // and locked hosts. localStorage is used only when no repo-side settings
  // exist, which keeps it useful as an offline/first-frame cache without
  // making it a competing source of truth. Locked hosts always ignore it.
  useEffect(() => {
    void getServeConfig().then(({ themeLocked: serverLocked, globalTheme: useGlobal }) => {
      // A static export is a theme CONSUMER exactly like a locked serve:
      // the exported theme is law, and no reader-side state persists.
      const locked = isStatic || serverLocked;
      // Decide the cache scope FIRST so every read below (and every later
      // write) targets the shared keys when the global theme is on. A locked
      // host persists nothing, including this flag.
      setGlobalThemeActive(useGlobal, !locked);
      setGlobalTheme(useGlobal);
      setThemeLocked(locked);
      // Re-read the per-project pick rather than trusting the initial state:
      // the first frame may have guessed "global" from the last visit.
      const requestedThemeId = useGlobal
        ? GLOBAL_THEME_ID
        : locked
          ? "default"
          : projectStorage.getItem(THEME_FOLDER_KEY) ?? "default";
      const cachedDark = themeStorage.getItem(THEME_STORAGE_KEY) === "dark";
      const load = useGlobal
        ? resolveGlobalTheme()
        : resolveThemeById(requestedThemeId).then((theme) => ({ theme, writable: true }));
      void load.then(({ theme: resolved, writable }) => {
        applyThemeCss(resolved);
        activeThemeRef.current = resolved;
        setThemeWritable(writable);
        const persistedThemeId = resolved?.id ?? requestedThemeId;
        setThemeId(persistedThemeId);
        const baseline = setStyleRailBaseline(resolved?.manifest.railDefaults);
        const repoSettingsAreAuthoritative =
          resolved?.source === "repo" && resolved.manifest.railDefaults !== undefined;
        // Under the global theme the server copy is the ONLY authority (stock
        // until it exists): the shared cache just paints the first frame, and
        // a stale per-project cache is never even read.
        const nextSettings =
          locked || useGlobal || repoSettingsAreAuthoritative ? baseline : loadStyleRailSettings();
        // A static site never reads the origin's cache (GitHub Pages shares
        // one origin across every project site): the export decides.
        const nextDark = useGlobal || isStatic
          ? resolved?.manifest.dark ?? false
          : (locked || resolved?.source === "repo") && resolved?.manifest.dark !== undefined
            ? resolved.manifest.dark
            : cachedDark;
        lastPersistedThemeRef.current = JSON.stringify(
          themeWritePayload(nextSettings, nextDark, persistedThemeId, resolved ?? undefined),
        );
        settingsSeededRef.current = true;
        setStyleSettings(nextSettings);
        setDark(nextDark);
        setThemeReady(true);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot only; selection re-applies explicitly
  }, []);

  // Live inherit (locked serves only): the primary app auto-saves rail
  // tuning to themes/default, so tab-back is the natural "did it propagate"
  // moment — re-fetch and re-apply the theme on window focus rather than
  // demanding a reload. The in-flight ref keeps focus flapping from
  // stacking fetches whose out-of-order responses could apply stale theme.
  const inheritInFlightRef = useRef(false);
  useEffect(() => {
    // Static exports are immutable: nothing upstream can change to inherit.
    if (isStatic || themeLocked !== true) return;
    const lockedThemeId = globalTheme ? GLOBAL_THEME_ID : "default";
    const reapply = () => {
      if (inheritInFlightRef.current) return;
      inheritInFlightRef.current = true;
      const load = globalTheme
        ? resolveGlobalTheme().then(({ theme }) => theme)
        : resolveThemeById("default");
      void load
        .then((resolved) => {
          applyThemeCss(resolved);
          // Re-install the baseline too, not just the knobs: the repo file
          // is the authority on this serve, so "default" must track it.
          activeThemeRef.current = resolved;
          const nextSettings = setStyleRailBaseline(resolved?.manifest.railDefaults);
          const nextDark = resolved?.manifest.dark ?? dark;
          lastPersistedThemeRef.current = JSON.stringify(
            themeWritePayload(nextSettings, nextDark, lockedThemeId, resolved ?? undefined),
          );
          setStyleSettings(nextSettings);
          setDark(nextDark);
        })
        .finally(() => {
          inheritInFlightRef.current = false;
        });
    };
    window.addEventListener("focus", reapply);
    return () => window.removeEventListener("focus", reapply);
  }, [isStatic, themeLocked, globalTheme, dark]);

  const handleSelectTheme = (id: string) => {
    const load =
      id === GLOBAL_THEME_ID
        ? resolveGlobalTheme().then(({ theme, writable }) => {
            setThemeWritable(writable);
            return theme;
          })
        : resolveThemeById(id);
    void load.then((resolved) => {
      if (!resolved) return;
      applyThemeCss(resolved);
      activeThemeRef.current = resolved;
      // Selecting a theme rebases the rail on THAT theme's saved settings:
      // its railDefaults become both the running knobs and the baseline, so
      // the Reset button and the override dots follow the selection rather
      // than pointing back at the previous theme (or at stock).
      const nextSettings = setStyleRailBaseline(resolved.manifest.railDefaults);
      const nextDark = resolved.manifest.dark ?? dark;
      lastPersistedThemeRef.current = JSON.stringify(
        themeWritePayload(nextSettings, nextDark, resolved.id, resolved),
      );
      setStyleSettings(nextSettings);
      setDark(nextDark);
      setThemeId(id);
      // The global theme is chosen by the host, not remembered per project.
      if (id !== GLOBAL_THEME_ID) projectStorage.setItem(THEME_FOLDER_KEY, id);
    });
  };

  return { themeId, globalTheme, themeWritable, themeLocked, themeReady, settingsSeededRef, activeThemeRef, lastPersistedThemeRef, handleSelectTheme };
}
