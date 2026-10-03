"""Count synonym-cluster variants (message frequency + total hits) and pull short example quotes."""
import json, re, random, collections

IN = '/tmp/ste-research/raw/codex-human.jsonl'
OUT = '/tmp/ste-research/raw/codex-synonyms.json'

CLUSTERS = {
    'documentation (the corpus)': {
        'docs': r'\bdocs\b', 'doc (noun)': r'\b(the|a|this|that|each|top-level|html|design) doc\b',
        'documentation': r'\bdocumentation\b', 'documents': r'\bdocuments?\b(?! system)',
        'knowledge base': r'\bknowledge base\b', 'write-up': r'\bwrite-?ups?\b',
    },
    'docs system (the product)': {
        'docs system': r'\bdocs system\b', 'doc system': r'\bdoc system\b',
        'documentation system': r'\bdocumentation system\b', 'docs framework': r'\bdocs? framework\b',
        'docs site / docs viewer': r'\bdocs? (site|viewer|app)\b',
    },
    'sub-agent': {
        'sub-agent': r'\bsub-agents?\b', 'subagent': r'\bsubagents?\b', 'sub agent': r'\bsub agents?\b',
        'worker': r'\bworkers?\b', 'child agent': r'\bchild agents?\b', 'helper agent': r'\bhelper agents?\b',
    },
    'the language model': {
        'model': r'\bmodels?\b', 'LLM': r'\bllms?\b', 'AI': r'\bai\b', 'agent': r'\bagents?\b',
    },
    'conversation unit': {
        'thread': r'\bthreads?\b', 'session': r'\bsessions?\b', 'conversation': r'\bconversations?\b',
        'chat': r'\bchats?\b', 'context window': r'\bcontext window\b',
    },
    'instruction text sent to an agent': {
        'prompt': r'\bprompts?\b', 'message': r'\bmessages?\b', 'instructions': r'\binstructions\b',
        'kickoff / handoff': r'\b(kick-?off|hand-?off)s?\b', 'directive': r'\bdirectives?\b',
    },
    'unit of planned work': {
        'objective': r'\bobjectives?\b', 'goal': r'\bgoals?\b', 'task': r'\btasks?\b', 'plan': r'\bplans?\b',
        'ticket': r'\btickets?\b', 'todo': r'\bto-?dos?\b', 'spec': r'\bspecs?\b',
    },
    'code container': {
        'repo': r'\brepos?\b', 'repository': r'\brepositor(y|ies)\b', 'codebase': r'\bcode ?base\b',
        'project': r'\bprojects?\b', 'workspace': r'\bworkspaces?\b',
    },
    'folder': {
        'folder': r'\bfolders?\b', 'directory': r'\bdirector(y|ies)\b', 'dir': r'\bdirs?\b',
    },
    'user interface': {
        'UI': r'\bui\b', 'frontend': r'\bfront[- ]?end\b', 'interface': r'(?<!user )\binterface\b',
        'user interface': r'\buser interface\b', 'dashboard': r'\bdashboards?\b', 'viewer': r'\bviewers?\b',
    },
    'side region of the screen': {
        'sidebar': r'\bsidebars?\b', 'side bar': r'\bside bars?\b', 'side panel': r'\bside panels?\b',
        'side peek': r'\bside peek\b', 'drawer': r'\bdrawers?\b', 'panel': r'(?<!side )\bpanels?\b',
    },
    'pop-up surface': {
        'modal': r'\bmodals?\b', 'dialog': r'\bdialogs?\b', 'popup': r'\bpop-?ups?\b|\bpop ups?\b',
        'overlay': r'\boverlays?\b', 'popover': r'\bpopovers?\b',
    },
    'heading text': {
        'header': r'\bheaders?\b', 'heading': r'\bheadings?\b', 'title': r'\btitles?\b',
        'subheader': r'\bsub-?headers?\b', 'label': r'\blabels?\b',
    },
    'reusable doc unit': {
        'component': r'\bcomponents?\b', 'block': r'\bblocks?\b', 'widget': r'\bwidgets?\b', 'element': r'\belements?\b',
    },
    'drawn picture of a structure': {
        'diagram': r'\bdiagrams?\b', 'canvas': r'\bcanvas(es)?\b', 'chart': r'\bcharts?\b',
        'visual': r'\bvisuals?\b', 'visualization': r'\bvisuali[sz]ations?\b', 'graph': r'\bgraphs?\b',
    },
    'remove': {
        'remove': r'\bremov(e|es|ed|ing)\b', 'delete': r'\bdelet(e|es|ed|ing)\b', 'get rid of': r'\bget rid of\b',
        'drop': r'\bdrop(s|ped|ping)?\b', 'kill': r'\bkill(s|ed|ing)?\b', 'rip out': r'\brip(ped)? out\b',
        'clean up / clear out': r'\bclean(ed|ing)? (up|out)\b|\bclear(ed|ing)? out\b',
    },
    'create': {
        'create': r'\bcreat(e|es|ed|ing)\b', 'add': r'\badd(s|ed|ing)?\b', 'build': r'\bbuild(s|ing)?\b|\bbuilt\b',
        'set up': r'\bset(ting)? up\b|\bsetup\b', 'generate': r'\bgenerat(e|es|ed|ing)\b', 'spin up': r'\bspin(ning)? up\b',
        'scaffold': r'\bscaffold', 'make (a/an/the)': r'\bmak(e|ing) (a|an|the)\b',
    },
    'change': {
        'update': r'\bupdat(e|es|ed|ing)\b', 'change': r'\bchang(e|es|ed|ing)\b', 'adjust': r'\badjust(s|ed|ing)?\b',
        'modify': r'\bmodif(y|ies|ied|ying)\b', 'edit': r'\bedit(s|ed|ing)?\b', 'tweak': r'\btweak(s|ed|ing)?\b',
    },
    'verify': {
        'verify': r'\bverif(y|ies|ied|ying)\b', 'check': r'\bcheck(s|ed|ing)?\b', 'confirm': r'\bconfirm(s|ed|ing)?\b',
        'validate': r'\bvalidat(e|es|ed|ing)\b', 'audit': r'\baudit(s|ed|ing)?\b', 'double check / sanity check': r'\b(double|sanity)[- ]check',
        'make sure': r'\bmake sure\b', 'ensure': r'\bensur(e|es|ed|ing)\b',
    },
    'investigate': {
        'look into': r'\blook(ing)? into\b', 'investigate': r'\binvestigat(e|es|ed|ing)\b', 'dig into': r'\bdig(ging)? into\b',
        'figure out': r'\bfigur(e|ing) out\b', 'explore': r'\bexplor(e|es|ed|ing)\b', 'research': r'\bresearch\b',
        'audit': r'\baudit\b',
    },
    'start a process': {
        'run': r'\brun(s|ning)?\b', 'start': r'\bstart(s|ed|ing)?\b', 'kick off': r'\bkick(ed|ing)? off\b',
        'launch': r'\blaunch(es|ed|ing)?\b', 'spin up': r'\bspin(ning)? up\b', 'execute': r'\bexecut(e|es|ed|ing)\b',
        'trigger': r'\btrigger(s|ed|ing)?\b', 'fire off': r'\bfir(e|ing) off\b',
    },
    'stop a process': {
        'stop': r'\bstop(s|ped|ping)?\b', 'kill': r'\bkill(s|ed|ing)?\b', 'pause': r'\bpaus(e|es|ed|ing)\b',
        'cancel': r'\bcancel(s|ed|led|ing)?\b', 'abort': r'\babort', 'halt': r'\bhalt',
    },
    'make simpler': {
        'simplify': r'\bsimplif(y|ies|ied|ying)\b', 'clean up': r'\bclean(ed|ing)? up\b', 'declutter': r'\bdeclutter',
        'streamline': r'\bstreamlin', 'condense': r'\bcondens', 'consolidate': r'\bconsolidat', 'trim': r'\btrim(med|ming)?\b',
    },
    'something wrong': {
        'bug': r'\bbugs?\b', 'issue': r'\bissues?\b', 'error': r'\berrors?\b', 'problem': r'\bproblems?\b',
        'regression': r'\bregressions?\b', 'broken': r'\bbroken\b', 'failure': r'\bfailures?\b',
    },
    'configuration': {
        'config': r'\bconfigs?\b', 'configuration': r'\bconfigurations?\b', 'settings': r'\bsettings\b',
        'options': r'\boptions\b', 'env / env vars': r'\benv( vars?)?\b',
    },
    'reusable agent capability': {
        'skill': r'\bskills?\b', 'tool': r'\btools?\b', 'plugin': r'\bplug-?ins?\b', 'MCP': r'\bmcps?\b',
        'script': r'\bscripts?\b', 'command': r'\bcommands?\b', 'CLI': r'\bcli\b',
    },
    'explain': {
        'explain': r'\bexplain', 'walk me through': r'\bwalk (me|us) through\b', 'help me understand': r'\bhelp me understand\b',
        'break down': r'\bbreak(ing)? (it |this |that )?down\b', 'summarize': r'\bsummari[sz]', 'describe': r'\bdescrib',
    },
    'written result of work': {
        'report': r'\breports?\b', 'summary': r'\bsummar(y|ies)\b', 'status update': r'\bstatus update', 'overview': r'\boverviews?\b',
        'recap': r'\brecap', 'findings': r'\bfindings\b', 'results': r'\bresults?\b',
    },
    'design before building': {
        'brainstorm': r'\bbrainstorm', 'plan': r'\bplan(s|ning|ned)?\b', 'design': r'\bdesign(s|ing|ed)?\b',
        'outline': r'\boutlin', 'map out': r'\bmap(ping)? (it |this |that )?out\b', 'think through': r'\bthink(ing)? through\b',
    },
    'ship code': {
        'commit': r'\bcommit(s|ted|ting)?\b', 'push': r'\bpush(es|ed|ing)?\b', 'PR': r'\bprs?\b',
        'pull request': r'\bpull requests?\b', 'merge': r'\bmerg(e|es|ed|ing)\b', 'land': r'\bland(ed|ing)?\b', 'ship': r'\bship(ped|ping)?\b',
    },
    'parallel isolated checkout': {
        'branch': r'\bbranch(es)?\b', 'worktree': r'\bworktrees?\b', 'work tree': r'\bwork trees?\b',
    },
    'arrangement of parts': {
        'structure': r'\bstructur(e|es|ed)\b', 'layout': r'\blayouts?\b', 'shape': r'\bshapes?\b',
        'format': r'\bformat(s|ted|ting)?\b', 'schema': r'\bschemas?\b', 'organization': r'\borgani[sz](e|ation)',
    },
    'one segment of a process': {
        'phase': r'\bphases?\b', 'stage': r'\bstages?\b', 'step': r'\bsteps?\b', 'pass': r'\bpass(es)?\b(?! (it|that|this|in))',
        'round': r'\brounds?\b', 'epoch': r'\bepochs?\b',
    },
    'dataset': {'dataset': r'\bdatasets?\b', 'data set': r'\bdata sets?\b'},
    'rules for writing/code': {
        'standards': r'\bstandards?\b', 'guidelines': r'\bguidelines?\b', 'rules': r'\brules?\b',
        'conventions': r'\bconventions?\b', 'style guide': r'\bstyle guides?\b', 'guidance': r'\bguidance\b',
    },
    'root of a tree': {
        'top level / top-level': r'\btop[- ]level\b', 'root': r'\broot\b',
    },
    'file listing': {
        'file tree': r'\bfile trees?\b', 'folder structure': r'\bfolder structures?\b',
        'directory structure': r'\bdirectory structures?\b', 'file structure': r'\bfile structures?\b',
    },
}

