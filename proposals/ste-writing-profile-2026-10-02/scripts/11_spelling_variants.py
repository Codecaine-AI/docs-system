#!/usr/bin/env python3
"""Exact-surface spelling variants for terms the user writes several ways (case-sensitive where relevant)."""
import collections, json, re, sys
sys.path.insert(0, "/tmp/ste-research/scripts")
from common import load, clean
GROUPS = {
    "sub-agent": r"\bsub[- ]?agents?\b", "mockup": r"\bmock[- ]?ups?\b", "set up / setup": r"\bset[- ]?up\b",
    "clean up / cleanup": r"\bclean[- ]?up\b", "docs system": r"\bdocs?[- ]system\b", "subheader": r"\bsub[- ]?head(er|ing)s?\b",
    "codex lb": r"\bcodex[- ]?lb\b", "GameCube": r"\bgame ?cube\b", "Kurate": r"\b[kc]urate\b", "Jev": r"\bj-?e-?v\b",
    "UI": r"\bui\b", "PR": r"\bprs?\b", "eval": r"\bevals?\b", "Opus": r"\bopus\b", "Fable": r"\bfable\b",
    "e.g./i.e.": r"\b(i\.?e\.?|e\.?g\.?)(?=[\s,])", "top-level": r"\btop[- ]?level\b", "follow-up": r"\bfollow[- ]?ups?\b",
    "file tree": r"\bfile[- ]?tree\b", "state shape": r"\bstate[- ]?shapes?\b",
}
msgs = load()
out = {}
for g, p in GROUPS.items():
    r = re.compile(p, re.I); c = collections.Counter()
    for m in msgs:
        for mm in r.finditer(clean(m["text"])):
            c[mm.group(0)] += 1
    out[g] = c.most_common(8)
json.dump(out, open("/tmp/ste-research/raw/spelling_variants.json", "w"), indent=1)
for g, v in out.items(): print(f"{g:20s} " + ", ".join(f"{k!r}:{n}" for k, n in v))
