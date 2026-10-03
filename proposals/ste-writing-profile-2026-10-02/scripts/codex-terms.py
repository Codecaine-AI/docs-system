"""Curated technical-term list, grouped by domain. Count = messages containing the term (case-insensitive).
Terms were chosen from the n-gram tables (raw/codex-ngrams-*.tsv); regexes fold plural / spelling variants."""
import json, re

IN = '/tmp/ste-research/raw/codex-human.jsonl'
OUT = '/tmp/ste-research/raw/codex-terms.json'

D = {
 'agents / LLMs': [
  ('agent', r'\bagents?\b'), ('prompt', r'\bprompts?\b'), ('worker', r'\bworkers?\b'), ('skill', r'\bskills?\b'),
  ('tool', r'\btools?\b'), ('model', r'\bmodels?\b'), ('context', r'\bcontext\b'), ('session', r'\bsessions?\b'),
  ('thread', r'\bthreads?\b'), ('system prompt', r'\bsystem prompts?\b'), ('sub-agent', r'\bsub[- ]?agents?\b'),
  ('pi agent', r'\bpi[- ]agents?\b'), ('main agent', r'\bmain agent\b'), ('user prompt', r'\buser prompts?\b'),
  ('LLM', r'\bllms?\b'), ('eval', r'\bevals?\b|\bevaluations?\b'), ('trace', r'\btraces?\b|\btracing\b'),
  ('MCP', r'\bmcps?\b'), ('orchestrator', r'\borchestrators?\b'), ('harness', r'\bharness(es)?\b'),
  ('knowledge base', r'\bknowledge base\b'), ('codex', r'\bcodex\b'), ('reasoning / thinking level', r'\b(low|medium|high|x ?high) (thinking|reasoning)\b|\bxhigh\b'),
  ('rate limit', r'\brate limits?\b'), ('tool call', r'\btool calls?\b'), ('agent kernel', r'\bagent kernel\b'),
  ('prompt kit', r'\bprompt ?kit\b'), ('judge', r'\bjudges?\b'), ('conversation', r'\bconversations?\b'),
 ],
 'docs system': [
  ('docs', r'\bdocs\b'), ('page', r'\bpages?\b'), ('section', r'\bsections?\b'), ('doc', r'\bdoc\b'),
  ('markdown / md', r'\bmarkdown\b|\.md\b|\bmd file'), ('component', r'\bcomponents?\b'), ('diagram', r'\bdiagrams?\b'),
  ('bullet point', r'\bbullet[- ]?points?\b|\bbullets?\b'), ('sub-bullet', r'\bsub[- ]?bullets?\b'), ('block', r'\bblocks?\b'),
  ('standards', r'\bstandards\b'), ('file tree', r'\bfile trees?\b'), ('html', r'\bhtml\b'), ('canvas', r'\bcanvas(es)?\b'),
  ('header / subheader', r'\b(sub-?)?headers?\b'), ('readme', r'\breadme\b'), ('docs system / doc system', r'\bdocs? system\b'),
  ('lint / lint rule', r'\blint(s|ing|er)?\b'), ('sequence diagram', r'\bsequence diagrams?\b'), ('ASCII diagram', r'\bascii\b'),
  ('writing style', r'\bwriting style\b|\bwriting skill\b'), ('documentation', r'\bdocumentation\b'),
  ('docs framework', r'\bdocs? framework\b'), ('design doc', r'\bdesign docs?\b'), ('process outline', r'\bprocess outline\b'),
 ],
 'UI / frontend': [
  ('UI', r'\bui\b'), ('sidebar', r'\bside ?bars?\b'), ('button', r'\bbuttons?\b'), ('tab', r'\btabs?\b'),
  ('viewer', r'\bviewers?\b'), ('layout', r'\blayouts?\b'), ('color', r'\bcolou?rs?\b'), ('click', r'\bclick(s|ed|ing)?\b'),
  ('render', r'\brender(s|ed|ing)?\b'), ('top bar', r'\btop ?bar\b'), ('main menu', r'\bmain menu\b'),
  ('dashboard', r'\bdashboards?\b'), ('screen', r'\bscreens?\b'), ('card', r'\bcards?\b'), ('table', r'\btables?\b'),
  ('row / column', r'\brows?\b|\bcolumns?\b'), ('dropdown', r'\bdrop[- ]?downs?\b'), ('tooltip', r'\btool ?tips?\b'),
  ('side panel', r'\bside panels?\b'), ('frontend', r'\bfront[- ]?end\b'), ('full width', r'\bfull[- ]width\b'),
  ('padding', r'\bpadding\b'), ('collapsible / collapsed', r'\bcollaps(e|ed|ible)\b'), ('title case', r'\btitle case\b'),
  ('light / dark mode', r'\b(light|dark) mode\b'), ('popup / modal', r'\bpop-?ups?\b|\bmodals?\b'), ('landing page', r'\blanding page\b'),
 ],
 'infra / tooling': [
  ('repo', r'\brepos?\b|\brepository\b'), ('PR', r'\bprs?\b|\bpull requests?\b'), ('push', r'\bpush(ed|es|ing)?\b'),
  ('merge', r'\bmerg(e|es|ed|ing)\b'), ('commit', r'\bcommit(s|ted)?\b'), ('branch', r'\bbranch(es)?\b'),
  ('config', r'\bconfigs?\b|\bconfiguration\b'), ('server', r'\bservers?\b'), ('command', r'\bcommands?\b'),
  ('script', r'\bscripts?\b'), ('cache', r'\bcach(e|es|ed|ing)\b'), ('json', r'\bjson\b'), ('CLI', r'\bcli\b'),
  ('API', r'\bapis?\b'), ('database', r'\bdatabases?\b|\bdb\b'), ('git', r'\bgit\b'), ('work tree', r'\bwork ?trees?\b'),
  ('draft PR', r'\bdraft prs?\b'), ('docker container', r'\bdocker\b'), ('local machine', r'\blocal(ly| machine)\b'),
  ('CI', r'\bci\b'), ('dev server', r'\bdev server\b'), ('env', r'\benv\b'), ('endpoint', r'\bendpoints?\b'),
  ('merge conflict', r'\bmerge conflicts?\b'), ('hot reload', r'\bhot reload\b'),
 ],
 'code structure': [
  ('file', r'\bfiles?\b'), ('folder', r'\bfolders?\b'), ('directory', r'\bdirector(y|ies)\b'), ('structure', r'\bstructur(e|es|ed)\b'),
  ('top level', r'\btop[- ]level\b'), ('state', r'\bstate\b'), ('logic', r'\blogic\b'), ('type', r'\btypes?\b'),
  ('implementation', r'\bimplementation\b'), ('code', r'\bcode\b'), ('codebase', r'\bcode ?base\b'), ('function', r'\bfunctions?\b'),
  ('module', r'\bmodules?\b'), ('package', r'\bpackages?\b'), ('schema', r'\bschemas?\b'), ('data model', r'\bdata models?\b'),
  ('vertical slice', r'\bvertical(ly)? slic'), ('naming convention', r'\bnaming conventions?\b'), ('source of truth', r'\bsource of truth\b'),
  ('backwards compatibility', r'\bbackwards? compatib'), ('refactor', r'\brefactor'), ('enum', r'\benums?\b'),
  ('folder structure / file structure', r'\b(folder|file|directory) structures?\b'), ('utils', r'\butils?\b'),
 ],
 'process / workflow': [
  ('run', r'\brun(s|ning)?\b'), ('phase', r'\bphases?\b'), ('update', r'\bupdat(e|es|ed|ing)\b'), ('fix', r'\bfix(es|ed|ing)?\b'),
  ('review', r'\breview(s|ed|ing)?\b'), ('report', r'\breports?\b'), ('objective', r'\bobjectives?\b'), ('issue', r'\bissues?\b'),
  ('error', r'\berrors?\b'), ('step', r'\bsteps?\b'), ('pass', r'\b(first|second|full|initial|secondary|grouping|cleanup|clean-up) pass(es)?\b'),
  ('goal', r'\bgoals?\b'), ('plan', r'\bplans?\b'), ('baseline', r'\bbaselines?\b'), ('epoch', r'\bepochs?\b'),
  ('brainstorm', r'\bbrainstorm'), ('audit', r'\baudit'), ('regression', r'\bregressions?\b'), ('stage', r'\bstages?\b'),
  ('test', r'\btests?\b|\btesting\b'), ('optimization loop', r'\boptimi[sz]ation loop\b'), ('sweep', r'\bsweeps?\b'),
  ('batch', r'\bbatch(es)?\b'), ('full run', r'\bfull (run|pass|process|flow)\b'), ('smoke test', r'\bsmoke test'),
  ('status update', r'\bstatus update'), ('edge case', r'\bedge cases?\b'), ('success / completion criteria', r'\b(success|completion|escalation|evaluation) criteria\b|\bdefinition of done\b'),
  ('kill / restart', r'\bkill\b|\brestart\b'), ('new thread', r'\bnew thread\b'), ('in parallel', r'\bparallel\b'),
 ],
}


def main():
    msgs = [json.loads(l)['prose'].lower() for l in open(IN)]
    res = {}
    for dom, terms in D.items():
        rows = []
        for label, pat in terms:
            rx = re.compile(pat, re.I)
            rows.append((label, sum(1 for m in msgs if rx.search(m))))
        rows.sort(key=lambda r: -r[1])
        res[dom] = rows
    json.dump(res, open(OUT, 'w'), indent=1)
    tot = 0
    for d, rows in res.items():
        tot += len(rows)
        print('##', d, len(rows))
        print('  ' + ' | '.join(f'{a} {b}' for a, b in rows))
    print('total terms', tot)


main()
