/**
 * The host side of the `app-embed` block. The doc stores only a reference to
 * an app a codebase declares; the host (the docs app, a static-site editor,
 * the Knowledge System) turns it into a URL. No host, or a host that returns
 * null, renders the block's quiet "App not available here" state.
 */

/** The parts of an `app-embed` block's props that name the app view. */
export type AppEmbedRef = {
  /** Codebase ent_ id. Omitted: the codebase whose docs project holds the doc. */
  codebase?: string;
  /** App id the codebase declares. */
  app: string;
  /** View id inside the app. */
  view?: string;
  /** Extra query string, without a leading `?`. */
  params?: string;
};

/** Resolves app references for one render surface (`ctx.appEmbeds`, `DocEditor`'s and `mountDraftEditor`'s `appEmbeds`). */
export type AppEmbedHost = {
  /** The URL to load for `ref`, or null when this host cannot run it. Called during render: keep it cheap and synchronous. */
  resolve(ref: AppEmbedRef): { src: string } | null;
  /** Calls `onChange` when the app behind `ref` changes (a rebuild, a moved port). A live embed reloads; a stopped one ignores it. Returns the unsubscribe. */
  subscribe?(ref: AppEmbedRef, onChange: () => void): () => void;
};

type LiveEntry = { stop: () => void };

let liveEntry: LiveEntry | null = null;

/**
 * One live app embed per window. Claiming makes `stop`'s embed the live one
 * and stops the previous live embed; the returned release clears the claim
 * only if it is still the live one (a stopped or unmounted embed releases).
 */
export function claimLiveAppEmbed(stop: () => void): () => void {
  const entry: LiveEntry = { stop };
  const previous = liveEntry;
  liveEntry = entry;
  previous?.stop();
  return () => {
    if (liveEntry === entry) liveEntry = null;
  };
}
