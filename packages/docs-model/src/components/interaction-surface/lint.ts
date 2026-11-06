import type { LintRule } from "../../lint/types";

/** TypeScript words that make a lowercase run inside a type, such as `keyof typeof x` or `value is string`. */
const TYPE_KEYWORDS = /\b(?:keyof|typeof|readonly|unique|infer|extends|is|asserts|new|in|as|const)\b/g;

/** The text of a type outside quoted strings and (), [], {}, <> groups, where a sentence cannot hide. */
function topLevelText(type: string): string {
  let depth = 0;
  let quote: string | null = null;
  let out = "";
  for (const char of type) {
    if (quote) { if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if ("([{<".includes(char)) { depth += 1; continue; }
    if (")]}>".includes(char)) { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) out += char;
  }
  return out;
}

/**
 * True when a returns string holds prose, not only a type: outside its brackets and strings it has
 * a sentence break (". " or a final period) or three lowercase words in a row. `{ ok, doc } for a doc
 * patch.` is prose. `OpsResponse`, `string | null`, `Promise<void>` and `text/event-stream of
 * DocsChangeEvent JSON` are not.
 */
export function returnsHoldsProse(returns: string): boolean {
  const text = topLevelText(returns).replace(TYPE_KEYWORDS, " ");
  return /[.;](?:\s|$)/.test(text.trimEnd()) || /\b[a-z]+\s+[a-z]+\s+[a-z]+\b/.test(text);
}

/**
 * An operation's returns renders as the monospace type after its signature and heads its Returns card,
 * so a condition written there reads as type text. Round 8 brief 3 wrote "{ ok: true, doc, hash } for a
 * doc patch. A canvas, sequence, or compound patch returns its own fields." as the returns of POST
 * /api/undo, and every judge sample flagged it.
 */
export const interactionSurfaceReturnsProseRule: LintRule = {
  id: "interaction-surface.returns-prose",
  docsPath: "10-system-design/40-block-vocabulary/40-structured-reference/20-interaction-surface",
  severity: "warning",
  enforcement: [],
  applicability: "The returns string of each operation in an Interaction Surface block.",
  exclusions: ["Words inside a bracketed type or a quoted literal, such as { status: \"not found\" }"],
  suggestion: "Keep returns to the return type, such as OpsResponse or { ok, doc }. Move the condition or the other cases into the operation's description, or list the returned fields in returnShape.",
  check({ blocks }) {
    return blocks.flatMap((block) => {
      if (block.type !== "interaction-surface" || !Array.isArray(block.props.operations)) return [];
      return block.props.operations.flatMap((operation: unknown, index: number) => {
        if (!operation || typeof operation !== "object") return [];
        const { name, returns } = operation as { name?: unknown; returns?: unknown };
        if (typeof returns !== "string" || !returnsHoldsProse(returns)) return [];
        const label = typeof name === "string" && name ? name : `operation ${index + 1}`;
        return [{
          blockId: block.id,
          field: `props.operations[${index}].returns`,
          evidence: returns,
          message: `The returns of ${label} holds prose, and the page renders it as type text. Keep returns to the type, and move the rest into the operation's description.`,
        }];
      });
    });
  },
};

/**
 * Every operation needs an exampleCall, and a returnShape with fields needs its example. In rounds 0 to 4 of the
 * interaction-surface quality climb, every judge flagged operations with no example call or no return example
 * (brief 199 had none on any operation), although the guidance asked for both.
 */
export const interactionSurfaceExampleMissingRule: LintRule = {
  id: "interaction-surface.example-missing",
  docsPath: "10-system-design/40-block-vocabulary/40-structured-reference/20-interaction-surface",
  severity: "warning",
  enforcement: [],
  applicability: "Each operation of an Interaction Surface block, and each returnShape that lists fields.",
  exclusions: ["A returnShape with no fields, such as the result of a void call"],
  suggestion: "Add an exampleCall: real code that calls the operation with literal values. For a returnShape with fields, add an example that is the exact result of that call.",
  check({ blocks }) {
    return blocks.flatMap((block) => {
      if (block.type !== "interaction-surface" || !Array.isArray(block.props.operations)) return [];
      return block.props.operations.flatMap((operation: unknown, index: number) => {
        if (!operation || typeof operation !== "object") return [];
        const { name, exampleCall, returnShape } = operation as { name?: unknown; exampleCall?: unknown; returnShape?: { fields?: unknown; example?: unknown } };
        const label = typeof name === "string" && name ? name : `operation ${index + 1}`;
        const findings = [];
        if (typeof exampleCall !== "string" || !exampleCall.trim()) {
          findings.push({ blockId: block.id, field: `props.operations[${index}].exampleCall`, evidence: label, message: `${label} has no exampleCall. Give it one real call with literal values.` });
        }
        const fields = returnShape && typeof returnShape === "object" && Array.isArray(returnShape.fields) ? returnShape.fields : [];
        if (fields.length > 0 && (typeof returnShape!.example !== "string" || !returnShape!.example.trim())) {
          findings.push({ blockId: block.id, field: `props.operations[${index}].returnShape.example`, evidence: label, message: `${label} lists returned fields but no return example. Give the exact result of its exampleCall.` });
        }
        return findings;
      });
    });
  },
};

const PRIMITIVE_TYPE = /^(?:string|number|boolean|bigint|true|false|null|undefined|void|-?\d+(?:\.\d+)?|"[^"]*"|'[^']*')(?:\s*\|\s*(?:string|number|boolean|bigint|true|false|null|undefined|-?\d+(?:\.\d+)?|"[^"]*"|'[^']*'))*$/;

/**
 * A param or returned field is one key of the object a caller passes or gets back. Rounds 4 and 5 of the
 * interaction-surface quality climb wrote union branches as made-up fields, such as `open: true` with the
 * branch's fields nested under it and `unchanged state: DocPeekState`, and every judge read them as wrong shapes.
 * The rule flags a field name with a space or a colon outside quotes, and nested fields under a primitive or
 * literal type, which has no fields.
 */
export const interactionSurfaceFieldShapeRule: LintRule = {
  id: "interaction-surface.field-shape",
  docsPath: "10-system-design/40-block-vocabulary/40-structured-reference/20-interaction-surface",
  severity: "warning",
  enforcement: [],
  applicability: "Each param and returned field of an Interaction Surface operation, at every depth.",
  exclusions: ["A quoted key, such as \"content-type\""],
  suggestion: "Name each field by its real key and nest fields only under an object type. For a result with more than one shape, keep its fields flat, type the key field with its literal values, and start each branch-only field description with its branch, such as Only when ok is true.",
  check({ blocks }) {
    type RawField = { name?: unknown; type?: unknown; fields?: unknown };
    const walk = (fields: unknown, path: string): { field: string; evidence: string; message: string }[] => {
      if (!Array.isArray(fields)) return [];
      return fields.flatMap((raw: unknown, index: number) => {
        if (!raw || typeof raw !== "object") return [];
        const { name, type, fields: nested } = raw as RawField;
        const at = `${path}[${index}]`;
        const out: { field: string; evidence: string; message: string }[] = [];
        if (typeof name === "string" && /[\s:]/.test(name.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, ""))) {
          out.push({ field: `${at}.name`, evidence: name, message: `The field name "${name}" is not a key. Name the field by its real key.` });
        }
        if (Array.isArray(nested) && nested.length > 0 && typeof type === "string" && PRIMITIVE_TYPE.test(type.trim())) {
          out.push({ field: `${at}.fields`, evidence: `${String(name)}: ${type}`, message: `${String(name)} has type ${type}, which has no fields, but lists nested fields.` });
        }
        return [...out, ...walk(nested, `${at}.fields`)];
      });
    };
    return blocks.flatMap((block) => {
      if (block.type !== "interaction-surface" || !Array.isArray(block.props.operations)) return [];
      return block.props.operations.flatMap((operation: unknown, index: number) => {
        if (!operation || typeof operation !== "object") return [];
        const { params, returnShape } = operation as { params?: unknown; returnShape?: { fields?: unknown } };
        const base = `props.operations[${index}]`;
        return [...walk(params, `${base}.params`), ...walk(returnShape && typeof returnShape === "object" ? returnShape.fields : undefined, `${base}.returnShape.fields`)]
          .map((finding) => ({ blockId: block.id, ...finding }));
      });
    });
  },
};
