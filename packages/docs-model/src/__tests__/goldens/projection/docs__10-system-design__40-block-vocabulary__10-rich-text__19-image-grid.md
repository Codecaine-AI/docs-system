The image-grid block groups related images so readers can compare processing stages or results. Each image has its own heading above it and an optional caption below it. The grid accepts images only.

## State Schema

**ImageGridState** — packages/docs-model/src/components/rich-text/state.ts#ImageGridState

```
images: ImageGridItem[]  # Ordered image entries. No fixed image count. An empty array is allowed while authoring.
  src: string  # Nonempty asset path. Use a bundle-relative path under assets/images.
  heading?: string  # Short label above the image, such as Cropped Wall.
  alt?: string  # Describe the information the image contributes. Missing or empty alt text produces an advisory finding.
  caption?: string  # Additional explanation below the image.
columns?: "auto" | 1 | 2 | 3 | 4  # Maximum column count. Default auto allows up to four columns as space permits.
```

```json
{
  "columns": 3,
  "images": [
    {
      "src": "./assets/images/cropped.jpg",
      "heading": "Cropped Wall",
      "alt": "Wall texture isolated from its surroundings."
    },
    {
      "src": "./assets/images/masked.png",
      "heading": "Cropped and Masked",
      "alt": "The cropped wall with the background masked."
    }
  ]
}
```

## Doc Renderer

- Rows grow automatically with the image count. Six images with columns set to 3 produce two rows when space permits. Setting 2 produces three rows.

- Columns wrap according to available container width, including narrow side peeks. Each column targets at least 220 pixels, and a smaller container uses one column without horizontal overflow.

- Images preserve their original proportions. Headings and captions wrap with the image. Cropping, arbitrary text columns, and download controls are not part of this block.

- The Docs reader and editor preview share one renderer. Published articles contain the grid markup at build time and need no JavaScript to display the layout. Static Docs exports use the same component in their viewer.

## Authoring Controls

The Image Grid slash-menu entry creates an empty grid. Edit image grid exposes the column selector, per-image heading, image path, alt text, and caption. Add image accepts an uploaded asset path. Move earlier, Move later, and Remove update the ordered entries through normal editor operations.

## Agent Renderer

The Markdown projection emits each heading in bold, followed by its image and optional italic caption, in source order. The text projection preserves all labels for search but does not represent columns.

## Agent Notes

Use docs_insert with type image-grid and typed props, or update the images array through docs_apply_ops with the current revision hash. Existing image assets remain in their bundles. Asset relocation rewrites each image entry. Raw Markdown image sequences remain standalone images unless explicitly grouped.

## Theme

The shared image-grid.css stylesheet supplies spacing, responsive columns, and proportional sizing. Caption color uses the existing image caption token and follows the host light or dark palette. The column preference is stored on the block and travels with the document.
