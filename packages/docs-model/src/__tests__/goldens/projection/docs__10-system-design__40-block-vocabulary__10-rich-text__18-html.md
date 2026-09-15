The HTML block renders a self-contained HTML/CSS artifact inside an isolated iframe. Use it for a freeform diagram or an interactive explanation that does not fit a typed diagram component.

## State Schema

HTML source lives in props rather than delta text. The block carries no sidecar and travels with its document.

**HtmlState**

```
html: string  # HTML fragment or document; up to 1,048,576 characters.
title: string  # Accessible frame label. Blank inserts use a fallback label until authored.
caption?: string
height?: integer  # 120 to 2000 pixels; defaults to 400.
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

Insert and update the block through the generic typed block operations. The editor slash menu includes HTML. Edit HTML reveals the title, source textarea, height, and explicit script toggle. Preview and source share the same stored props.

## Doc Renderer

The read view, editor preview, static Docs export, and article publisher use the shared HTML renderer. It emits srcdoc at render time, so markup and inline styles appear without the host JavaScript bundle. Inline script interactions require browser JavaScript.

- The sandbox never grants same-origin access. Scripts are disabled unless allowScripts is true, which grants only allow-scripts. The frame cannot read the parent page or its cookies.

- A Content Security Policy precedes author markup. It blocks fetch, external scripts, external stylesheets, remote images, nested frames, objects, forms, and base URL changes. Inline CSS and data images, fonts, and media are permitted.

- Embed CSS, JavaScript, and data assets directly. Relative files, CDN libraries, and external API calls do not work. The sandbox is not a complete network isolation boundary because frame self-navigation can still request another URL. Do not include secrets in HTML.

- Give diagrams semantic labels and keyboard controls. Choose a height that fits the artifact; larger content scrolls within the frame. The HTML block adds no source or image download controls.

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

The outer frame uses the host border and caption colors. Its body advertises light and dark color schemes; author CSS owns the artifact palette. The iframe isolates its CSS from the host page.

## Agent Adapter

The rich-text family owns this block. Its closed state schema drives discovery, blank insertion, and scalar prop edits. Existing connections must refresh their tool schema after installing a version that adds the html type.
