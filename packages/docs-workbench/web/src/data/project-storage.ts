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
