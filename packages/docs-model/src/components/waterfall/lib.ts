"use client";

/** Stored step-tree node: `kind: "note"` marks a clarification leaf; omitted kind reads as "step". */
export type WaterfallStep = {
  text: string;
  kind?: "step" | "note";
  steps?: WaterfallStep[];
};

/** Parsed/derived view of a step: `depth` computed from nesting, `note` from kind. */
export type WaterfallNode = {
  text: string;
  note: boolean;
  depth: number;
  children: WaterfallNode[];
};

/**
 * Arrow-tree parser, ported from the waterfall design prototype: a line's
 * depth is the rank of its indent width among the distinct widths seen SO FAR
 * (sorted ascending), so irregular indentation still nests and an already
 * assigned depth never changes when a new width appears later. Returns a
 * forest — multiple roots are allowed.
 */
export function parseWaterfall(text: string): WaterfallNode[] {
  const root: WaterfallNode = { text: "", note: false, depth: -1, children: [] };
  const stack: WaterfallNode[] = [root];
  const indents: number[] = [];

  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    const match = raw.match(/^(\s*)(->|>)?\s*(.*)$/);
    if (!match) continue;
    const indent = match[1].length;
    let depth = indents.indexOf(indent);
    if (depth === -1) {
      indents.push(indent);
      indents.sort((a, b) => a - b);
      depth = indents.indexOf(indent);
    }
    const node: WaterfallNode = {
      text: match[3].trimEnd(),
      note: match[2] === ">",
      depth,
      children: [],
    };
    while (stack[stack.length - 1].depth >= depth) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return root.children;
}

/** 5 spaces per nesting level — distinct widths the parser ranks back to the same depths. */
const INDENT = "     ";

function isNoteLike(item: WaterfallNode | WaterfallStep): boolean {
  return "note" in item ? item.note : item.kind === "note";
}

function childList(item: WaterfallNode | WaterfallStep): readonly (WaterfallNode | WaterfallStep)[] {
  return ("children" in item ? item.children : item.steps) ?? [];
}

function serializeLines(
  items: readonly (WaterfallNode | WaterfallStep)[],
  depth: number,
): string[] {
  return items.flatMap((item) => {
    const marker = isNoteLike(item) ? "> " : depth === 0 ? "" : "-> ";
    return [
      `${INDENT.repeat(depth)}${marker}${item.text}`,
      ...serializeLines(childList(item), depth + 1),
    ];
  });
}

/**
 * Structure → arrow-tree text: root lines bare, nested steps as `-> text`,
 * notes as `> text`. parseWaterfall(serializeWaterfall(x)) round-trips the
 * structure (for single-line, non-blank texts — the only kind the parser
 * itself produces).
 */
export function serializeWaterfall(steps: WaterfallNode[] | WaterfallStep[]): string {
  return serializeLines(steps, 0).join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Tolerant recursive read: skips malformed entries, always returns fresh objects. */
export function readStepTree(raw: unknown): WaterfallStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: WaterfallStep[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.text !== "string") continue;
    const step: WaterfallStep = { text: item.text };
    if (item.kind === "step" || item.kind === "note") step.kind = item.kind;
    if (Array.isArray(item.steps)) step.steps = readStepTree(item.steps);
    steps.push(step);
  }
  return steps;
}

/** Builds a plain-JSON step object (recursively) with only the defined keys. */
export function cloneStep(step: WaterfallStep): WaterfallStep {
  const out: WaterfallStep = { text: step.text };
  if (step.kind !== undefined) out.kind = step.kind;
  if (step.steps !== undefined) out.steps = step.steps.map(cloneStep);
  return out;
}

/** Action patch: replaces the step tree with fresh clones. */
export function stepsPatch(steps: WaterfallStep[]): Record<string, unknown> {
  return { steps: steps.map(cloneStep) };
}

/** Stored steps → derived-view nodes with computed depth. */
export function stepNodes(steps: readonly WaterfallStep[], depth = 0): WaterfallNode[] {
  return steps.map((step) => ({
    text: step.text,
    note: step.kind === "note",
    depth,
    children: stepNodes(step.steps ?? [], depth + 1),
  }));
}

/** Parse output → stored form; `steps` omitted on leaves, kind stored only for notes. */
export function nodesToSteps(nodes: readonly WaterfallNode[]): WaterfallStep[] {
  return nodes.map((node) => {
    const step: WaterfallStep = { text: node.text };
    if (node.note) step.kind = "note";
    if (node.children.length > 0) step.steps = nodesToSteps(node.children);
    return step;
  });
}

/**
 * Walks an index-path PREFIX (every element must index an existing step) and
 * returns the child list it lands in ([] = the root list) plus the step that
 * owns it, creating that step's `steps` array when absent so callers can
 * insert into it. Returns undefined when an element is out of range.
 */
export function resolveStepSiblings(
  steps: WaterfallStep[],
  prefix: readonly number[],
): { siblings: WaterfallStep[]; parent?: WaterfallStep } | undefined {
  let siblings = steps;
  let parent: WaterfallStep | undefined;
  for (const index of prefix) {
    const node = siblings[index];
    if (!node) return undefined;
    node.steps ??= [];
    parent = node;
    siblings = node.steps;
  }
  return { siblings, parent };
}

/**
 * Resolves a full index path to an existing step plus the sibling list
 * holding it. Returns undefined when the path does not resolve (an empty
 * path never resolves — it names the root list, not a step).
 */
export function resolveStep(
  steps: WaterfallStep[],
  path: readonly number[],
): { siblings: WaterfallStep[]; index: number; step: WaterfallStep } | undefined {
  if (path.length === 0) return undefined;
  const resolved = resolveStepSiblings(steps, path.slice(0, -1));
  if (!resolved) return undefined;
  const index = path[path.length - 1];
  const step = resolved.siblings[index];
  return step ? { siblings: resolved.siblings, index, step } : undefined;
}

/** Issue-message rendering of an index path, e.g. "[0, 2, 1]". */
export function formatStepPath(path: readonly number[]): string {
  return `[${path.join(", ")}]`;
}
