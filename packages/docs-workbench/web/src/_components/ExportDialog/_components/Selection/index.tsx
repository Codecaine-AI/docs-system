import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";
import { exportPages } from "../../pdf-selection";

export type SelectionProps = { nodes: DocsTreeNode[]; selected: Set<string>; change: (paths: string[], on: boolean) => void };

export function Selection({ nodes, selected, change }: SelectionProps) {
  return <ul className="pdf-tree">{nodes.filter(node => node.kind !== "file").map(node => {
    const descendants = exportPages([node]).map(page => page.path);
    if (!descendants.length) return null;
    const checked = node.kind === "bundle" ? selected.has(node.path) : descendants.every(path => selected.has(path));
    const partial = node.kind === "dir" && !checked && descendants.some(path => selected.has(path));
    return <li key={node.path}>
      <div className="pdf-tree-row">
        <label title={node.path}><input type="checkbox" checked={checked} ref={el => { if (el) el.indeterminate = partial; }}
          onChange={e => change(node.kind === "bundle" ? [node.path] : descendants, e.target.checked)} />{node.name}</label>
        {node.kind === "bundle" && descendants.length > 1 && <button type="button" onClick={() => change(descendants, !descendants.every(path => selected.has(path)))}>{descendants.every(path => selected.has(path)) ? "Clear section" : "Select section"}</button>}
      </div>
      {node.children && <Selection nodes={node.children} selected={selected} change={change} />}
    </li>;
  })}</ul>;
}

