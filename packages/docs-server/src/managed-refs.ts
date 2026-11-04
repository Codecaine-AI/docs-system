import { dirname, relative, resolve, sep } from "node:path";
import { normalizeDocRefPath } from "@codecaine-ai/docs-index/ref-match";

/** A page's typed document data; doc.json files under an assets folder are attachments, not pages. */
export const isDoc = (p: string) => p.endsWith("/doc.json") && !p.includes("/assets/");

/** Only typed document data and component sidecars contain maintained references. */
export const holdsManagedRefs = (p: string) =>
  isDoc(p) || p.endsWith("/annotations.json") || p.endsWith(".canvas.json") || p.endsWith(".sequence.json");

/** A `{kind:'doc', path}` reference: `holder.path` is `raw`, `target` its normalized bundle path. */
export type DocRef = { form: "doc"; file: string; holder: any; key: "path"; raw: string; target: string };

/**
 * An asset reference at `holder[key]`: `raw` is the stored value, `suffix` its `?`/`#` tail.
 * `rel` is the target read relative to the holding file, `rooted` the target read from the docs root.
 */
export type AssetRef = {
  form: "asset"; file: string; holder: any; key: string; raw: string; rel: string; rooted: string; suffix: string;
};

export type ManagedRef = DocRef | AssetRef;

/**
 * Every maintained reference in one parsed reference file, unresolved, in visit order: doc refs anywhere in
 * the data first, then asset refs (block src/poster, image-grid images, text and structured-table span links,
 * canvas and sequence src/url/href/imageUrl, annotation canvasSrc). Reads `data` and never changes it.
 * Values with a scheme, `//` or `#` are not asset refs.
 */
export function extractManagedRefs(file: string, data: any, root: string): ManagedRef[] {
  const refs: ManagedRef[] = [];
  function visit(v: any) {
    if (!v || typeof v !== "object") return;
    if (v.kind === "doc" && typeof v.path === "string") {
      refs.push({ form: "doc", file, holder: v, key: "path", raw: v.path, target: normalizeDocRefPath(v.path) });
    }
    for (const child of Object.values(v)) visit(child);
  }
  visit(data);
  function assetReference(holder: any, key: string) {
    const src = holder?.[key];
    if (typeof src !== "string" || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)) return;
    const suffix = src.match(/[?#].*$/)?.[0] ?? "", plain = src.slice(0, src.length - suffix.length).replaceAll("\\", "/");
    const rel = relative(root, resolve(root, dirname(file), plain)).split(sep).join("/");
    const rooted = plain.replace(/^\//, "").replace(/^\.\//, "");
    refs.push({ form: "asset", file, holder, key, raw: src, rel, rooted, suffix });
  }
  if (isDoc(file)) for (const block of Object.values(data.blocks ?? {}) as any[]) {
    for (const key of ["src", "poster"]) assetReference(block.props, key);
    if (block.type === "image-grid") for (const image of block.props?.images ?? []) assetReference(image, "src");
    for (const span of block.text ?? []) assetReference(span.attributes, "link");
    // Structured-table cell links have the same inline attribute shape.
    for (const row of block.props?.rows ?? []) if (Array.isArray(row)) for (const cell of row) if (Array.isArray(cell)) for (const span of cell) assetReference(span?.attributes, "link");
  }
  if (file.endsWith(".canvas.json") || file.endsWith(".sequence.json")) {
    function componentAssets(value: any) {
      if (!value || typeof value !== "object") return;
      for (const key of ["src", "url", "href", "imageUrl"]) assetReference(value, key);
      for (const child of Object.values(value)) componentAssets(child);
    }
    componentAssets(data);
  }
  if (file.endsWith("/annotations.json")) for (const annotation of data.annotations ?? []) assetReference(annotation.target, "canvasSrc");
  return refs;
}

/**
 * The asset an asset ref points at in a file set: its relative reading when that file exists, else its rooted
 * reading; undefined when neither exists or the target is outside an assets folder. `relative` says which
 * reading won. Throws when both readings exist, differ, and either one or the holding file is moving.
 */
export function resolveAssetTarget(
  ref: AssetRef,
  hasFile: (path: string) => boolean,
  isMoving: (path: string) => boolean,
): { target: string; relative: boolean } | undefined {
  const { rel, rooted, file } = ref;
  const relativeExists = hasFile(rel), rootExists = hasFile(rooted);
  if (relativeExists && rootExists && rel !== rooted && (isMoving(rel) || isMoving(rooted) || isMoving(file))) {
    throw Error(`Ambiguous asset path in ${file}: ${ref.raw}`);
  }
  const target = relativeExists ? rel : rootExists ? rooted : undefined;
  if (!target || !target.includes("/assets/")) return undefined;
  return { target, relative: relativeExists };
}
