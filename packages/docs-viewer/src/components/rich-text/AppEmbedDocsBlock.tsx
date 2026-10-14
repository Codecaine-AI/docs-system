"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MonitorPlayIcon, PlayIcon, SquareArrowOutUpRightIcon, SquareIcon } from "lucide-react";
import {
  APP_EMBED_DEFAULT_HEIGHT,
  APP_EMBED_MAX_HEIGHT,
  APP_EMBED_MIN_HEIGHT,
} from "@codecaine-ai/docs-model";
import { claimLiveAppEmbed, type AppEmbedHost, type AppEmbedRef } from "./app-embed-host";
import {
  MEDIA_FOCUS_RING,
  MEDIA_GHOST_BUTTON,
  MEDIA_HEAD_CLASSES,
  MEDIA_HEAD_TEXT,
  MEDIA_PANEL_CLASS,
  MEDIA_PANEL_FILL,
  MEDIA_PRIMARY_BUTTON,
  MediaHeadContent,
} from "./media-panel";

export const APP_EMBED_LABEL = "App";

export const APP_EMBED_AGENT_DESCRIPTION =
  "A live view of an app a codebase declares, rendered from typed props: { codebase?: string; app: string; view?: string; params?: string; title?: string; height?: number; poster?: string }. `app` is the app id the codebase declares, `view` a view id inside it, `params` an extra query string without a leading '?'. `codebase` is a Codebase ent_ id; omit it for the codebase whose docs project holds this doc. The doc stores no URL: the host resolves the reference when the page renders. Before the reader presses Start the panel shows `poster` (a bundle image asset such as \"./assets/images/app.png\") or a plain placeholder, with the title, the view, and one Start button stacked near the top of the panel (on a readable card over the poster). Start loads the app in a sandboxed iframe (scripts, pointer lock, and downloads; no same-origin access), `height` px tall (240 to 2000, default 480), with Stop and Open in new window controls. One app runs per window: starting one stops the other. A host that cannot run the app shows a quiet \"App not available here\" note with the title, app, and view.";

/**
 * The app-embed panel reuses the media panel (media-panel.tsx): tile, title and
 * a mono app/view note in the head, the poster or the live app in the body.
 * The body keeps the frame height before and after Start, so starting an app
 * does not move the page. Class strings are shared by both surfaces, since the
 * editor's atom node view renders this component.
 */
const APP_EMBED_FIGURE_CLASSES = `not-prose my-6 min-w-0 rounded-[var(--radius,2px)] border border-[color:var(--docs-rule,#e6e5e3)] ${MEDIA_PANEL_CLASS} ${MEDIA_PANEL_FILL}`;
const APP_EMBED_BUTTON_CLASSES = `${MEDIA_GHOST_BUTTON} ${MEDIA_FOCUS_RING} no-underline`;
const APP_EMBED_BODY_CLASSES = "relative w-full overflow-hidden bg-[var(--docs-page,#fdfdfd)]";
const APP_EMBED_POSTER_CLASSES = "block h-full w-full object-cover";
/*
 * Before Start the body keeps the frame's full height (starting moves nothing
 * on the page), but the title, view and Start sit near its top: the layer
 * places the group one large section gap (--ds-space-12) below the head,
 * centred across. A tall embed whose foot is below the fold still shows its
 * Start. Start is the panel's one primary control; the head carries no Start.
 *
 * Over a poster the same group sits at the same place on a page-fill card, so
 * the text stays readable on any image. Without a poster the group keeps the
 * card's padding and a transparent border, so Start lands at the same offset.
 */
const APP_EMBED_START_LAYER_CLASSES =
  "absolute inset-0 flex flex-col items-center justify-start px-[var(--ds-space-3)] pt-[var(--ds-space-12)]";
const APP_EMBED_START_GROUP_CLASSES =
  "flex max-w-full flex-col items-center gap-[var(--ds-space-1)] rounded-[var(--radius,var(--ds-radius-base))] border px-[var(--ds-space-4)] py-[var(--ds-space-3)] text-center text-[length:var(--ds-font-size-ui-md)] text-[color:var(--docs-muted,var(--ds-color-text-muted))]";
