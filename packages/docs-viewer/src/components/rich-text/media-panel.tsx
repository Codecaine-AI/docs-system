import type { ComponentType, ReactNode } from "react";

/*
 * The one panel the media blocks (image, video, html) share: a head row with
 * the text-family tile, a sans title and a mono meta note, over a body. Each
 * block keeps its own frame knobs (--docs-image-* / --docs-video-*) on the
 * panel element; everything else here reads the shared role tokens, each with
 * its LIGHT default as the literal fallback (docs-publish ships no theme
 * layer). Class strings are literals so the Tailwind scanner sees them.
 */

/** Marks a media panel (image-viewer.css insets the expand trigger's focus ring inside it). */
export const MEDIA_PANEL_CLASS = "docs-media-panel";

export const MEDIA_PANEL_FILL =
  "overflow-hidden bg-[var(--docs-panel,#f8f8f7)] text-[color:var(--docs-text,#2a2a2a)]";

/** Head row layout; the title typography comes from the caller (MEDIA_HEAD_TEXT or a block's own knobs). */
export const MEDIA_HEAD_CLASSES =
  "m-0 flex min-h-8 items-center px-3 py-1.5 bg-[var(--docs-panel,#f8f8f7)] border-b border-[color:var(--docs-rule-soft,#efeeec)]";

/** Default head title typography: sans 600 13.5px ink. */
export const MEDIA_HEAD_TEXT =
  "gap-x-2 text-[13.5px] font-semibold leading-[1.3] text-[color:var(--docs-ink,#1f1f1f)]";

const MEDIA_TITLE_CLASSES = "min-w-0 [overflow-wrap:anywhere]";
const MEDIA_TITLE_MONO_CLASSES = "min-w-0 [overflow-wrap:anywhere] font-mono text-[13px] font-medium";
const MEDIA_META_CLASSES =
  "ml-auto flex-none whitespace-nowrap font-mono text-[12px] font-normal leading-none text-[color:var(--docs-muted,#666562)]";
const MEDIA_TILE_CLASSES =
  "inline-flex size-4 flex-none items-center justify-center rounded-[2px] bg-[var(--docs-fam-text-solid,#9b9a97)] text-[color:var(--docs-tile-glyph,#ffffff)]";

/** Focus ring shared by every media control: 2px accent ring, 2px out. */
export const MEDIA_FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-[color:var(--docs-focus-ring,#0078df)]";

/** Ghost button (Watch, Expand, the HTML viewer's zoom controls): 22px, hairline, page fill. */
export const MEDIA_GHOST_BUTTON =
  "inline-flex h-[22px] flex-none cursor-pointer items-center gap-1 rounded-[var(--radius,2px)] border border-[color:var(--docs-rule,#e6e5e3)] bg-[var(--docs-page,#fdfdfd)] px-2 font-sans text-[12px] font-medium leading-none text-[color:var(--docs-text,#2a2a2a)] hover:bg-[var(--docs-hover,#ebebea)] hover:text-[color:var(--docs-ink,#1f1f1f)] disabled:cursor-default disabled:opacity-50";

type Glyph = ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;

/** 16px text-family tile with an 11px glyph. Decorative: the title names the block. */
export function MediaTile({ icon: Icon }: { icon: Glyph }) {
  return (
    <span className={MEDIA_TILE_CLASSES} aria-hidden="true" data-media-tile="">
      <Icon size={11} strokeWidth={2.25} aria-hidden />
    </span>
  );
}

/** Head contents: optional tile, the title (sans, or mono for a bare file name), and a mono meta note. */
export function MediaHeadContent({
  icon,
  title,
  titleMono = false,
  meta,
  children,
}: {
  icon?: Glyph;
  title: ReactNode;
  titleMono?: boolean;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      {icon ? <MediaTile icon={icon} /> : null}
      <span className={titleMono ? MEDIA_TITLE_MONO_CLASSES : MEDIA_TITLE_CLASSES} data-media-title="">
        {title}
      </span>
      {meta ? <span className={MEDIA_META_CLASSES}>{meta}</span> : null}
      {children}
    </>
  );
}

/** Last path segment of a src or URL path ("./assets/images/a.svg" -> "a.svg"). */
export function assetFileName(src: string): string {
  const path = src.split(/[?#]/)[0] ?? src;
  const name = path.split("/").filter(Boolean).pop() ?? path;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}
