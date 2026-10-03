"""Find wording / writing-style corrections and preferences in human messages."""
import json, re, collections

IN = '/tmp/ste-research/raw/codex-human.jsonl'
OUT = '/tmp/ste-research/raw/codex-pref-candidates.jsonl'

PATTERNS = {
    'naming': r"\b(don'?t call (it|them|this)|call (it|them|this) (a |an |the )?\w+|instead of (calling|naming|saying)|rename[ds]?\b|naming|what (we|should we) call|the name (of|for)|named? (it|this|them) )",
    'i-mean': r"\b(i mean[t]? (more )?(like )?\w+ (not|rather|instead)|not \w+,? but|what i meant|i meant)\b",
    'verbosity': r"\b(too (verbose|wordy|long|much text|dense|technical)|verbose|wordy|concise|terse|succinct|shorter|brevity|less text|fewer words|walls? of text|too much (text|content|information|going on))\b",
    'plain': r"\b(plain (english|language|text)|simple (english|language|terms)|jargon|human[- ]readable|readable|easier to (read|understand)|hard to (read|understand)|layman|non-?technical|eli5|dumb (it )?down)\b",
    'style': r"\b(writing style|write (it )?like|tone|voice|phrasing|wording|word choice|sentences?|paragraphs?|bullet ?points?|em[- ]?dash|semicolon|headers? should|formatting|markdown)\b",
    'ai-slop': r"\b(sounds? like (ai|a robot|chatgpt)|ai slop|slop|fluff|filler|buzzwords?|marketing (speak|language)|corporate)\b",
    'language-hedging': r"\b(hedg(e|ing)|language around|this language|the language)\b",
    'clarity': r"\b(confusing|unclear|clear(er)? (name|label|wording)|ambiguous|what does .{1,30} mean)\b",
}
BAD = re.compile(r'https?://|@|/Users|bank|venmo|amazon|credit card|household|password|token|api key', re.I)


def main():
    out = open(OUT, 'w')
    c = collections.Counter()
    for l in open(IN):
        m = json.loads(l)['prose']
        for s in re.split(r'(?<=[.!?])\s+|\n+', m):
            s = s.strip(' -*>#')
            if not s or BAD.search(s):
                continue
            for k, p in PATTERNS.items():
                if re.search(p, s, re.I):
                    c[k] += 1
                    out.write(json.dumps({'cat': k, 's': s[:300]}, ensure_ascii=False) + '\n')
                    break
    print(c)


main()