const APP_EMBED_START_GROUP_PLAIN_CLASSES = `${APP_EMBED_START_GROUP_CLASSES} border-transparent`;
const APP_EMBED_START_GROUP_CARD_CLASSES = `${APP_EMBED_START_GROUP_CLASSES} border-[color:var(--docs-rule,var(--ds-color-border-default))] bg-[var(--docs-page,var(--ds-color-surface-page))]`;
const APP_EMBED_START_TITLE_CLASSES = "font-semibold text-[color:var(--docs-ink,var(--ds-color-text-ink))] wrap-anywhere";
const APP_EMBED_START_VIEW_CLASSES = "font-mono text-[length:var(--ds-font-size-ui-xs)] wrap-anywhere";
const APP_EMBED_START_BUTTON_ROW_CLASSES = "mt-[var(--ds-space-2)]";
const APP_EMBED_START_CLASSES = `${MEDIA_PRIMARY_BUTTON} ${MEDIA_FOCUS_RING}`;
const APP_EMBED_FRAME_CLASSES = "block h-full w-full border-0 bg-[var(--docs-page,#fdfdfd)]";
const APP_EMBED_UNAVAILABLE_CLASSES =
  "not-prose my-6 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[var(--radius,2px)] border border-dashed border-[color:var(--docs-rule,#e6e5e3)] p-3 text-[length:var(--ds-font-size-ui-md)] text-[color:var(--docs-muted,#666562)]";
const APP_EMBED_UNAVAILABLE_TITLE_CLASSES = "font-semibold text-[color:var(--docs-text,#2a2a2a)] wrap-anywhere";
const APP_EMBED_UNAVAILABLE_REF_CLASSES = "font-mono text-[length:var(--ds-font-size-ui-xs)] wrap-anywhere";

/** The sandbox an app runs in: its own scripts and input, never the page's origin. */
export const APP_EMBED_SANDBOX = "allow-scripts allow-pointer-lock allow-downloads";
export const APP_EMBED_ALLOW = "fullscreen; autoplay";

export function clampAppEmbedHeight(height: number | undefined): number {
  if (typeof height !== "number" || !Number.isFinite(height)) return APP_EMBED_DEFAULT_HEIGHT;
  return Math.min(APP_EMBED_MAX_HEIGHT, Math.max(APP_EMBED_MIN_HEIGHT, Math.round(height)));
}

/** `app · view`, the mono reference note in the head and the unavailable state. */
function appEmbedRefLabel(app: string, view: string | undefined): string {
  return [app, view].filter(Boolean).join(" · ");
}

export type AppEmbedBlockProps = {
  id: string;
  codebase?: string;
  app: string;
  view?: string;
  params?: string;
  title?: string;
  height?: number;
  /** The poster as the host resolved it (a fetchable URL). */
  poster?: string;
  host?: AppEmbedHost;
};

/** A live session: the src the iframe loaded at Start, and the current src after reloads (the Open link follows it). */
type Session = { initialSrc: string; src: string };

/**
 * App embed block: the host resolves the reference; the reader presses Start
 * to run the app in a sandboxed iframe. Only one embed is live per window
 * (claimLiveAppEmbed). While live, the host's `subscribe` change reloads the
 * frame by setting its src again.
 */
