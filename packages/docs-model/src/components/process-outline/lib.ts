"use client";

/**
 * Stored process-outline step: `kind: "note"` marks a clarification leaf,
 * `trace` marks a step that a REAL TRACE EVENT corresponds to. Trace is the
 * skeleton of the flow; unmarked steps are the connective tissue between the
 * events. A note can never be trace-marked — notes are prose about a step,
 * not a thing that happens.
 */
export type ProcessOutlineStep = {
  text: string;
  kind?: "step" | "note";
  trace?: boolean;
  steps?: ProcessOutlineStep[];
};

/** Parsed/derived view of a step: `depth` computed from nesting, `note` from kind. */
export type ProcessOutlineNode = {
  text: string;
  note: boolean;
  trace: boolean;
  depth: number;
  children: ProcessOutlineNode[];
};

/**
 * Process-outline parser: a line's
 * depth is the rank of its indent width among the distinct widths seen SO FAR
 * (sorted ascending), so irregular indentation still nests and an already
 * assigned depth never changes when a new width appears later. Returns a
 * forest — multiple roots are allowed.
 */
export function parseProcessOutline(text: string): ProcessOutlineNode[] {
  const root: ProcessOutlineNode = { text: "", note: false, trace: false, depth: -1, children: [] };
  const stack: ProcessOutlineNode[] = [root];
  const indents: number[] = [];

  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    const match = raw.match(/^(\s*)(=>|->|>)?\s*(.*)$/);
    if (!match) continue;
    const indent = match[1].length;
    let depth = indents.indexOf(indent);
    if (depth === -1) {
      indents.push(indent);
      indents.sort((a, b) => a - b);
      depth = indents.indexOf(indent);
    }
    const node: ProcessOutlineNode = {
      text: match[3].trimEnd(),
      note: match[2] === ">",
      trace: match[2] === "=>",
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

function isNoteLike(item: ProcessOutlineNode | ProcessOutlineStep): boolean {
  return "note" in item ? item.note : item.kind === "note";
}

function isTraceLike(item: ProcessOutlineNode | ProcessOutlineStep): boolean {
  return "note" in item ? item.trace : item.trace === true;
}

function childList(item: ProcessOutlineNode | ProcessOutlineStep): readonly (ProcessOutlineNode | ProcessOutlineStep)[] {
  return ("children" in item ? item.children : item.steps) ?? [];
}

function serializeLines(
  items: readonly (ProcessOutlineNode | ProcessOutlineStep)[],
  depth: number,
): string[] {
  return items.flatMap((item) => {
    // `=>` outranks the depth-0 bare line: a trace-marked root still has to
    // come back from the parser as trace-marked, so it keeps its marker.
    const marker = isNoteLike(item) ? "> " : isTraceLike(item) ? "=> " : depth === 0 ? "" : "-> ";
    return [
      `${INDENT.repeat(depth)}${marker}${item.text}`,
      ...serializeLines(childList(item), depth + 1),
    ];
  });
}

/**
 * Structure → process-outline notation: root lines bare, nested steps as `-> text`,
 * notes as `> text`, trace-marked steps as `=> text` at any depth. parseProcessOutline(serializeProcessOutline(x)) round-trips the
 * structure (for single-line, non-blank texts — the only kind the parser
 * itself produces).
 */
export function serializeProcessOutline(steps: ProcessOutlineNode[] | ProcessOutlineStep[]): string {
  return serializeLines(steps, 0).join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Tolerant recursive read: skips malformed entries, always returns fresh objects. */
export function readStepTree(raw: unknown): ProcessOutlineStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: ProcessOutlineStep[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.text !== "string") continue;
    const step: ProcessOutlineStep = { text: item.text };
    if (item.kind === "step" || item.kind === "note") step.kind = item.kind;
    if (item.trace === true) step.trace = true;
    if (Array.isArray(item.steps)) step.steps = readStepTree(item.steps);
    steps.push(step);
  }
  return steps;
}

/** Builds a plain-JSON step object (recursively) with only the defined keys. */
export function cloneStep(step: ProcessOutlineStep): ProcessOutlineStep {
  const out: ProcessOutlineStep = { text: step.text };
  if (step.kind !== undefined) out.kind = step.kind;
  if (step.trace !== undefined) out.trace = step.trace;
  if (step.steps !== undefined) out.steps = step.steps.map(cloneStep);
  return out;
}

/** Action patch: replaces the step tree with fresh clones. */
export function stepsPatch(steps: ProcessOutlineStep[]): Record<string, unknown> {
  return { steps: steps.map(cloneStep) };
}

/** Stored steps → derived-view nodes with computed depth. */
export function stepNodes(steps: readonly ProcessOutlineStep[], depth = 0): ProcessOutlineNode[] {
  return steps.map((step) => ({
    text: step.text,
    note: step.kind === "note",
    trace: step.trace === true,
    depth,
    children: stepNodes(step.steps ?? [], depth + 1),
  }));
}

/** Parse output → stored form; `steps` omitted on leaves, kind stored only for notes. */
export function nodesToSteps(nodes: readonly ProcessOutlineNode[]): ProcessOutlineStep[] {
  return nodes.map((node) => {
    const step: ProcessOutlineStep = { text: node.text };
    if (node.note) step.kind = "note";
    if (node.trace) step.trace = true;
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
  steps: ProcessOutlineStep[],
  prefix: readonly number[],
): { siblings: ProcessOutlineStep[]; parent?: ProcessOutlineStep } | undefined {
  let siblings = steps;
  let parent: ProcessOutlineStep | undefined;
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
  steps: ProcessOutlineStep[],
  path: readonly number[],
): { siblings: ProcessOutlineStep[]; index: number; step: ProcessOutlineStep } | undefined {
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
