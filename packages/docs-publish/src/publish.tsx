import React from 'react';
import { renderDocumentToSvg } from '../../../external/canvas/packages/canvas/src/render/static-svg';
import { renderSequenceSvgString } from '../../../external/sequence/packages/sequence/src/render/SequenceDiagram';
import { layoutSequence } from '../../../external/sequence/packages/sequence/src/layout';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative, sep, posix } from 'node:path';
import { createHash } from 'node:crypto';
import Renderer from '../../docs-viewer/src/render/DocBlockRenderer';
import { DocsClientProvider } from '../../docs-viewer/src/client';
import { projectToMarkdown } from '../../docs-model/src/project-markdown';
import { validateDocDocument } from '../../docs-model/src/doc-schema';
import { validateInteractiveCanvasDocument } from '../../../external/canvas/packages/canvas/src/state/schema';
import { validateSequenceDocument } from '../../../external/sequence/packages/sequence/src/schema';
export { search } from './search';
export const escapeHtml = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export type PostInput = { path: string; slug: string; description: string; date: string; tags: string[]; draft?: boolean };
export type PublishedPost = PostInput & {title: string; url: string; html: string; text: string; diagrams: boolean};
export function confinedFile(root: string, name: string) {
  if (!name || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..') || /[?#:%]/.test(name)) throw new Error(`Unsafe asset/path: ${name}`);
  const base = realpathSync(root), file = realpathSync(resolve(base, name));
  if (!file.startsWith(base + sep) || !statSync(file).isFile()) throw new Error(`Path leaves collection: ${name}`);
  return file;
}
function metadata(post: PostInput) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) || ['tags','assets'].includes(post.slug)) throw new Error(`Invalid or reserved slug: ${post.slug}`);
  if (typeof post.description !== 'string' || !post.description.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(post.date) || new Date(post.date).toISOString().slice(0,10) !== post.date) throw new Error(`Invalid metadata: ${post.slug}`);
  if (!Array.isArray(post.tags) || post.tags.some(t => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t))) throw new Error(`Invalid tags: ${post.slug}`);
  if (post.draft !== undefined && typeof post.draft !== 'boolean') throw new Error(`Invalid draft: ${post.slug}`);
}
/** Explicit public allowlist. No internal-docs discovery or filesystem crawl. */
export function publishCollection({root, posts, basePath = '/blog/'}: {root: string; posts: PostInput[]; basePath?: string}) {
  if (!/^\/(?:[a-z0-9-]+\/)*$/.test(basePath)) throw new Error('basePath must be a trailing-slash pathname');
  const files = new Map<string, Uint8Array>();
  const slugs = new Set<string>();
  const result: PublishedPost[] = [];
  for (const post of posts) {
    metadata(post);
    if (slugs.has(post.slug)) throw new Error(`Duplicate slug: ${post.slug}`);
    slugs.add(post.slug);
    if (post.draft) continue;
    const file = confinedFile(root, `${post.path}/doc.json`);
    const document = JSON.parse(readFileSync(file, 'utf8'));
    const validation = validateDocDocument(document);
    if (!validation.ok) throw new Error(`Invalid document ${post.path}: ${JSON.stringify(validation)}`);
    if (!document.title?.trim()) throw new Error(`Missing title: ${post.path}`);
    const assets = new Map<string,string>();
    const asset = (src: string) => {
      if (assets.has(src)) return assets.get(src)!;
      const canonical = src.startsWith('./') ? posix.join(post.path, src) : src;
      const file = confinedFile(root, canonical);
      const bytes = readFileSync(file);
      const name = `${createHash('sha256').update(bytes).digest('hex').slice(0,16)}-${posix.basename(canonical)}`;
      const url = `${basePath}assets/${name}`;
      files.set(`assets/${name}`, bytes); assets.set(src, url); return url;
    };
    let diagrams = false;
    const diagram = (kind: string) => ({src, title, view}: {src?: string; title?: string; view?: string}) => {
      if (!src) throw new Error(`${post.slug}: ${kind} requires a portable sidecar src`);
      const sidecar = JSON.parse(readFileSync(confinedFile(root, src.startsWith('./') ? posix.join(post.path, src) : src), 'utf8'));
      const valid = kind === 'canvas' ? validateInteractiveCanvasDocument(sidecar) : validateSequenceDocument(sidecar);
      if (!valid.ok) throw new Error(`Invalid ${kind}: ${src}`);
      diagrams = true;
      const label = title ?? sidecar.title ?? `${kind} diagram`;
      const rendered = kind === 'canvas'
        ? renderDocumentToSvg(valid.document ?? sidecar, {fit:'content', ...(view ? {sectionId:view} : {}), padding:24})
        : {...layoutSequence(sidecar), svg:renderSequenceSvgString({...sidecar,title:label})};
      const svgBytes = Buffer.from(rendered.svg);
      const filename = `${createHash('sha256').update(svgBytes).digest('hex').slice(0,16)}-${kind}.svg`;
      const url = `${basePath}assets/${filename}`;
      files.set(`assets/${filename}`, svgBytes);
      return <figure data-docs-diagram={kind} data-title={label} data-src={asset(src)} data-view={view}>
        <figcaption>{label}</figcaption>
        <a className="docs-diagram-preview" href={url} aria-label={`Enlarge ${label}`}>
          <img src={url} alt={label} width={rendered.width} height={rendered.height}/>
          <span className="docs-diagram-expand" aria-hidden="true">⤢</span>
        </a>
      </figure>;
    };
    const html = renderToStaticMarkup(<DocsClientProvider canvasEmbed={diagram('canvas')} sequenceEmbed={diagram('sequence')}><div className="docs-markdown"><Renderer document={document} bundlePath={post.path} resolveAssetSrc={asset}/></div></DocsClientProvider>);
    const text = projectToMarkdown(document).replace(/<!--[^]*?-->/g, ' ').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    result.push({...post, title: document.title, url: `${basePath}${post.slug}/`, html, text, diagrams});
  }
  result.sort((a,b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  return {posts: result, files, searchIndex: result.map(({url,title,description,tags,text}) => ({url,title,description,tags,text}))};
}
