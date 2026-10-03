#!/usr/bin/env python3
"""Unigram/bigram/trigram counts (stopwords + filler removed) and filler stats."""
import collections, csv, json, re, sys
sys.path.insert(0, "/tmp/ste-research/scripts")
from common import load, tokens, STOP, FILLER_PATTERNS, FILLER_WORDS, clean

MID_OK = {"of", "to", "and", "for", "in", "on", "the", "by", "per", "as"}
msgs = load()

cnt = {1: collections.Counter(), 2: collections.Counter(), 3: collections.Counter()}
df = {1: collections.Counter(), 2: collections.Counter(), 3: collections.Counter()}
proj = {1: collections.defaultdict(set), 2: collections.defaultdict(set), 3: collections.defaultdict(set)}
total_words = 0
for m in msgs:
    toks = tokens(m["text"])
    total_words += len(toks)
    seen = {1: set(), 2: set(), 3: set()}
    bad = lambda w: w in STOP or w in FILLER_WORDS or len(w) < 2 or w.isdigit()
    for i, w in enumerate(toks):
        if not bad(w):
            cnt[1][w] += 1; seen[1].add(w)
        if i + 1 < len(toks):
            a, b = toks[i], toks[i + 1]
            if not bad(a) and not bad(b) and a != b:
                g = f"{a} {b}"; cnt[2][g] += 1; seen[2].add(g)
        if i + 2 < len(toks):
            a, b, c = toks[i:i + 3]
            if not bad(a) and not bad(c) and (not bad(b) or b in MID_OK) and len({a, b, c}) == 3:
                g = f"{a} {b} {c}"; cnt[3][g] += 1; seen[3].add(g)
    for n in (1, 2, 3):
        for g in seen[n]:
            df[n][g] += 1; proj[n][g].add(m["project"])

for n in (1, 2, 3):
    with open(f"/tmp/ste-research/raw/ngrams_{n}.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["term", "count", "messages", "projects"])
        for g, c in cnt[n].most_common():
            if df[n][g] < 2:
                continue
            w.writerow([g, c, df[n][g], len(proj[n][g])])

# filler stats
fill = {}
nmsg_with = collections.Counter()
for name, pat in FILLER_PATTERNS.items():
    r = re.compile(pat, re.I | re.M)
    tot = 0
    for m in msgs:
        k = len(r.findall(clean(m["text"])))
        tot += k
        if k: nmsg_with[name] += 1
    fill[name] = {"count": tot, "per_1k_words": round(tot * 1000 / total_words, 2), "messages": nmsg_with[name]}
json.dump({"total_messages": len(msgs), "total_words": total_words, "filler": fill},
          open("/tmp/ste-research/raw/filler_stats.json", "w"), indent=1)
print("words", total_words)
for k, v in sorted(fill.items(), key=lambda kv: -kv[1]["count"]):
    print(f"{k:28s} {v['count']:6d} {v['per_1k_words']:6.2f}/1k  msgs={v['messages']}")
