import type { DeltaSpan, DocBlock } from "../doc-schema";
import type { LintContext } from "../lint/types";
export interface ProseField {
  blockId?: string;
  field: string;
  text: string;
  paragraph: boolean;
}
/** Keep a separator for literal spans so adjoining prose cannot form a false phrase. */
export function proseText(value: unknown): string {
  if (typeof value === "string")
    return value.replace(/(`+)[\s\S]*?\1/g, "\u0000");
  if (!Array.isArray(value)) return "";
  return proseText(
    value
      .map((span: DeltaSpan) =>
        span?.attributes?.code || span?.attributes?.reference
          ? "\u0000"
          : (span?.insert ?? ""),
      )
      .join(""),
  );
}
/** Explicit field allowlist: never descend into examples, references or embedded payloads. */
export function authoredProse(context: LintContext): ProseField[] {
  const out: ProseField[] = [];
  function add(
    value: unknown,
    field: string,
    block?: DocBlock,
    paragraph = false,
  ) {
    const text = proseText(value);
    if (text.trim()) out.push({ blockId: block?.id, field, text, paragraph });
  }
  add(context.document.title, "title");
  function fields(value: unknown, path: string, b: DocBlock) {
    if (!Array.isArray(value)) return;
    value.forEach((item, i) => {
      add(item?.description, `${path}[${i}].description`, b);
      fields(item?.fields, `${path}[${i}].fields`, b);
    });
  }
  function steps(value: unknown, path: string, b: DocBlock) {
    if (!Array.isArray(value)) return;
    value.forEach((item, i) => {
      add(item?.text, `${path}[${i}].text`, b);
      steps(item?.steps, `${path}[${i}].steps`, b);
    });
  }
  const excluded = new Set<string>();
  function exclude(id: string) {
    if (excluded.has(id)) return;
    excluded.add(id);
    context.document.blocks[id]?.children.forEach(exclude);
  }
  for (const b of context.blocks)
    if (
      b.type === "quote" ||
      b.type === "code" ||
      b.type === "canvas" ||
      b.type === "sequence"
    )
      exclude(b.id);
  for (const b of context.blocks) {
    // Wrapper titles belong to the document; embedded component data does not.
    if (b.type === "canvas" || b.type === "sequence")
      add(b.props.title, "props.title", b);
    if (excluded.has(b.id)) continue;
    const p = b.props;
    if (["paragraph", "heading", "list-item", "callout"].includes(b.type))
      add(b.text, "text", b, b.type === "paragraph");
    switch (b.type) {
      case "callout":
        add(p.title, "props.title", b);
        break;
      case "image-grid":
        if (Array.isArray(p.images)) p.images.forEach((image, i) => {
          add(image.heading, `props.images[${i}].heading`, b);
          add(image.alt, `props.images[${i}].alt`, b);
          add(image.caption, `props.images[${i}].caption`, b);
        });
        break;
      case "image":
        add(p.alt, "props.alt", b);
        add(p.caption, "props.caption", b);
        break;
      case "video":
        add(p.title, "props.title", b);
        add(p.caption, "props.caption", b);
        break;
      case "structured-table":
        add(p.title, "props.title", b);
        if (Array.isArray(p.columns))
          p.columns.forEach((c, i) => add(c, `props.columns[${i}]`, b));
        if (Array.isArray(p.rows))
          p.rows.forEach((row, i) => {
            if (Array.isArray(row))
              row.forEach((c, j) => add(c, `props.rows[${i}][${j}]`, b));
          });
        break;
      case "file-tree":
        if (Array.isArray(p.entries))
          p.entries.forEach((e, i) =>
            add(e?.note, `props.entries[${i}].note`, b),
          );
        break;
      case "state-shape":
        add(p.description, "props.description", b);
        fields(p.fields, "props.fields", b);
        break;
      case "interaction-surface":
        add(p.title, "props.title", b);
        if (Array.isArray(p.operations))
          p.operations.forEach((op, i) => {
            add(op?.description, `props.operations[${i}].description`, b);
            fields(op?.params, `props.operations[${i}].params`, b);
          });
        break;
      case "process-outline":
        steps(p.steps, "props.steps", b);
        break;
    }
  }
  return out;
}
