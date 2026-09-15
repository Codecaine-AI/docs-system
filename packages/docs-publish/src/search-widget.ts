import { search, type SearchEntry } from './search';
/** Opt-in widget. Complete article links remain available without JavaScript. */
export function mountSearch(host: HTMLElement) {
  const input = host.querySelector<HTMLInputElement>('input[type=search]')!;
  const select = host.querySelector<HTMLSelectElement>('select')!;
  const output = host.querySelector<HTMLElement>('[data-results]')!;
  const status = host.querySelector<HTMLElement>('[role=status]')!;
  let entries: Promise<SearchEntry[]> | undefined;
  let request = 0;
  const update = async () => {
    const current = ++request;
    try {
      entries ??= fetch(host.dataset.index!).then(r => { if (!r.ok) throw new Error('Search unavailable'); return r.json(); });
      const found = search(await entries, input.value, select.value);
      if (current !== request) return;
      output.replaceChildren(...found.map(e => {
        const item = document.createElement('li');
        const link = document.createElement('a'); link.href = e.url; link.textContent = e.title;
        const summary = document.createElement('p'); summary.textContent = e.description;
        item.append(link, summary); return item;
      }));
      status.textContent = `${found.length} ${found.length === 1 ? 'result' : 'results'}`;
    } catch { entries = undefined; status.textContent = 'Search could not load. Browse the article links below or try again.'; }
  };
  input.addEventListener('input', update);
  select.addEventListener('change', update);
}
for (const host of document.querySelectorAll<HTMLElement>('[data-docs-search]')) mountSearch(host);
