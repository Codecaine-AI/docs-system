/** Runs inside the opaque iframe. CSP permits this exact script for static artifacts. */
export const HTML_FRAME_BRIDGE = `(() => {
  let pending = false;
  let previous = '';
  const measure = () => {
    pending = false;
    const body = document.body;
    if (!body) return;
    const range = document.createRange();
    range.selectNodeContents(body);
    const bounds = range.getBoundingClientRect();
    const style = getComputedStyle(body);
    const width = Math.ceil(Math.max(body.scrollWidth, bounds.right + scrollX + (parseFloat(style.paddingRight) || 0)));
    const height = Math.ceil(Math.max(body.offsetHeight, bounds.bottom + scrollY + (parseFloat(style.paddingBottom) || 0)));
    const key = width + ':' + height;
    if (key !== previous && width > 0 && height > 0) {
      previous = key;
      parent.postMessage({ type: 'docs-html-size', width, height }, '*');
    }
  };
  const schedule = () => {
    if (!pending) { pending = true; requestAnimationFrame(measure); }
  };
  const start = () => {
    new ResizeObserver(schedule).observe(document.body);
    new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    document.addEventListener('load', schedule, true);
    document.fonts.ready.then(schedule);
    schedule();
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') parent.postMessage({ type: 'docs-html-escape' }, '*');
  });
  window.addEventListener('resize', () => { previous = ''; schedule(); });
  window.addEventListener('message', event => {
    if (event.source === parent && event.data?.type === 'docs-html-measure') { previous = ''; schedule(); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();`;

// SHA-256 of HTML_FRAME_BRIDGE. A regression test checks this against the script.
export const HTML_FRAME_BRIDGE_HASH = 'oyQVu8Z6vX93Lhkf6syh+AFcxCO44w47Kwo81suaaBE=';

export function fitHtmlScale(width: number, height: number, availableWidth: number, availableHeight: number): number {
  return Math.min(1, availableWidth / Math.max(1, width), availableHeight / Math.max(1, height));
}

/** The inline preview's height cap in px: 600px, or 70% of the window when that is less. */
export function inlineHtmlCap(windowHeight: number): number {
  return Math.min(600, windowHeight * 0.7);
}

/**
 * The inline preview fits the column width only (never scaling up past 1),
 * and its area stops at the height cap. Taller content scrolls inside the area,
 * and then fits the width the vertical scrollbar leaves (scrollbarWidth px).
 */
export function inlineHtmlLayout(width: number, height: number, availableWidth: number, windowHeight: number, scrollbarWidth = 0): {
  scale: number; areaHeight: number; scrolls: boolean;
} {
  const fit = (room: number) => Math.min(1, Math.max(1, room) / Math.max(1, width));
  const cap = inlineHtmlCap(windowHeight);
  const scrolls = height * fit(availableWidth) > cap;
  const scale = scrolls ? fit(availableWidth - scrollbarWidth) : fit(availableWidth);
  return { scale, areaHeight: Math.min(height * scale, cap), scrolls };
}

/** The width a classic vertical scrollbar takes in this browser, 0 for overlay scrollbars. */
export function measureScrollbarWidth(): number {
  if (typeof document === "undefined" || !document.body) return 0;
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll";
  document.body.appendChild(probe);
  const width = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return Math.max(0, width);
}
