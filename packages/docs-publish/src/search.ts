export type SearchEntry = { url: string; title: string; description: string; tags: string[]; text: string };
const stop = new Set('a an the that this those what was were is are it i my one thing about with of for and or to in on how do does'.split(' '));
const words = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
function near(a: string, b: string): boolean {
  if (a.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (a.length <= b.length) j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
/** Optional, browser-safe search. Hosts choose the public entries and UI. */
export function search(entries: SearchEntry[], query: string, tag = '') {
  const terms = [...new Set(words(query).filter(w => !stop.has(w)))].slice(0, 20);
  return entries.filter(e => !tag || e.tags.includes(tag)).map(entry => {
    const fields = [[entry.title, 8], [entry.tags.join(' '), 6], [entry.description, 3], [entry.text, 1]] as const;
    let score = 0, matched = 0;
    for (const term of terms) {
      let best = 0;
      for (const [field, weight] of fields) for (const token of words(field)) {
        best = Math.max(best, weight * (token === term ? 3 : token.startsWith(term) ? 2 : near(term, token) ? 1 : 0));
      }
      if (best) matched++;
      score += best;
    }
    return { ...entry, score, matched };
  }).filter(e => !terms.length || e.matched === terms.length).sort((a, b) => b.score - a.score);
}
