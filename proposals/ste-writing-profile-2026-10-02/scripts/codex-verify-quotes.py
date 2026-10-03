"""Check that every quote in the report appears verbatim (case/quote-style/whitespace-insensitive) in the kept corpus."""
import json, re

REPORT = '/tmp/ste-research/2-codex-transcripts.md'
IN = '/tmp/ste-research/raw/codex-human.jsonl'


def norm(s):
    s = s.replace('“', '"').replace('”', '"').replace('’', "'").replace('‘', "'")
    return re.sub(r'\s+', ' ', s).strip().lower()


corpus = norm(' \n '.join(json.loads(l)['prose'] for l in open(IN)))
rep = open(REPORT).read()
quotes = re.findall(r'"([^"\n]{12,200}?)"(?=[ )|.,;]|$)', rep, re.M)
quotes += re.findall(r"'([^'\n]{12,200}?)'(?=[ )|.,;]|$)", rep, re.M)
miss = 0
for q in quotes:
    parts = [p.strip(' .') for p in re.split(r'\.\.\.|…', q) if len(p.strip(' .')) > 6]
    ok = all(norm(p) in corpus for p in parts)
    if not ok:
        miss += 1
        print('MISSING:', q)
print('checked', len(quotes), 'missing', miss)
ms = [json.loads(l)['prose'].lower() for l in open(IN)]
print('kickoff-message asks:', sum(1 for m in ms if re.search(r'(give|write|make) me (a|an|the)? ?(message|prompt)|message (i|we) (can|could) (send|paste)|send (in|to) a new thread', m)))
