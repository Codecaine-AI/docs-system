The HTML block renders a self-contained HTML/CSS artifact inside an isolated iframe. Use it for a freeform diagram or an interactive explanation that does not fit a typed diagram component.

## State Schema

HTML source lives in props rather than delta text. The block carries no sidecar and travels with its document.

**HtmlState**

```
html: string  # HTML fragment or document; up to 1,048,576 characters.
title: string  # Accessible frame label. Blank inserts use a fallback label until authored.
caption?: string  # Legacy metadata retained for compatibility. The renderer ignores it. Put visible captions inside html.
height?: integer  # Initial layout height and no-JavaScript fallback, 120 to 2000 pixels; defaults to 400. Measured content determines the fitted preview height.
allowScripts?: boolean  # Defaults to false. Explicit true permits inline scripts in the isolated frame.
```

```json
{
  "html": "<p>Local HTML diagram</p>",
  "title": "Local HTML diagram",
  "height": 200
}
```

## Typed Actions

Insert and update the block through the generic typed block operations. The editor slash menu includes HTML. Both the editor and read view fit the artifact within the document and provide a separate Expand button. Put visible labels and captions inside the HTML source. Edit the title, HTML source, initial height, and script setting through the block props.

## Doc Renderer

The read view, editor preview, static Docs export, and article publisher use the shared HTML renderer. It emits srcdoc at render time, so markup and inline styles appear without the host JavaScript bundle. Automatic fitting and viewer controls require the host JavaScript bundle. Without it, the frame uses the authored height and native scrolling.

- The sandbox grants allow-scripts but never same-origin access. With allowScripts false, Content Security Policy permits only the exact measurement script by its SHA-256 hash. Author scripts and event handlers remain blocked. Setting allowScripts true permits author inline scripts. The frame cannot read the parent page or its cookies.

- A Content Security Policy precedes author markup. It blocks fetch, external scripts, external stylesheets, remote images, nested frames, objects, forms, and base URL changes. Inline CSS and data images, fonts, and media are permitted.

- Embed CSS, JavaScript, and data assets directly. Relative files, CDN libraries, and external API calls do not work. The sandbox is not a complete network isolation boundary because frame self-navigation can still request another URL. Do not include secrets in HTML.

- The interactive inline preview scales proportionally to fit the document width and the smaller of 600 pixels or 70% of the window height. Small artifacts stay at their natural size. Content changes and window resizing update the fit. Expand opens the same iframe in a full-screen viewer with Fit, 100%, and zoom controls, preserving its interaction state. Close or Escape returns focus to Expand. Scrolling belongs to the expanded viewer when zoomed content exceeds its available space. Expansion animates from the inline block over 260 milliseconds; closing returns over 220 milliseconds. Reduced-motion preferences disable both animations.

> **HTML: Interactive HTML example**

```html-embed
<style>button{font:inherit;padding:12px;border-radius:8px;border:1px solid #777}p{font-size:14px}</style><button onclick="this.textContent=Number(this.textContent)+1" aria-label="Increase counter">0</button><p>This button runs entirely inside the HTML frame.</p>
```

## Agent Renderer

The agent projection labels the artifact with its title and includes the raw source in an html-embed fenced listing. Projection is for inspection; it is not a lossless interchange format for every prop. Canonical doc.json retains all props.

The migration importer recognizes an explicit Html component with title, optional height, optional caption, and allowScripts="true" attributes. Ordinary fenced html listings remain code examples and are never executed implicitly.

```mdx
<Html title="Diagram" height="240">
<style>p { color: teal; }</style>
<p>Self-contained diagram</p>
</Html>
```

## Theme

The iframe adds no visible border, caption, or body padding. A separate control row keeps Expand outside the artifact's interactive content. The iframe body advertises light and dark color schemes. Author CSS owns the artifact palette and spacing, isolated from the host page.

## Agent Adapter

The rich-text family owns this block. Its closed state schema drives discovery, blank insertion, and scalar prop edits. Existing connections must refresh their tool schema after installing a version that adds the html type.
