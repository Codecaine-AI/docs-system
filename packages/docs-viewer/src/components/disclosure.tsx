import { ChevronRight } from "lucide-react";

// Collapsible rows (each Interaction Surface operation) are native <details>
// disclosures: the <summary> row is the operation line, everything below it
// is the body. Native rather than React state because the published site is
// static markup with no hydration, so toggling, Enter / Space, and
// find-in-page must all work without JS. Operations start collapsed: a
// surface reads as a compact list of signature lines, each opened on demand.
//
// The summary is the row's one tab stop. This sheet removes the native
// marker, turns the chevron, paints the hover wash and the focus ring (the
// shared --docs-focus-ring, 2px, inside the row). Native summaries expose
// their expanded state to assistive tech; in the live app the stable ref
// callback below also mirrors it onto aria-expanded.
//
// Opening and closing animate the body's height and opacity on the global
// motion settings (the style rail's Transitions pane): open runs for
// --docs-page-fade-in, close for --docs-page-fade-out, and a transition type
// of "none" or reduced motion snaps. Pure CSS (::details-content plus
// interpolate-size), so it runs in the static site too; browsers without
// those features open and close instantly.
export const DISCLOSURE_STYLE = `
[data-disclosure]{interpolate-size:allow-keywords}
[data-disclosure]>summary{display:block;list-style:none;cursor:pointer}
[data-disclosure]>summary::-webkit-details-marker{display:none}
[data-disclosure]>summary:hover{background:var(--docs-hover,#ebebea)}
[data-disclosure]>summary:focus-visible{outline:var(--ds-border-width-focus) solid var(--docs-focus-ring,#0078df);outline-offset:calc(-1 * var(--ds-border-width-focus))}
[data-disclosure]::details-content{height:0;opacity:0;overflow:clip;transition:height var(--docs-page-fade-out,80ms) var(--ds-motion-easing-standard),opacity var(--docs-page-fade-out,80ms) var(--ds-motion-easing-standard),content-visibility var(--docs-page-fade-out,80ms) allow-discrete}
[data-disclosure][open]::details-content{height:auto;opacity:1;transition-duration:var(--docs-page-fade-in,120ms);transition-timing-function:cubic-bezier(.22,1,.36,1)}
[data-disclosure-chevron]{flex:none;width:14px;height:14px;color:var(--docs-muted,#666562);transition:rotate var(--docs-page-fade-in,120ms) var(--ds-motion-easing-standard)}
[data-disclosure][open]>summary [data-disclosure-chevron]{rotate:90deg}
[data-disclosure]>summary:hover [data-disclosure-chevron]{color:var(--docs-ink,#1f1f1f)}
@container style(--docs-page-transition-type: none){[data-disclosure]::details-content,[data-disclosure-chevron]{transition:none}}
@media (prefers-reduced-motion:reduce){[data-disclosure]::details-content,[data-disclosure-chevron]{transition:none}}
@media print{[data-disclosure]::details-content{content-visibility:visible;height:auto;opacity:1}[data-disclosure-chevron]{display:none}}
`;

/** The summary row's leading chevron; DISCLOSURE_STYLE turns it a quarter when the disclosure is open. */
export function DisclosureChevron() {
  return <ChevronRight aria-hidden="true" data-disclosure-chevron="true" />;
}

/**
 * Ref callback for a disclosure's <details>: keeps its summary's
 * aria-expanded equal to `details.open` across native toggles. Pass it as is
 * (a stable function, so React attaches it once per mount); ref callbacks do
 * not run in static markup, where the native summary semantics stand alone.
 */
export function syncDisclosureExpanded(details: HTMLDetailsElement | null): (() => void) | undefined {
  if (!details) return undefined;
  const sync = () => details.querySelector(":scope > summary")?.setAttribute("aria-expanded", details.open ? "true" : "false");
  sync();
  details.addEventListener("toggle", sync);
  return () => details.removeEventListener("toggle", sync);
}
