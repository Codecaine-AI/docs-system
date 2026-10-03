"""Shared loading, tokenizing, stopwords, and filler lists."""
import json, re

MSG = "/tmp/ste-research/raw/messages.jsonl"


def load():
    return [json.loads(l) for l in open(MSG)]


URL_RE = re.compile(r"https?://\S+|\S+@\S+\.\S+|(?:~|/Users)/\S+|\b[a-f0-9]{7,40}\b")
TOKEN_RE = re.compile(r"[a-z][a-z0-9]*(?:[-'][a-z0-9]+)*")


def clean(t):
    return URL_RE.sub(" ", t)


def tokens(t):
    return TOKEN_RE.findall(clean(t).lower().replace("’", "'"))


STOP = set("""
a about above after again against all am an and any are aren't as at be because been before being below between both but by
can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't
have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't
it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own
same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's
these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were
weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're
you've your yours yourself yourselves also just will yes yeah ok okay please thanks thank sure maybe really actually basically right
get got getting go going gonna goes went make makes making made want wanted wants wanting need needs needed needing think thinking
thought know knew let see seeing seen look looking looks looked say said saying says use using used uses like likes liked
thing things stuff something anything everything nothing way ways lot lots bit kind sort whatnot guess mean means meant
one two three four five first second also still even well much many now new good great better best fine able
can't won't isn't would've could've should've there'd it'd that'd we'd who'd i'd
take takes took put puts come comes came give gives gave keep keeps try trying tried tell told find found work works working worked
seems seem seemed probably likely definitely sure though although however already really pretty quite currently instead
etc e g ie eg im dont doesnt didnt cant wont isnt thats whats theres youre were ive id ill lets
being been is are was were be am do does did done have has had
here there where when why how what which who whom whose
other another each every any some all both either neither
yet ever never always often sometimes usually again back around away
time times day days today tomorrow yesterday
point part parts end side top bottom left right
s t d ll m re ve
""".split())

FILLER_PATTERNS = {
    "like (filler)": r"\blike,|,\s*like\b|\bit's like\b|\bjust like\b|\blike just\b|\blike the\b",
    "like (all uses)": r"\blike\b",
    "kind of": r"\bkind of\b",
    "sort of": r"\bsort of\b",
    "whatnot": r"\bwhatnot\b",
    "and such": r"\band such\b",
    "or something (like that)": r"\bor something\b",
    "things like that": r"\b(things|stuff|something) like that\b",
    "I guess": r"\bi guess\b",
    "I think": r"\bi think\b",
    "just": r"\bjust\b",
    "basically": r"\bbasically\b",
    "actually": r"\bactually\b",
    "essentially": r"\bessentially\b",
    "okay/ok (opener)": r"(^|[.!?]\s+)(okay|ok)\b",
    "yeah": r"\byeah\b",
    "gonna": r"\bgonna\b",
    "um/uh": r"\b(um|uh)\b",
    "the idea (here) is": r"\bthe idea (here )?is\b",
    "in the sense that": r"\bin the sense that\b",
    "please": r"\bplease\b",
}
FILLER_WORDS = {"like", "kind", "sort", "whatnot", "guess", "basically", "actually", "essentially", "okay", "ok", "yeah", "gonna", "um", "uh", "just"}
