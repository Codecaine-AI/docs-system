# Rich text

The rich-text component owns the eight text-and-media block types that make up ordinary document flow. They share one implementation home (`packages/docs-viewer/src/components/rich-text/`, one file per type), the delta-span text model, and the markdown-shortcut input rules — which is why they live grouped here, one doc per type.

## The types

- `paragraph` — the default flow block.

- `heading` — section structure, levels 1-6.

- `list-item` — bullets and numbered lists, nesting via children.

- `quote` — plain unlabeled block quote.

- `callout` — toned, labeled admonition card.

- `divider` — horizontal rule.

- `image` — bundle-asset image with caption.

- `video` — file or provider-URL embed with caption.

Each type has its own theme file (see the Theming section at the end of every type doc, and 20-implementation/40-theming for the system).
