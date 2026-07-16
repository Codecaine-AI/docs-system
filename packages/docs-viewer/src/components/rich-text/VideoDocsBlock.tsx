"use client";

import type { ReactNode } from "react";
import { FilmIcon } from "lucide-react";

export const VIDEO_LABEL = "Video";

export const VIDEO_AGENT_DESCRIPTION =
  "An embedded video, rendered from typed props: { src?: string; url?: string; title?: string; caption?: string }. `src` is a bundle-relative video asset (e.g. \"./assets/videos/demo.mp4\", played through a native <video controls> element via the host's asset resolver); `url` is an external video URL and WINS when both are set. YouTube (youtube.com/watch?v=, youtu.be/, /shorts/), Vimeo, and Loom urls embed a privacy-friendly player iframe (youtube-nocookie.com/embed, player.vimeo.com/video, loom.com/embed); any other url is never iframed and renders as a neutral link card opening in a new tab. Neither src nor url renders a missing-source placeholder.";

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

/**
 * Video block. Minimal figure framing like the image block — no header strip,
 * just the media surface plus a muted caption line. `url` (external) wins
 * over `src` (bundle asset); known providers embed, unknown urls get a
 * neutral link card (never an iframe), a bare `src` plays through a native
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

  let media: ReactNode;
  if (url && embed) {
    media = (
      <div className="aspect-video w-full overflow-hidden rounded-md border border-[color:var(--docs-video-border,var(--border))] bg-muted/20">
        <iframe
          src={embed.embedUrl}
          title={title ?? `${VIDEO_LABEL}: ${url}`}
          className="h-full w-full"
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
    media = (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        data-video-link-card="true"
        className="flex items-center gap-3 rounded-md border border-[color:var(--docs-video-border,var(--border))] bg-muted/20 px-3 py-2 no-underline transition-colors hover:bg-muted/40"
      >
        <FilmIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">
            {title ?? "External video"}
          </span>
          <span className="block truncate font-mono text-[11px] text-muted-foreground">
            {url}
          </span>
        </span>
      </a>
    );
  } else if (src) {
    media = (
      <video
        src={resolvedSrc ?? src}
        controls
        preload="metadata"
        title={title}
        className="max-w-full rounded-md border border-[color:var(--docs-video-border,var(--border))]"
      />
    );
  } else {
    media = (
      <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        Video block is missing a src or url.
      </div>
    );
  }

  return (
    <figure
      className="not-prose my-4"
      data-docs-block-type="video"
      data-source-id={id}
    >
      {media}
      {caption && (
        <figcaption className="mt-1 text-xs text-[color:var(--docs-video-caption-fg,var(--muted-foreground))]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
