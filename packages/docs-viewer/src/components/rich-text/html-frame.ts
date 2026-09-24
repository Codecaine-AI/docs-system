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