BAD = re.compile(r'https?://|@|/Users|\$|\bbank\b|venmo|amazon|credit card|household|password|token|api key|fuck|shit|jesus|\d{3,}|ccbcu|kurate|linkt|mplrisk|roman|frankie|birmingham|corporate|liability|budget|spending|merchant|\bford\b|lascari|firewalla|netgear|wi-?fi', re.I)
HUMANM = re.compile(r"\b(i|we|we're|i'm|can you|could you|can we|please|okay|let's|our)\b", re.I)


def sentences(text):
    for s in re.split(r'(?<=[.!?])\s+|\n+', text):
        s = s.strip(' -*>#')
        if s:
            yield s


def quote_for(msgs, rx):
    for m in msgs:
        if not HUMANM.search(m):
            continue
        for s in sentences(m):
            if BAD.search(s) or not HUMANM.search(s):
                continue
            mt = rx.search(s)
            if not mt:
                continue
            words = s.split()
            if len(words) < 5:
                continue
            if len(words) <= 15:
                return s
            # window of 15 words around the match
            pre = len(s[:mt.start()].split())
            start = max(0, min(pre - 6, len(words) - 15))
            return '... ' + ' '.join(words[start:start + 15]) + ' ...'
    return ''


def main():
    msgs = [json.loads(l)['prose'] for l in open(IN)]
    random.seed(7)
    shuffled = msgs[:]
    random.shuffle(shuffled)
    shuffled.sort(key=lambda m: abs(len(m) - 160))  # prefer short messages for quotes
    low = [m.lower() for m in msgs]
    res = {}
    for cname, variants in CLUSTERS.items():
        rows = []
        for vname, pat in variants.items():
            rx = re.compile(pat, re.I)
            df = sum(1 for m in low if rx.search(m))
            tot = sum(len(rx.findall(m)) for m in low)
            rows.append({'variant': vname, 'msgs': df, 'hits': tot, 'quote': quote_for(shuffled, rx) if df else ''})
        rows.sort(key=lambda r: -r['msgs'])
        res[cname] = rows
    json.dump(res, open(OUT, 'w'), indent=1, ensure_ascii=False)
    for c, rows in res.items():
        print('##', c)
        for r in rows:
            print(f"  {r['variant']}: {r['msgs']}/{r['hits']} | {r['quote'][:120]}")


main()
