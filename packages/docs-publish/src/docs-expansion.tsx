import React from 'react';
import {createRoot} from 'react-dom/client';
import {StandaloneCanvasEmbed} from '../../docs-workbench/web/src/pages/CanvasEmbed';
import {StandaloneSequenceEmbed} from '../../docs-workbench/web/src/pages/SequenceEmbed';
export function openDiagram(document: any, kind: string, title?: string, view?: string, onClose?: () => void, expansionSource?: HTMLElement) {
  const holder = window.document.createElement('div');
  // Only the existing component's fullscreen portal is shown; retain SSR preview.
  holder.hidden = true;
  window.document.body.append(holder);
  const root=createRoot(holder);
  const close=()=>queueMicrotask(()=>{root.unmount();holder.remove();onClose?.();});
  const props={id:document.id,initialDocument:document,initiallyOpen:true,expansionSource,title,onViewerClose:close};
  root.render(kind==='canvas' ? <StandaloneCanvasEmbed {...props} view={view}/> : <StandaloneSequenceEmbed {...props}/>);
}
