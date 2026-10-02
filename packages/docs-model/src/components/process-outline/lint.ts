import type { LintRule, RuleMatch } from '../../lint/types';
import { proseText } from '../../writing/prose';
import { titleCaseViolations, toTitleCase } from '../../writing/title-case';

/** A completed outline names one process and nests its actions beneath it. */
export const processOutlineRootRule: LintRule = {
  id: 'process-outline.single-parent',
  docsPath: '10-system-design/40-block-vocabulary/50-flow-and-diagrams/10-process-outline',
  severity: 'error',
  enforcement: ['complete'],
  applicability: 'Document-owned Process Outline blocks.',
  exclusions: ['Draft edits remain writable so authors can build or restructure an outline.'],
  suggestion: 'Use one named root with action children. Nest phases of the same process beneath it; put independent processes in separate Process Outline blocks.',
  check({ blocks }) {
    return blocks.flatMap(block => {
      if (block.type !== 'process-outline') return [];
      const steps = block.props.steps;
      // Malformed state belongs to the component schema validator.
      if (!Array.isArray(steps)) return [];
      const root = steps[0];
      const valid = steps.length === 1 && root && root.kind !== 'note'
        && typeof root.text === 'string' && root.text.trim().length > 0
        && Array.isArray(root.steps) && root.steps.some((child: any) => child && child.kind !== 'note');
      if (valid) return [];
      return [{
        blockId: block.id,
        field: 'props.steps',
        message: 'A completed Process Outline must have one named parent with at least one action child.',
        evidence: JSON.stringify(steps),
      }];
    });
  },
};

const isStep = (item: any) => !!item && typeof item === 'object' && !Array.isArray(item) && typeof item.text === 'string';
const hasChildren = (item: any) => Array.isArray(item.steps) && item.steps.some(isStep);
/**
 * Titles are the lines the renderer draws at title weight: each root step (the panel
 * head) and each phase, a first-level non-note step with its own substeps. Fields
 * address the stored props, so a skipped malformed entry never shifts an index.
 */
function titles(steps: unknown): { field: string; text: string; root: boolean }[] {
  if (!Array.isArray(steps)) return [];
  return steps.flatMap((root, r) => {
    if (!isStep(root) || root.kind === 'note') return [];
    const head = { field: `props.steps[${r}].text`, text: root.text as string, root: true };
    const phases = Array.isArray(root.steps) ? root.steps.flatMap((phase: any, p: number) =>
      isStep(phase) && phase.kind !== 'note' && hasChildren(phase)
        ? [{ field: `props.steps[${r}].steps[${p}].text`, text: phase.text as string, root: false }] : []) : [];
    return [head, ...phases];
  });
}
/** Process and phase titles read as labels, so they take Title Case like headings. */
export const processOutlinePhaseTitleCaseRule: LintRule = {
  id: 'process-outline.phase-title-case',
  docsPath: '10-system-design/40-block-vocabulary/50-flow-and-diagrams/10-process-outline',
  severity: 'warning',
  enforcement: [],
  applicability: 'Process Outline root titles and phases: first-level steps with their own substeps.',
  exclusions: [
    'Substeps, leaf first-level steps and notes, which stay sentence case',
    'Backtick code spans, acronyms, numbers and code-looking identifiers',
    'Minor words such as "of" and "the" unless first or last',
  ],
  suggestion: 'Write the process title and each phase as a short Title Case label. Keep substeps as sentence case actions.',
  check({ blocks }) {
    return blocks.flatMap(block => {
      if (block.type !== 'process-outline') return [];
      return titles(block.props.steps).flatMap(({ field, text, root }): RuleMatch[] => {
        const words = titleCaseViolations(proseText(text), { skipIdentifiers: true });
        if (!words.length) return [];
        const fixed = toTitleCase(text, { skipIdentifiers: true });
        return [{
          blockId: block.id,
          field,
          message: `${root ? 'Process title' : 'Phase'} is not in Title Case: ${words.join(', ')}.`,
          evidence: text,
          suggestion: `Use "${fixed}". ${processOutlinePhaseTitleCaseRule.suggestion}`,
        }];
      });
    });
  },
};
