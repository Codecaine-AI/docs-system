/**
 * The authored prose fields that hold sentences. Titles and labels are names, not sentences, so
 * the sentence-level rules skip them:
 * - the page title, headings, and table column headers;
 * - the props.title of tables, callouts, and media, and image headings;
 * - process-outline titles: the root step and each phase;
 * - bold label bullets, such as "**Unknown Words Are Allowed**" over its fact sub-bullets.
 */
import type { DocBlock } from "@codecaine-ai/docs-model";
import type { LintContext } from "@codecaine-ai/docs-model/lint";
import { authoredProse, type ProseField } from "@codecaine-ai/docs-model/writing/prose";

export interface SentenceField extends ProseField {
  block?: DocBlock;
  /**
   * True for a step: a numbered list item, or a process-outline action that is not a note. A
   * step that opens with a verb is an instruction.
   */
  step: boolean;
}

const LABEL_FIELDS = /^(?:title|props\.title|props\.columns\[\d+\]|props\.images\[\d+\]\.heading)$/;

export function sentenceFields(context: LintContext): SentenceField[] {
  return authoredProse(context).flatMap((field): SentenceField[] => {
    const block = field.blockId ? context.document.blocks[field.blockId] : undefined;
    if (LABEL_FIELDS.test(field.field) || block?.type === "heading") return [];
    if (field.field === "text" && block && isBoldLabel(block)) return [];
    if (block?.type !== "process-outline")
      return [{ ...field, block, step: block?.type === "list-item" && block.props.ordered === true }];
    const step = outlineStep(block, field.field);
    if (!step || step.title) return [];
    return [{ ...field, block, step: !step.note }];
  });
}

/** A block whose whole text is bold is a label, as in the house style's parent bullets. */
function isBoldLabel(block: DocBlock): boolean {
  const spans = block.text?.filter((span) => span.insert.trim()) ?? [];
  return spans.length > 0 && spans.every((span) => span.attributes?.bold);
}

interface OutlineStep {
  text?: unknown;
  kind?: unknown;
  steps?: unknown;
}

/**
 * The step a field such as "props.steps[0].steps[2].text" points at. The renderer draws the root
 * step and each first-level step with substeps as titles, the same lines that
 * process-outline.phase-title-case treats as labels.
 */
function outlineStep(block: DocBlock, field: string): { title: boolean; note: boolean } | undefined {
  const path = [...field.matchAll(/steps\[(\d+)\]/g)].map((match) => Number(match[1]));
  let steps: unknown = block.props.steps;
  let step: OutlineStep | undefined;
  for (const index of path) {
    if (!Array.isArray(steps)) return undefined;
    step = steps[index] as OutlineStep | undefined;
    steps = step?.steps;
  }
  if (!step) return undefined;
  const note = step.kind === "note";
  const hasSubsteps = Array.isArray(step.steps) && step.steps.some((child: OutlineStep) => typeof child?.text === "string");
  const title = !note && (path.length === 1 || (path.length === 2 && hasSubsteps));
  return { title, note };
}
