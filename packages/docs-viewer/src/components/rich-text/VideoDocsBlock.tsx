"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FilmIcon, PlayIcon } from "lucide-react";
import {
  MEDIA_GHOST_BUTTON,
  MEDIA_HEAD_CLASSES,
  MEDIA_HEAD_TEXT,
  MEDIA_PANEL_CLASS,
  MEDIA_PANEL_FILL,
  MediaHeadContent,
  assetFileName,
} from "./media-panel";

export const VIDEO_LABEL = "Video";

export const VIDEO_AGENT_DESCRIPTION =
  "An embedded video, rendered from typed props: { src?: string; url?: string; title?: string; caption?: string }. `src` is a bundle-relative video asset (e.g. \"./assets/videos/demo.mp4\", played through a native <video controls> element via the host's asset resolver); `url` is an external video URL and WINS when both are set. The block renders as a titled panel: `title` (default \"Video\") heads it beside the provider, host, or file name. A url renders a link card (caption, the URL, and a Watch button) that opens the video in a new tab; for YouTube (youtube.com/watch?v=, youtu.be/, /shorts/), Vimeo, and Loom urls, Watch in the interactive app swaps the card for a privacy-friendly player iframe (youtube-nocookie.com/embed, player.vimeo.com/video, loom.com/embed), so nothing third-party loads until the reader asks. Any other url is never iframed. A src video shows its caption below the panel. Neither src nor url renders a missing-source placeholder.";

export type VideoEmbedProvider = "youtube" | "vimeo" | "loom";

export type VideoEmbed = {
  provider: VideoEmbedProvider;
  embedUrl: string;
};

/** YouTube video ids are 11 chars today; stay a little lenient, never empty. */
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{6,}$/;
const LOOM_ID_PATTERN = /^[A-Za-z0-9]+$/;

/**
 * Parses a known video provider URL into its privacy-friendly embed form
 * (D30-adjacent: external media never proxies through the bundle). Returns
 * null for anything unrecognized — the caller renders a neutral link card
 * instead of iframing an arbitrary origin.
 *
 * Recognized forms:
 * - YouTube: `youtube.com/watch?v={id}`, `youtu.be/{id}`,
 *   `youtube.com/shorts/{id}` (plus `/embed/{id}`, `/live/{id}` and any
 *   `*.youtube.com` subdomain) -> `https://www.youtube-nocookie.com/embed/{id}`
 * - Vimeo: `vimeo.com/{numericId}` (and `player.vimeo.com/video/{numericId}`)
 *   -> `https://player.vimeo.com/video/{numericId}`
 * - Loom: `loom.com/share/{id}` (and `loom.com/embed/{id}`)
 *   -> `https://www.loom.com/embed/{id}`
 */
export function parseVideoEmbed(rawUrl: string): VideoEmbed | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const id = segments[0];
    if (id && YOUTUBE_ID_PATTERN.test(id)) {
      return { provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
    }
    return null;
  }

  if (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtube-nocookie.com"
  ) {
    let id: string | null = null;
    if (segments[0] === "watch") {
      id = parsed.searchParams.get("v");
    } else if (
      (segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live") &&
      segments.length > 1
    ) {
      id = segments[1];
    }
    if (id && YOUTUBE_ID_PATTERN.test(id)) {
      return { provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
    }
    return null;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    // Covers vimeo.com/{id} and player.vimeo.com/video/{id}; channel/group
    // path prefixes fall through to the first purely numeric segment.
    const id = segments.find((segment) => /^\d+$/.test(segment));
    if (id) return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
    return null;
  }

  if (host === "loom.com" || host.endsWith(".loom.com")) {
    const [kind, id] = segments;
    if ((kind === "share" || kind === "embed") && id && LOOM_ID_PATTERN.test(id)) {
      return { provider: "loom", embedUrl: `https://www.loom.com/embed/${id}` };
    }
    return null;
  }

  return null;
}

/** Mono meta for the panel head: the provider, a host for any other url, the file name for src. */
function videoMeta(url: string | undefined, embed: VideoEmbed | null, src: string | undefined) {
  if (embed) return embed.provider;
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return undefined;
    }
  }
  return src ? assetFileName(src) : undefined;
}

/** The URL as shown on the card: no scheme, no `www.` (the `title` keeps the full URL). */
const displayUrl = (url: string) => url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");

/*
 * The video is one media panel (media-panel.tsx): text-family tile, title and
 * mono provider / host / file name in the head. Class strings are shared by
 * both surfaces, since the editor's atom node view renders this component.
 * Every video knob keeps its LIGHT default as the literal fallback: `border` /
 * `borderWidth` / `radius` draw the panel frame, `margin` the block, and the
 * caption knobs set the caption line below the panel (a native player, or a
 * provider player once it is loaded). The link card's caption reads the size
 * knob but the body text role, like the rest of the card.
 */
const VIDEO_FIGURE_CLASSES =
  "not-prose my-[var(--docs-video-margin,24px)] max-w-[var(--style-content-width,60ch)]";
