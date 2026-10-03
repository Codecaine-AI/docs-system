#!/usr/bin/env python3
"""Count messages per complaint/preference theme about readability and writing."""
import json, re, sys
sys.path.insert(0, "/tmp/ste-research/scripts")
from common import load, clean

THEMES = {
    "confusion (I'm confused / confusing / don't understand)": r"\bconfus\w*|\bdon'?t (really )?understand\b|\btrying to (fully )?understand\b",
    "readability (hard/easier to read, readable)": r"\b(hard|easier|easy|harder) to (read|follow|scan|parse|understand)\b|\breadab\w*",
    "too much / overcomplicated / fluff": r"\btoo (much|many)\b|overcomplicat\w*|\bfluff\b|\btrim\b|\bcluttered\b|\bnoisy\b|\bdense\b",
    "simpler / concise / clean up": r"\bsimpl(er|ify|ified|est)\b|\bconcise(ly)?\b|\bclean(er| up|up)\b",
    "structure: bullets / sub-bullets / headers": r"\bsub-?bullets?\b|\bbullet( point)?s?\b|\bhead(er|ing)s?\b|\btitle case\b",
    "consistency": r"\b(in)?consisten(t|cy|cies)\b",
    "vagueness / precision": r"\bvague\b|\bprecise\w*|\bexact(ly)?\b|\bspecific(ally)?\b",
    "punctuation (em dash / colon / semicolon)": r"\bem[- ]?dash\w*|\bcolons?\b|\bsemicolons?\b",
    "slop / unslop": r"\bslop\w*|\bunslop\w*",
    "naming / nomenclature / verbiage": r"\bnomenclature\b|\bverbiage\b|\bnaming\b|\brenam\w+|\bcall (it|this|them)\b",
    "explain to me / walk me through": r"\bexplain\w*\b|\bwalk (me )?through\b|\bhelp me understand\b",
    "dislike (I don't like / I hate)": r"\bi don'?t (really )?(like|love)\b|\bi hate\b|\bnot great\b|\bgross\b|\bugly\b",
}
msgs = load()
res = {}
for k, p in THEMES.items():
    rx = re.compile(p, re.I)
    hit = [m for m in msgs if rx.search(clean(m["text"]))]
    res[k] = {"messages": len(hit), "projects": len({m["project"] for m in hit})}
json.dump(res, open("/tmp/ste-research/raw/complaint_themes.json", "w"), indent=1)
for k, v in sorted(res.items(), key=lambda kv: -kv[1]["messages"]):
    print(f"{v['messages']:4d} msgs  {v['projects']:2d} projects  {k}")
