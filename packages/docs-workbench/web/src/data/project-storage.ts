export function centralProjectId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.location.pathname.match(/^\/projects\/([^/]+)\/docs(?:\/|$)/)?.[1] ?? null;
}

export function projectStorageKey(key: string): string {
  const project = centralProjectId();
  return project ? `docs-project:${project}:${key}` : key;
}

/** Standalone origins retain their existing keys; central projects get separate caches. */
export const projectStorage = {
  getItem(key: string) { return window.localStorage.getItem(projectStorageKey(key)); },
  setItem(key: string, value: string) { window.localStorage.setItem(projectStorageKey(key), value); },
  removeItem(key: string) { window.localStorage.removeItem(projectStorageKey(key)); },
};

/**
 * Origin-wide keys for the shared GLOBAL theme. Every project on the central
 * service renders the same theme, so its instant cache (rail settings, light/
 * dark) must be one key for all of them. A per-project copy would go stale the
 * moment another project changed the theme and then override it on load.
 */
export function globalStorageKey(key: string): string {
  return `docs-global:${key}`;
}

export const globalStorage = {
  getItem(key: string) { return window.localStorage.getItem(globalStorageKey(key)); },
  setItem(key: string, value: string) { window.localStorage.setItem(globalStorageKey(key), value); },
  removeItem(key: string) { window.localStorage.removeItem(globalStorageKey(key)); },
};

/**
 * Remembers the last serve-config answer so the first frame (painted before
 * GET api/serve-config returns) reads the shared cache rather than a stale
 * per-project one.
 */
const GLOBAL_THEME_ACTIVE_KEY = globalStorageKey("theme-active");

let globalThemeActive: boolean | null = null;

export function isGlobalThemeActive(): boolean {
  if (globalThemeActive === null) {
    try {
      globalThemeActive = window.localStorage.getItem(GLOBAL_THEME_ACTIVE_KEY) === "true";
    } catch {
      globalThemeActive = false;
    }
  }
  return globalThemeActive;
}

/** Called once the serve config answers; `persist` is false on hosts that must not write storage. */
export function setGlobalThemeActive(active: boolean, persist = true): void {
  globalThemeActive = active;
  if (!persist) return;
  try {
    if (active) window.localStorage.setItem(GLOBAL_THEME_ACTIVE_KEY, "true");
    else window.localStorage.removeItem(GLOBAL_THEME_ACTIVE_KEY);
  } catch {
    // Session-only when storage is unavailable.
  }
}

/** Test hook: forget the in-memory answer so the next read re-checks storage. */
export function resetGlobalThemeActive(): void {
  globalThemeActive = null;
}

/**
 * Storage for the theme's instant cache: origin-wide while the global theme
 * is active, per-project otherwise (today's behavior).
 */
export const themeStorage = {
  getItem(key: string) {
    return (isGlobalThemeActive() ? globalStorage : projectStorage).getItem(key);
  },
  setItem(key: string, value: string) {
    (isGlobalThemeActive() ? globalStorage : projectStorage).setItem(key, value);
  },
  removeItem(key: string) {
    (isGlobalThemeActive() ? globalStorage : projectStorage).removeItem(key);
  },
};
