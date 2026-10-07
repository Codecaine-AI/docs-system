import { IS_STATIC, fetchJson } from "./http";

export type LabConfig = { kernelUrl: string; corpus: string };

export const DEFAULT_LAB_CONFIG: LabConfig = {
  kernelUrl: "http://127.0.0.1:4840",
  corpus: "docs-system",
};

// ---------------------------------------------------------------------------
// Reads (serve + static)
// ---------------------------------------------------------------------------

/**
 * Static exports have no config route (and no lab), so they never probe it;
 * on a live host every failure preserves localhost defaults.
 */
export async function fetchLabConfig(isStatic: boolean = IS_STATIC): Promise<LabConfig> {
  if (isStatic) return DEFAULT_LAB_CONFIG;
  try {
    return await fetchJson<LabConfig>(`api/lab-config`);
  } catch {
    return DEFAULT_LAB_CONFIG;
  }
}

/**
 * Public-site chrome for a static export: `data/site.json`, written by
 * `docs-cli export` (docs-workbench/src/export.ts) from `--repo-url` /
 * `--site-title` or the project config. Read at runtime so one SPA build
 * serves any corpus. A live workbench has no such file and gets `{}`; a
 * missing or malformed file degrades to `{}` as well, and a non-http(s)
 * `repoUrl` is dropped rather than rendered as a link.
 */
export type SiteConfig = { repoUrl?: string; title?: string };

export async function getSiteConfig(isStatic: boolean = IS_STATIC): Promise<SiteConfig> {
  if (!isStatic) return {};
  let raw: unknown;
  try {
    raw = await fetchJson<unknown>(`data/site.json`);
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object") return {};
  const { repoUrl, title } = raw as Record<string, unknown>;
  const config: SiteConfig = {};
  if (typeof repoUrl === "string" && /^https?:\/\//i.test(repoUrl)) config.repoUrl = repoUrl;
  if (typeof title === "string" && title.trim()) config.title = title.trim();
  return config;
}

// ---------------------------------------------------------------------------
// Serve config
// ---------------------------------------------------------------------------

/**
 * Workbench-level serve flags (see App's theme boot path). Fails OPEN to
 * unlocked and to NO global theme: static exports have no server, and an
 * older serve without the route (or without the field) must keep today's
 * behavior — only a serve that positively answers gets the locked or the
 * shared-global theme path.
 *
 * `globalTheme`: the host serves the reserved `global` theme (stored by the
 * central service outside any repo) and every project should render it.
 */
export type ServeConfig = { themeLocked: boolean; globalTheme: boolean };

export async function getServeConfig(): Promise<ServeConfig> {
  if (IS_STATIC) return { themeLocked: false, globalTheme: false };
  try {
    const config = await fetchJson<{ themeLocked?: unknown; globalTheme?: unknown }>(
      `api/serve-config`,
    );
    return { themeLocked: config.themeLocked === true, globalTheme: config.globalTheme === true };
  } catch {
    return { themeLocked: false, globalTheme: false };
  }
}

