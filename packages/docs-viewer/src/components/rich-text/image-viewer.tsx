"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2Icon, XIcon } from "lucide-react";
import { useViewerMotion } from "../../transitions/useViewerMotion";
import { usePanZoom } from "../../transitions/usePanZoom";

type ExpandableImageProps = {
  src: string;
  alt: string;
  /** Viewer header text; falls back to alt, then "Image". */
  title?: string;
  className?: string;
  loading?: "lazy" | "eager";
  decoding?: "async" | "auto" | "sync";
  /** Controlled open state, for a host that also opens the viewer from its own control. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Overlay the corner expand glyph (default). Off when the host draws its own control. */
  hint?: boolean;
};

/**
 * An inline image that opens the full-screen pan/zoom viewer — the image
 * counterpart of the sequence and canvas "View larger" previews.
 *
 * Static publishing renders this with renderToStaticMarkup, so the button
 * carries `data-docs-image-expand` plus its src/alt/title; the published
 * page's viewers.tsx opens `ImageViewerDialog` from those attributes.
 */
export function ExpandableImage({ src, alt, title, className, loading, decoding, open: openProp, onOpenChange, hint = true }: ExpandableImageProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  }, [onOpenChange]);
  const previewRef = useRef<HTMLButtonElement>(null);
  const label = title || alt || "Image";
  const close = useCallback(() => setOpen(false), [setOpen]);
  return (
    <>
      <button
        ref={previewRef}
        type="button"
        className="docs-image-expand-trigger"
        data-docs-image-expand=""
        data-src={src}
        data-alt={alt}
        data-title={label}
        aria-label={`Open ${label} in full-screen viewer`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); setOpen(true); }}
      >
        <img src={src} alt={alt} className={className} loading={loading} decoding={decoding} />
        {hint && <span className="docs-image-expand-hint" aria-hidden="true"><Maximize2Icon size={14} /></span>}
      </button>
      {open && <ImageViewerDialog src={src} alt={alt} title={label} expansionSource={previewRef.current} onClose={close} />}
    </>
  );
}

type ImageViewerDialogProps = {
  src: string;
  alt: string;
  title: string;
  /** The inline preview the viewer grows from, shrinks back to, and refocuses. */
  expansionSource: HTMLElement | null;
  onClose: () => void;
};

/** Full-screen modal viewer: fits on open, wheel zooms toward the cursor, drag pans. */
export function ImageViewerDialog({ src, alt, title, expansionSource, onClose }: ImageViewerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(() => naturalSize(expansionSource?.querySelector("img")));
  const { captureOrigin, animateOpen, animateClose, cancel } = useViewerMotion();
  const closeViewer = useCallback(() => {
    animateClose(dialogRef.current, expansionSource, onClose);
  }, [animateClose, expansionSource, onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = window.document.body.style.overflow;
    dialog?.showModal();
    captureOrigin(expansionSource);
    animateOpen(dialog);
    window.document.body.style.overflow = "hidden";
    return () => {
      cancel();
      dialog?.close();
      window.document.body.style.overflow = previousOverflow;
      expansionSource?.focus();
    };
  }, [animateOpen, cancel, captureOrigin, expansionSource]);

  // After the showModal effect above, so the first fit measures an open dialog.
  const panZoom = usePanZoom({ viewportRef, contentWidth: size.width, contentHeight: size.height, enabled: true });

  return createPortal(
    <dialog
      ref={dialogRef}
      style={{ transformOrigin: "top left" }}
      className="docs-image-dialog not-prose bg-background text-foreground"
      aria-label={`${title} image viewer`}
      onCancel={(event) => { event.preventDefault(); closeViewer(); }}
      // A StrictMode remount closes then reopens the dialog; the queued close event must not unmount it.
      onClose={() => { if (!dialogRef.current?.open) onClose(); }}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b p-3">
        <div className="min-w-0 flex-1 truncate font-medium">{title}</div>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" aria-label="Zoom out" disabled={!panZoom.canZoomOut} onClick={panZoom.zoomOut}>−</button>
          <output className="w-12 text-center text-[length:var(--ds-font-size-ui-lg)]" aria-label="Zoom level">{panZoom.zoomPercent}%</output>
          <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" aria-label="Zoom in" disabled={!panZoom.canZoomIn} onClick={panZoom.zoomIn}>+</button>
          <button type="button" className="rounded border px-3 py-1" onClick={panZoom.fit}>Fit</button>
          <button type="button" className="rounded border p-2" aria-label="Close image viewer" onClick={closeViewer}><XIcon size={18} /></button>
        </div>
      </header>
      <div
        ref={viewportRef}
        className="docs-image-viewport"
        data-panning={panZoom.isPanning || undefined}
        tabIndex={0}
        aria-label="Image. Drag or use arrow keys to pan; scroll or press plus and minus to zoom; 0 fits."
        {...panZoom.viewportProps}
      >
        <img
          className="docs-image-expanded"
          src={src}
          alt={alt}
          draggable={false}
          style={{ width: size.width || undefined, height: size.height || undefined, transform: panZoom.transform }}
          onLoad={(event) => setSize(naturalSize(event.currentTarget))}
        />
      </div>
    </dialog>,
    window.document.body,
  );
}

function naturalSize(image: HTMLImageElement | null | undefined) {
  return { width: image?.naturalWidth ?? 0, height: image?.naturalHeight ?? 0 };
}
