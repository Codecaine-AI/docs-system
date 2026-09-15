// Static images stay visible. Load the existing Docs expansion UI on click.
for (const host of document.querySelectorAll<HTMLElement>('[data-docs-diagram]')) {
  const preview = host.querySelector<HTMLAnchorElement>('.docs-diagram-preview')!;
  let opening = false;
  preview.addEventListener('click', async event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (opening) return;
    opening = true;
    preview.setAttribute('aria-busy','true');
    try {
      const [response, {openDiagram}] = await Promise.all([fetch(host.dataset.src!), import('./docs-expansion')]);
      if (!response.ok) throw new Error('Diagram unavailable');
      openDiagram(await response.json(),host.dataset.docsDiagram!,host.dataset.title,host.dataset.view,()=>preview.focus());
    } catch {
      // The rendered image remains a useful browser-native fallback.
      window.location.assign(preview.href);
    } finally { opening=false;preview.removeAttribute('aria-busy'); }
  });
}
