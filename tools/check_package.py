from pathlib import Path
import re,json,hashlib
from collections import deque
from jsonschema import Draft202012Validator,FormatChecker
R=Path(__file__).resolve().parents[1]
tasks=json.loads((R/'contracts/task_graph.json').read_text()); ids={t['id'] for t in tasks};edges={t['id']:t['deps'] for t in tasks}
assert len(ids)==46
seen=set();stack=set(); topo=[]
def dfs(i):
 assert i not in stack,'task cycle '+i
 if i in seen:return
 stack.add(i)
 for d in edges[i]:assert d in ids;dfs(d)
 stack.remove(i);seen.add(i);topo.append(i)
for i in edges:dfs(i)
def deps(i):
 r={i}
 for d in edges[i]:r|=deps(d)
 return r
independence={}
for rel,forbidden in [('A11',('F','I','D')),('F11',('A','I','D')),('D05',('F','I'))]:
 cs=deps(rel); violations=[i for i in cs if i.startswith(forbidden)];assert not violations
 independence[rel]={'dependencies':sorted(cs),'forbidden_prefixes':list(forbidden),'violations':violations}
qa=json.loads((R/'contracts/acceptance_catalog.json').read_text());assert len(qa)==160;assert {x['id'] for x in qa}=={f'QA{i:02d}' for i in range(1,161)};assert all(x['status']=='not_run' for x in qa)
master=R/'AI_Field_Service_Operator_Final_Development_Plan_v3.0.md';s=master.read_text();
assert len(re.findall(r'^\| QA\d+ \|',s,re.M))==160
assert 'Field의 ‘사이트를 만들어주는 AI’는 Field 소유' in s
assert '공유 DB의 원자적 전환' in s
assert '기본 위젯' in s
assert '160개 서비스 인수 항목은 **not_run**' in s
assert s.count('```')%2==0
# Standard markdown inline file links only; URLs are citations, not downloaded or checked here.
checked=[]
ignored_dirs={'node_modules','.git','.venv','dist','.next'}
for p in R.rglob('*.md'):
 if any(part in ignored_dirs for part in p.relative_to(R).parts):continue
 text=p.read_text()
 for label,dst in re.findall(r'\[([^\]]+)\]\(([^)]+)\)',text):
  if re.match(r'^[a-zA-Z]+:',dst) or dst.startswith('#'):continue
  target=(p.parent/dst.split('#')[0]).resolve();assert target.exists(),(p,dst);checked.append(str(target.relative_to(R)))
for fn in ['event_envelope','action_request','knowledge_snapshot']:
 schema=json.loads((R/'contracts'/f'{fn}.schema.json').read_text());Draft202012Validator.check_schema(schema)
 ex=json.loads((R/'contracts'/f'{fn}.example.json').read_text());Draft202012Validator(schema,format_checker=FormatChecker()).validate(ex)
# Cover every original decision and boundary.
architecture=(R/'docs/00_PRODUCT_ARCHITECTURE.md').read_text()
assert all(re.search(rf'^\| {i:02d} \|',architecture,re.M) for i in range(1,22))
assert all(f'| B{i:02d} |' in architecture for i in range(1,13))
result={'status':'passed','scope':'document_package_only','service_tests_executed':False,'tasks':len(tasks),'acceptance_specs':len(qa),'legacy_qa_ids_preserved':120,'new_qa_specs':40,'decision_rows':21,'boundary_rules':12,'task_dag_acyclic':True,'independence':independence,'schemas_valid':3,'links_checked':checked,'master_bytes':master.stat().st_size,'master_lines':len(s.splitlines())}
(R/'quality_checks/document_structure.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in result.items() if k not in ['independence','links_checked']},ensure_ascii=False,indent=2))
