import { readFileSync, writeFileSync } from 'node:fs';
import { validateDocDocument, serializeDocDocument } from '../../../packages/docs-model/src/doc-schema';
import { applyOp } from '../../../packages/docs-model/src/doc-ops';
import { projectToMarkdown } from '../../../packages/docs-model/src/project-markdown';
const path = 'docs/10-system-design/10-doc-standards/80-authoring-lints/doc.json';
const validated = validateDocDocument(JSON.parse(readFileSync(path, 'utf8')));
if (!validated.ok) throw Error('Invalid lint guidance');
let doc = validated.document;
for (const block of Object.values(doc.blocks)) {
  if (!block.text) continue;
  const text = block.text.map(span => ({...span, insert: span.insert
    .replace('Page Structure Errors', 'Page Structure Warnings')
    .replace('Page Structure Warning', 'Page Structure Warning')
    .replace('owns checks derived from', 'registers rule folders with checks and tests derived from')
    .replace('These rules enforce completion.', 'These rules remain advisory, matching the existing audit policy. Promote a rule by changing its own severity and enforcement metadata after reviewing corpus impact.')
    .replace('writing/rules.ts owns checks derived from Writing Style.', 'writing/rules.ts registers writing checks. Each rule folder owns its metadata, checker, and tests, linked to Writing Style.')
    .replace('page-structure/rules.ts owns checks derived from Structure.', 'page-structure/rules.ts registers page checks. Each rule folder owns its metadata, checker, and tests, linked to Structure.')
  }));
  if (JSON.stringify(text) === JSON.stringify(block.text)) continue;
  const changed = applyOp(doc, {type:'updateBlock', blockId:block.id, text});
  if (!changed.ok) throw Error(JSON.stringify(changed.issues));
  doc = changed.doc;
}
writeFileSync(path, serializeDocDocument(doc));
writeFileSync('packages/docs-model/src/__tests__/goldens/projection/docs__10-system-design__10-doc-standards__80-authoring-lints.md', projectToMarkdown(doc));
