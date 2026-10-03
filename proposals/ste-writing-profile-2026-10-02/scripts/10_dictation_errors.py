#!/usr/bin/env python3
"""Count likely speech-to-text mis-hearings of project terms (variant -> intended)."""
import json, re, sys
sys.path.insert(0, "/tmp/ste-research/scripts")
from common import load, clean
PAIRS = [
    ("agent colonel", r"\bcolonel\b", "agent kernel"), ("Curate", r"\bCurate\b", "Kurate"),
    ("CCPCU / ccbc use", r"\bccpcu\b|\bccbc use\b", "CCBCU"), ("Tera", r"\btera\b", "Terra"),
    ("fire crawl", r"\bfire ?crawl\b(?!\.)", "Firecrawl"), ("eleven labs / 11 labs", r"\b(eleven|11) labs\b", "ElevenLabs"),
    ("sql light", r"\bsql light\b", "SQLite"), ("cue (for queue)", r"\bcue\b", "queue"), ("unswap", r"\bunswap\b", "unslop"),
    ("on slop", r"\bon slop\b", "unslop"), ("band ingredients", r"\bband ingredients?\b", "banned ingredients"),
    ("zebra scraping", r"\bzebra scraping\b", "zebra striping"), ("emerge conflict", r"\bemerge conflict\b", "merge conflict"),
    ("decob", r"\bdecob\b", "decomp"), ("Quinn", r"\bquinn\b", "Qwen"), ("CLAWD", r"\bclawd\b", "CLAUDE(.md)"),
    ("open sub-agents", r"\bopen sub-?agents\b", "Opus sub-agents"), ("Jeff / J-E-V", r"\bJ-E-V\b", "Jev"),
    ("seperate", r"\bseperate\b", "separate (typo)"), ("youeself/impleemnt/layour", r"\b(youeself|impleemnt|layour|recieving|everythign)\b", "typos"),
]
msgs = load()
res = []
for label, pat, intended in PAIRS:
    r = re.compile(pat, re.I if label not in ("Curate",) else 0)
    c = sum(len(r.findall(clean(m["text"]))) for m in msgs)
    res.append({"heard": label, "intended": intended, "count": c})
json.dump(res, open("/tmp/ste-research/raw/dictation_errors.json", "w"), indent=1)
for r in res: print(f"{r['count']:4d}  {r['heard']:28s} -> {r['intended']}")
