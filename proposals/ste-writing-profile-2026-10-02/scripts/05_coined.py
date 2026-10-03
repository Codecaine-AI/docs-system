#!/usr/bin/env python3
"""Candidate coined / project-specific terms: words not in the system dictionary, and
capitalized tokens used mid-sentence. Emits counts + one context snippet each."""
import collections, json, re, sys
sys.path.insert(0, "/tmp/ste-research/scripts")
from common import load, clean, STOP

DICT = set(w.strip().lower() for w in open("/usr/share/dict/words"))
COMMON_TECH = set("""api apis ui ux json html css js ts tsx jsx md pr prs repo repos url urls cli mcp llm llms ai ok env envs npm bun git github
config configs async eval evals backend frontend localhost dev prod md5 sql sqlite yaml http https id ids uuid png jpg jpeg svg pdf qa
subagent subagents todo todos ci app apps db webhook webhooks oauth auth regex markdown codebase dropdown sidebar workflow workflows
inline online offline signup login logout email emails screenshot screenshots dataset datasets timestamp timestamps checkbox""".split())
TOK = re.compile(r"\b[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*\b")

msgs = load()
cnt = collections.Counter(); caps = collections.Counter(); ctx = {}; projs = collections.defaultdict(set)
for m in msgs:
    t = clean(m["text"])
    for mm in TOK.finditer(t):
        w = mm.group(0); lw = w.lower()
        bases = {lw} | {lw[:-len(x)] + y for x, y in (("s",""),("es",""),("ed",""),("ed","e"),("ing",""),("ing","e"),("ly",""),("er",""),("ies","y"),("ied","y"),("d","")) if lw.endswith(x)}
        if lw.endswith(("ing","ed")) and len(lw) > 5 and lw[-4] == lw[-5]: bases.add(lw[:-4] if lw.endswith("ing") else lw[:-3])
        contraction = lw in {"doesn","shouldn","isn","wasn","aren","couldn","wouldn","didn","hasn","haven","weren","don","won","ll","ve","re"}
        unknown = (not contraction and not (bases & DICT) and lw not in COMMON_TECH and lw not in STOP and len(lw) > 2)
        midcap = w[0].isupper() and mm.start() > 0 and t[max(0, mm.start() - 2):mm.start()].strip() not in (".", "!", "?", "") and lw not in STOP
        if (unknown or midcap or "-" in w) and not contraction:
            key = lw
            cnt[key] += 1; projs[key].add(m["project"])
            if w[0].isupper(): caps[key] += 1
            if key not in ctx:
                s = t[max(0, mm.start() - 70): mm.end() + 70].replace("\n", " ")
                ctx[key] = s
rows = [(k, c, caps[k], len(projs[k]), ctx[k]) for k, c in cnt.most_common() if c >= 3]
json.dump(rows, open("/tmp/ste-research/raw/coined_candidates.json", "w"), indent=0)
for r in rows[:260]:
    print(f"{r[0]:28s} {r[1]:4d} cap={r[2]:3d} proj={r[3]:2d} | {r[4][:120]}")
