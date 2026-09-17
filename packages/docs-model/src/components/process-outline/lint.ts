import type { LintRule } from '../../lint/types';

/** A completed outline names one process and nests its actions beneath it. */
export const processOutlineRootRule: LintRule = {
  id: 'process-outline.single-parent',
  docsPath: '10-system-design/40-block-vocabulary/90-process-outline',
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
