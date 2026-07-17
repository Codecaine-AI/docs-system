import { readFileSync } from "fs";

const docs = [
  "10-system-design/20-data-model/00-overview",
  "10-system-design/20-data-model/10-document-tree",
  "10-system-design/20-data-model/20-rich-text",
  "10-system-design/20-data-model/30-block-state",
  "10-system-design/20-data-model/50-canonical-bytes",
  "10-system-design/30-block-vocabulary/00-overview",
  "10-system-design/30-block-vocabulary/10-rich-text/10-paragraph",
  "10-system-design/30-block-vocabulary/10-rich-text/11-heading",
  "10-system-design/30-block-vocabulary/10-rich-text/12-list-item",
  "10-system-design/30-block-vocabulary/10-rich-text/13-quote",
  "10-system-design/30-block-vocabulary/10-rich-text/14-callout",
  "10-system-design/30-block-vocabulary/10-rich-text/15-divider",
  "10-system-design/30-block-vocabulary/10-rich-text/16-image",
  "10-system-design/30-block-vocabulary/10-rich-text/17-video",
  "10-system-design/30-block-vocabulary/20-code",
  "10-system-design/30-block-vocabulary/30-structured-table",
  "10-system-design/30-block-vocabulary/40-file-tree",
  "10-system-design/30-block-vocabulary/50-interaction-surface",
  "10-system-design/30-block-vocabulary/60-mermaid",
  "10-system-design/30-block-vocabulary/70-canvas",
  "10-system-design/50-packages/00-overview",
  "10-system-design/50-packages/10-docs-model",
  "10-system-design/50-packages/40-docs-viewer",
  "10-system-design/50-packages/60-docs-cli",
  "20-implementation/10-package-map",
];

const re = /project|primary/i;

for (const d of docs) {
  const path = `${import.meta.dir}/../docs/${d}/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const hits: string[] = [];
  for (const b of Object.values<any>(doc.blocks ?? {})) {
    if (Array.isArray(b.text)) {
      for (let si = 0; si < b.text.length; si++) {
        const span = b.text[si];
        if (typeof span?.insert === "string" && re.test(span.insert)) {
          const code = span.attributes?.code ? " [CODE]" : "";
          hits.push(`  ${b.id} (${b.type}) text[${si}]${code}: ${JSON.stringify(span.insert)}`);
        }
      }
    }
    // scan props strings recursively
    const walk = (v: any, p: string) => {
      if (typeof v === "string") {
        if (re.test(v)) hits.push(`  ${b.id} (${b.type}) props${p}: ${JSON.stringify(v.length > 400 ? v.slice(0, 400) + "…" : v)}`);
      } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`);
    };
    walk(b.props ?? {}, "");
  }
  if (hits.length) {
    console.log(`=== ${d}`);
    console.log(hits.join("\n"));
  } else {
    console.log(`=== ${d}  (no hits)`);
  }
}
