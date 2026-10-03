/**
 * Inlining standalone SVG documents into one HTML page. Ids are page-global
 * once inlined, so two diagrams that both declare `#seq-arrow-sync` would
 * paint each other's markers. scopeSvgIds gives every id a prefix and
 * rewrites every reference to it, found structurally rather than by matching
 * one attribute spelling.
 */

/** ARIA attributes whose value is a space-separated list of id references. */
const ID_LIST_ATTRIBUTES = new Set([
  "aria-activedescendant",
  "aria-controls",
  "aria-describedby",
  "aria-details",
  "aria-errormessage",
  "aria-flowto",
  "aria-labelledby",
  "aria-owns",
]);

/** `url(#id)`, with optional quotes and whitespace inside the parentheses. */
const URL_REFERENCE = /url\(\s*(["']?)\s*#([^"')\s]+)\s*\1\s*\)/g;
/** An `#id` selector: the next of `{`, `;` and `}` after it is `{`, so it sits in a selector, not a value. */
const SELECTOR_ID = /#(-?[A-Za-z_][\w-]*)(?=[^{};]*\{)/g;

/**
 * The SVG as a DOM: parsed as the standalone XML document it is, or, when it
 * is not well-formed XML, with the HTML parser that reads the page it is
 * inlined into.
 */
function parseSvg(svg: string): { elements: Element[]; serialize: () => string } {
  const xml = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = xml.documentElement;
  if (root.localName === "svg" && xml.getElementsByTagName("parsererror").length === 0) {
    return { elements: [root, ...Array.from(root.querySelectorAll("*"))], serialize: () => new XMLSerializer().serializeToString(root) };
  }
  const holder = new DOMParser().parseFromString(`<!doctype html><body>${svg}`, "text/html").body;
  return { elements: Array.from(holder.querySelectorAll("*")), serialize: () => holder.innerHTML };
}

/**
 * Prefixes every id an SVG declares and rewrites each reference to it:
 * `href` / `xlink:href`, `url(#id)` in any attribute or style sheet, ARIA id
 * lists, and `#id` selectors in `<style>`.
 */
export function scopeSvgIds(svg: string, prefix: string): string {
  const { elements, serialize } = parseSvg(svg);
  const ids = new Set(elements.map(element => element.getAttribute("id")).filter((id): id is string => !!id));
  if (ids.size === 0) return svg;
  const scoped = (id: string) => (ids.has(id) ? prefix + id : id);
  const scopeUrls = (value: string) =>
    value.replace(URL_REFERENCE, (match, quote: string, id: string) => (ids.has(id) ? `url(${quote}#${prefix}${id}${quote})` : match));
  for (const element of elements) {
    for (const attribute of Array.from(element.attributes)) {
      const { name, value } = attribute;
      let next = value;
      if (name === "id") next = scoped(value);
      else if (name === "href" || name === "xlink:href") next = value.startsWith("#") ? `#${scoped(value.slice(1))}` : value;
      else if (ID_LIST_ATTRIBUTES.has(name)) next = value.trim().split(/\s+/).map(scoped).join(" ");
      else if (value.includes("url(")) next = scopeUrls(value);
      if (next !== value) attribute.value = next;
    }
    if (element.localName === "style" && element.textContent) {
      element.textContent = scopeUrls(element.textContent).replace(SELECTOR_ID, (match, id: string) => (ids.has(id) ? `#${prefix}${id}` : match));
    }
  }
  return serialize();
}