const VIDEO_PANEL_CLASSES = `${MEDIA_PANEL_CLASS} ${MEDIA_PANEL_FILL} rounded-[var(--docs-video-radius,var(--radius,2px))] border-[length:var(--docs-video-border-width,1px)] border-[color:var(--docs-video-border,#e6e5e3)]`;
const VIDEO_CAPTION_CLASSES =
  "mt-[var(--docs-video-caption-gap,8px)] text-[length:var(--docs-video-caption-text-size,13.5px)] leading-normal text-[color:var(--docs-video-caption-fg,#666562)] [text-wrap:pretty]";
/* Link card: caption over the mono URL, Watch on the right. It fills the
 * panel body, which clips overflow, so its focus ring is drawn inside. */
const VIDEO_CARD_CLASSES =
  "group flex items-center gap-4 p-3 text-inherit no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-[color:var(--docs-focus-ring,#0078df)]";
const VIDEO_CARD_CAPTION_CLASSES =
  "text-[length:var(--docs-video-caption-text-size,13.5px)] leading-normal text-[color:var(--docs-text,#2a2a2a)] [text-wrap:pretty]";
const VIDEO_CARD_URL_CLASSES =
  "truncate font-mono text-[12px] leading-[1.4] text-[color:var(--docs-link,#245a81)] underline-offset-2 group-hover:underline";
const VIDEO_WATCH_CLASSES = `${MEDIA_GHOST_BUTTON} group-hover:bg-[var(--docs-hover,#ebebea)] group-hover:text-[color:var(--docs-ink,#1f1f1f)]`;
const VIDEO_MISSING_CLASSES =
  "rounded-[var(--radius,2px)] border border-dashed border-[color:var(--docs-rule,#e6e5e3)] p-3 text-[13.5px] text-[color:var(--docs-muted,#666562)]";

/**
 * Video block: one media panel. `url` (external) wins over `src` (bundle
 * asset). A url renders a link card (caption, mono URL, Watch) that opens the
 * video in a new tab — all a static page ever needs. For a KNOWN provider the
 * interactive app enhances the card: Watch swaps the body for the
 * privacy-friendly player iframe, so nothing third-party loads until asked.
 * An unknown url is never iframed. A bare `src` plays through a native
 * `<video>` element using the host-resolved `resolvedSrc` when present.
 */
export function VideoBlock({
  id,
  src,
  resolvedSrc,
  url,
  title,
  caption,
}: {
  id: string;
  src?: string;
  resolvedSrc?: string;
  url?: string;
  title?: string;
  caption?: string;
}) {
  const embed = url ? parseVideoEmbed(url) : null;
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    // The card the reader activated is gone; hand focus to the player.
    if (playing) playerRef.current?.focus();
  }, [playing]);

  if (!url && !src) {
    return (
      <figure className={VIDEO_FIGURE_CLASSES} data-docs-block-type="video" data-source-id={id}>
        <div className={VIDEO_MISSING_CLASSES}>Video block is missing a src or url.</div>
      </figure>
    );
  }

  let body: ReactNode;
  let captionBelow = caption;
  if (url && embed && playing) {
    body = (
      <div className="aspect-video w-full">
        <iframe
          ref={playerRef}
          src={embed.embedUrl}
          title={title ?? `${VIDEO_LABEL}: ${url}`}
          className="block h-full w-full border-0"
          allow="fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          // "origin" (not "no-referrer") is deliberate: it still hides the
          // doc's path/query from the provider, but keeps the bare Referer
          // header YouTube's embed player now REQUIRES — a no-referrer
          // embed renders Error 153 ("Video player configuration error")
          // instead of the video.
          referrerPolicy="origin"
          loading="lazy"
          data-video-provider={embed.provider}
        />
      </div>
    );
  } else if (url) {
    captionBelow = undefined;
    body = (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        data-video-link-card="true"
        data-video-provider={embed?.provider}
        className={VIDEO_CARD_CLASSES}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          // Known providers load their player in place; a modified click
          // (new tab, new window) and any other url keep the plain link.
          if (!embed || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          event.stopPropagation();
          setPlaying(true);
        }}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          {caption && <span className={VIDEO_CARD_CAPTION_CLASSES}>{caption}</span>}
          <span className={VIDEO_CARD_URL_CLASSES} title={url}>
            {displayUrl(url)}
          </span>
        </span>
        <span className={VIDEO_WATCH_CLASSES}>
          <PlayIcon size={12} strokeWidth={2} aria-hidden />
          Watch
        </span>
      </a>
    );
  } else {
    body = (
      <video
        src={resolvedSrc ?? src}
        controls
        preload="metadata"
        title={title}
        className="block h-auto w-full"
      />
    );
  }

  return (
    <figure className={VIDEO_FIGURE_CLASSES} data-docs-block-type="video" data-source-id={id}>
      <div className={VIDEO_PANEL_CLASSES} data-docs-media-panel="">
        <div className={`${MEDIA_HEAD_CLASSES} ${MEDIA_HEAD_TEXT}`}>
          <MediaHeadContent icon={FilmIcon} title={title ?? VIDEO_LABEL} meta={videoMeta(url, embed, src)} />
        </div>
        {body}
      </div>
      {captionBelow && <figcaption className={VIDEO_CAPTION_CLASSES}>{captionBelow}</figcaption>}
    </figure>
  );
}
