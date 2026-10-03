#!/usr/bin/env python3
"""Find wording/style corrections and preference statements; dump candidates for curation."""
import json, re, sys
sys.path.insert(0, "/tmp/ste-research/scripts")
from common import load, clean

PATTERNS = {
    "naming": r"don'?t call (it|this|them)|call (it|this|them) |instead of (calling|saying|it saying)|rename|naming|we('re| are) calling|i mean\b|i meant\b|not .{1,30} but\b|should be called|is called",
    "stop/avoid": r"stop (saying|using|adding|writing|doing)|don'?t (use|say|write|add|need|want|like)|never (use|say|write)|get rid of|remove the|no more",
    "dislike": r"i hate|i don'?t (really )?like|i dislike|annoying|ugly|gross|weird|not great|too (verbose|long|wordy|dense|much|many|busy|cluttered|small|big)|hard to (read|follow|understand|scan|parse)|confusing|confused|cluttered|noisy|wall of text|slop|jargon|fluff|filler|em[- ]?dash|semicolon",
    "want-style": r"write (it|this|them) (like|in|as)|in the style|style (that|i) like|plain (english|language|text)|concise|simple|simpler|clearer|clear|readab|easier to (read|scan|follow|understand|parse)|technical writing|tone|voice|wording|phrasing|terminology|vocabulary|glossary|consistent|consistency|bullets?|sub-?bullets?|headings?|headers?",
}
rx = {k: re.compile(v, re.I) for k, v in PATTERNS.items()}
WRITING = re.compile(r"\b(doc|docs|write|writ|wording|word|phrase|term|name|call|style|read|text|copy|bullet|heading|header|sentence|paragraph|prose|tone|verbose|concise|jargon|slop|label|title|description)", re.I)
sent_split = re.compile(r"(?<=[.!?])\s+|\n+")

hits = []
for m in load():
    t = clean(m["text"])
    for s in sent_split.split(t):
        s = s.strip()
        if len(s) < 12:
            continue
        cats = [k for k, r in rx.items() if r.search(s)]
        if not cats:
            continue
        hits.append({"project": m["project"], "ts": m["ts"], "cats": cats, "writing": bool(WRITING.search(s)),
                     "sentence": s[:400]})
json.dump(hits, open("/tmp/ste-research/raw/correction_candidates.json", "w"), indent=1)
print(len(hits), "candidate sentences;", sum(h["writing"] for h in hits), "writing-related")
