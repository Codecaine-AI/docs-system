#!/usr/bin/env python3
"""(1) Command verbs: the word after 'please' / 'can you (please)' / 'could you (please)' / 'let's'.
(2) Wordy or STE-unapproved forms the user says, to seed the replacement table."""
import collections, json, re, sys
sys.path.insert(0, "/tmp/ste-research/scripts")
from common import load, clean

msgs = load()
CMD = re.compile(r"\b(?:please|can you(?: please)?|could you(?: please)?|let'?s|i need you to|i want you to|go)\s+(?:just\s+|now\s+|also\s+|then\s+)?([a-z]+)(?:\s+(up|out|down|over|through|back|off|in))?", re.I)
SKIP = {"the", "a", "you", "me", "we", "i", "it", "this", "that", "be", "make", "help", "do", "give", "have", "get", "take", "and", "to", "so", "just", "now", "also", "look", "let"}
verbs = collections.Counter()
for m in msgs:
    for v, part in CMD.findall(clean(m["text"]).lower()):
        if v in SKIP and v not in ("make", "look", "help", "get", "give", "do", "have", "take"):
            continue
        verbs[(v + (" " + part if part else ""))] += 1

WORDY = {
    "essentially": r"\bessentially\b", "in the sense that": r"\bin the sense that\b", "in terms of": r"\bin terms of\b",
    "along the lines of": r"\balong the lines of\b", "as well": r"\bas well\b", "in order to": r"\bin order to\b",
    "utilize": r"\butiliz\w*", "leverage": r"\bleverag\w*", "prior to / prior": r"\bprior\b", "ensure": r"\bensur\w*",
    "make sure": r"\bmake sure\b", "figure out": r"\bfigur\w* out\b", "go through": r"\b(go|going|goes|went) through\b",
    "set up (verb)": r"\bset(ting)? up\b", "end to end": r"\bend[- ]to[- ]end\b", "at this point": r"\bat this point\b",
    "currently": r"\bcurrently\b", "properly": r"\bproperly\b", "fully": r"\bfully\b", "obviously": r"\bobviously\b",
    "honestly": r"\bhonestly\b", "ideally": r"\bideally\b", "generally": r"\bgenerally\b", "specifically": r"\bspecifically\b",
    "necessarily": r"\bnecessarily\b", "a little bit": r"\ba little( bit)?\b", "a lot of": r"\ba lot of\b",
    "whatever": r"\bwhatever\b", "stuff": r"\bstuff\b", "thing(s)": r"\bthings?\b", "pieces": r"\bpieces?\b",
    "via": r"\bvia\b", "i.e. / e.g.": r"\b(i\.?e|e\.?g)\b\.?", "-ing progressive (am/is/are/was/were X-ing)": r"\b(am|is|are|was|were|be|been)\s+\w+ing\b",
    "passive (is/are/was/were X-ed)": r"\b(is|are|was|were|be|been|being)\s+\w+ed\b",
}
wordy = {}
for k, p in WORDY.items():
    rx = re.compile(p, re.I)
    wordy[k] = sum(len(rx.findall(clean(m["text"]))) for m in msgs)
json.dump({"command_verbs": verbs.most_common(80), "wordy_forms": wordy}, open("/tmp/ste-research/raw/verbs_wordy.json", "w"), indent=1)
print("COMMAND VERBS:", ", ".join(f"{v}:{c}" for v, c in verbs.most_common(70)))
print()
print("WORDY:", ", ".join(f"{k}:{v}" for k, v in sorted(wordy.items(), key=lambda kv: -kv[1])))