export function AppEmbedBlock({ id, codebase, app, view, params, title, height, poster, host }: AppEmbedBlockProps) {
  const ref = useMemo<AppEmbedRef>(
    () => ({
      app,
      ...(codebase ? { codebase } : {}),
      ...(view ? { view } : {}),
      ...(params ? { params } : {}),
    }),
    [codebase, app, view, params],
  );
  const resolved = useMemo(() => (app && host ? host.resolve(ref) : null), [app, host, ref]);
  const [session, setSession] = useState<Session | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const live = session !== null;
  const frameHeight = clampAppEmbedHeight(height);
  const label = title ?? APP_EMBED_LABEL;
  const refLabel = appEmbedRefLabel(app, view);

  // The live embed holds the window's one claim; starting another embed stops this one.
  useEffect(() => {
    if (!live) return;
    return claimLiveAppEmbed(() => setSession(null));
  }, [live]);

  // Only a live embed listens: a change re-resolves and sets the frame's src again, which reloads it.
  useEffect(() => {
    if (!live || !host?.subscribe) return;
    return host.subscribe(ref, () => {
      const next = host.resolve(ref);
      if (!next) {
        setSession(null);
        return;
      }
      if (frameRef.current) frameRef.current.src = next.src;
      setSession((current) => (current ? { ...current, src: next.src } : current));
    });
  }, [live, host, ref]);

  // A stopped embed with nothing to run shows the quiet unavailable note.
  if (!resolved && !live) {
    return (
      <div className={APP_EMBED_UNAVAILABLE_CLASSES} data-docs-block-type="app-embed" data-source-id={id} data-app-embed-state="unavailable">
        <span className={APP_EMBED_UNAVAILABLE_TITLE_CLASSES}>App not available here</span>
        {title && <span className="wrap-anywhere">{title}</span>}
        {refLabel && <span className={APP_EMBED_UNAVAILABLE_REF_CLASSES}>{refLabel}</span>}
      </div>
    );
  }

  const startButton = (
    <button
      type="button"
      className={APP_EMBED_START_CLASSES}
      aria-label={`Start ${label}`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={() => {
        // Resolve again: the app may have moved since this panel rendered.
        const start = host?.resolve(ref);
        if (start) setSession({ initialSrc: start.src, src: start.src });
      }}
    >
      <PlayIcon size={14} strokeWidth={2} aria-hidden />
      Start
    </button>
  );

  return (
    <figure className={APP_EMBED_FIGURE_CLASSES} data-docs-block-type="app-embed" data-source-id={id} data-app-embed-state={live ? "live" : "idle"}>
      <div className={`${MEDIA_HEAD_CLASSES} ${MEDIA_HEAD_TEXT}`}>
        <MediaHeadContent icon={MonitorPlayIcon} title={label} meta={refLabel || undefined}>
          {session && (
            <>
              <a
                href={session.src}
                target="_blank"
                rel="noopener noreferrer"
                className={APP_EMBED_BUTTON_CLASSES}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <SquareArrowOutUpRightIcon size={12} strokeWidth={2} aria-hidden />
                Open in new window
              </a>
              <button type="button" className={APP_EMBED_BUTTON_CLASSES} onClick={() => setSession(null)}>
                <SquareIcon size={12} strokeWidth={2} aria-hidden />
                Stop
              </button>
            </>
          )}
        </MediaHeadContent>
      </div>
      <div className={APP_EMBED_BODY_CLASSES} style={{ height: frameHeight }}>
        {session ? (
          <iframe
            ref={frameRef}
            src={session.initialSrc}
            title={label}
            sandbox={APP_EMBED_SANDBOX}
            allow={APP_EMBED_ALLOW}
            loading="lazy"
            className={APP_EMBED_FRAME_CLASSES}
            data-app-embed-frame=""
          />
        ) : (
          <>
            {poster && <img src={poster} alt="" className={APP_EMBED_POSTER_CLASSES} loading="lazy" decoding="async" />}
            <div className={APP_EMBED_START_LAYER_CLASSES}>
              <div className={poster ? APP_EMBED_START_GROUP_CARD_CLASSES : APP_EMBED_START_GROUP_PLAIN_CLASSES}>
                <span className={APP_EMBED_START_TITLE_CLASSES}>{label}</span>
                {view && <span className={APP_EMBED_START_VIEW_CLASSES}>{view}</span>}
                <div className={APP_EMBED_START_BUTTON_ROW_CLASSES}>{startButton}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </figure>
  );
}
