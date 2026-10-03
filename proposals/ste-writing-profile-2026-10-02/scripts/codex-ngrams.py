"""N-gram + filler statistics over cleaned human messages (prose field)."""
import json, re, collections

IN = '/tmp/ste-research/raw/codex-human.jsonl'
RAW = '/tmp/ste-research/raw/'

STOP = set("""
a about above after again against all am an and any are aren't as at be because been before being below between both but by
can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't
have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is
isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out
over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then
there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll
we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you
you'd you'll you're you've your yours yourself yourselves im ive dont doesnt didnt cant wont isnt thats theres whats lets youre
okay ok yeah yes please thanks thank also just really actually basically essentially literally like whatnot kind sort way right
now well maybe probably even still already much many lot lots thing things stuff something anything everything nothing someone
able want wanted wants need needs needed think thought feel know mean meant guess see seems seem look looks looking get gets
getting got go goes going gonna make makes making made let use using used one two also etc e.g i.e via within without per
currently current new good great better best sure fine awesome cool nice ideally generally specifically pretty quite bit little
us will shall may might must would could should can there's here's i'd it'll that'll what'll where'd how'd
say says said tell told give gave take took put come came keep kept try tried trying work works working worked
first second next last back around another every else instead though although however since whether either neither
able also anyway again always never sometimes often usually somewhere somehow otherwise rather enough far long
""".split())
FILLER = {
    'like (filler, comma-bound)': r'(?:^|[,.] )like,|, like\b',
    'whatnot': r'\bwhatnot\b',
    'kind of': r'\bkind of\b',
    'sort of': r'\bsort of\b',
    'basically': r'\bbasically\b',
    'essentially': r'\bessentially\b',
    'actually': r'\bactually\b',
    'just': r'\bjust\b',
    'literally': r'\bliterally\b',
    'really': r'\breally\b',
    'pretty much': r'\bpretty much\b',
    'and such': r'\band such\b',
    'or something': r'\bor something\b',
    'stuff': r'\bstuff\b',
    'you know': r'\byou know\b',
    'I guess': r'\bi guess\b',
    'I mean': r'\bi mean\b',
    'okay (any)': r'\bokay\b',
    'um/uh': r'\b(um|uh)\b',
    'ideally': r'\bideally\b',
    'generally': r'\bgenerally\b',
}

URL = re.compile(r'https?://\S+|\b\S+@\S+\.\w+')
PATHY = re.compile(r'\S*[/\\]\S*')
TOK = re.compile(r"[a-z][a-z0-9+#]*(?:[-_.'][a-z0-9+#]+)*")


def tokens(text):
    t = URL.sub(' ', text)
    t = PATHY.sub(' ', t)
    t = t.replace('`', ' ').lower().replace('’', "'")
    # sentence-ish breaks so n-grams don't cross punctuation
    chunks = re.split(r'[.,;:!?()\[\]{}"\n]+', t)
    for ch in chunks:
        toks = [w.strip("'.-_") for w in TOK.findall(ch)]
        yield [w for w in toks if w]


def main():
    msgs = [json.loads(l)['prose'] for l in open(IN)]
    total_words = 0
    filler = collections.Counter()
    df = {1: collections.Counter(), 2: collections.Counter(), 3: collections.Counter()}
    tf = {1: collections.Counter(), 2: collections.Counter(), 3: collections.Counter()}
    for m in msgs:
        low = m.lower()
        total_words += len(m.split())
        for k, rx in FILLER.items():
            filler[k] += len(re.findall(rx, low))
        seen = {1: set(), 2: set(), 3: set()}
        for toks in tokens(m):
            for n in (1, 2, 3):
                for i in range(len(toks) - n + 1):
                    g = toks[i:i + n]
                    if g[0] in STOP or g[-1] in STOP:
                        continue
                    if n == 1 and (len(g[0]) < 2 or g[0].isdigit()):
                        continue
                    if any(w.isdigit() for w in g):
                        continue
                    key = ' '.join(g)
                    tf[n][key] += 1
                    seen[n].add(key)
        for n in (1, 2, 3):
            for k in seen[n]:
                df[n][k] += 1
    json.dump({'messages': len(msgs), 'words': total_words,
               'filler': {k: [v, round(v * 1000 / total_words, 2)] for k, v in filler.most_common()}},
              open(RAW + 'codex-filler.json', 'w'), indent=1)
    for n, lim in ((1, 700), (2, 600), (3, 300)):
        with open(RAW + f'codex-ngrams-{n}.tsv', 'w') as o:
            o.write('ngram\tmsgs\tcount\n')
            for k, v in df[n].most_common(5000):
                o.write(f'{k}\t{v}\t{tf[n][k]}\n')
    print(json.dumps({k: [v, round(v * 1000 / total_words, 2)] for k, v in filler.most_common()}))


main()
