# 설계용 계약 예제 생성기(2026-09-24 문서 패키지). 여기서 만드는 event_envelope/action_request/knowledge_snapshot 스키마·예제는
# 설계 기준이며 실제 서버 envelope(uuid event_id, notification_owner_product·route_generation 등)와 다르다. 실제 계약은 *.openapi.json과 docs/03.
# 주의: contracts/CONTRACT_NOTES.md는 이후 손으로 갱신된 문서이므로 이미 있으면 덮어쓰지 않는다(아래 가드).
from pathlib import Path
import json, copy
from jsonschema import Draft202012Validator, FormatChecker
R=Path(__file__).resolve().parents[1]/'contracts'
ID={'type':'string','minLength':1,'maxLength':160,'pattern':'^[A-Za-z0-9_.:-]+$'}
DT={'type':'string','format':'date-time'}
def obj(props,required=None):return {'type':'object','additionalProperties':False,'properties':props,'required':required or list(props)}
event=obj({
'spec_version':{'const':'1.0'},'event_id':ID,
'event_type':{'enum':['field.facts.changed','field.request.accepted','field.reservation.proposed','field.reservation.confirmed','field.reservation.changed','field.reservation.canceled','agent.conversation.updated','agent.action.delivery_updated','agent.notification.updated','connection.revoked']},
'source_product':{'enum':['field','agent_platform']},'connection_id':ID,'aggregate_type':{'enum':['facts','request','reservation','conversation','action','notification','connection']},'aggregate_id':ID,'aggregate_version':{'type':'integer','minimum':1},'occurred_at':DT,'correlation_id':ID,
'data':obj({'resource_id':ID,'status':{'type':'string','maxLength':80},'source_revision':{'type':'integer','minimum':1},'route_generation':{'type':'integer','minimum':1}},['resource_id','status'])})
action=obj({
'action_request_id':ID,'connection_id':ID,'kind':{'enum':['inquiry','reservation_request']},'origin_conversation_id':ID,
'external_service_id':ID,'expected_service_revision':{'type':'integer','minimum':1},
'customer':obj({'name':{'type':'string','minLength':1,'maxLength':80},'phone':{'type':'string','pattern':'^01[0-9]{8,9}$'},'verified':{'const':False}}),
'request':obj({'mode':{'enum':['inquiry','preferred','slot']},'timezone':{'const':'Asia/Seoul'},'preferences':{'type':'array','maxItems':3,'items':{'type':'string','maxLength':160}},'start_at':DT,'end_at':DT},['mode','timezone']),
'consent':obj({'version':ID,'record_id':ID,'confirmed_at':DT}),
'summary':{'type':'string','minLength':1,'maxLength':4000},
'attachment_refs':{'type':'array','maxItems':5,'items':ID},
'source':obj({'provider':{'const':'agent-platform'},'deployment_id':ID,'is_test':{'type':'boolean'}})},['action_request_id','connection_id','kind','origin_conversation_id','customer','request','consent','summary','attachment_refs','source'])
action['allOf']=[{'if':{'properties':{'kind':{'const':'reservation_request'}}},'then':{'required':['external_service_id','expected_service_revision']}}, {'if':{'properties':{'request':{'properties':{'mode':{'const':'slot'}}}}},'then':{'properties':{'request':{'required':['start_at','end_at']}}}}, {'if':{'properties':{'request':{'properties':{'mode':{'const':'preferred'}}}}},'then':{'properties':{'request':{'required':['preferences'],'properties':{'preferences':{'minItems':1}}}}}}]
knowledge=obj({'connection_id':ID,'source_id':ID,'source_revision':{'type':'integer','minimum':1},'published_at':DT,'content_hash':{'type':'string','pattern':'^sha256:[a-f0-9]{64}$'},'business':obj({'external_org_id':ID,'name':{'type':'string','minLength':1,'maxLength':160},'summary':{'type':'string','maxLength':3000}}),'services':{'type':'array','maxItems':200,'items':obj({'external_service_id':ID,'entity_revision':{'type':'integer','minimum':1},'name':{'type':'string','minLength':1,'maxLength':160},'active':{'type':'boolean'},'price_mode':{'enum':['fixed','from','quote']},'price_krw':{'type':['integer','null'],'minimum':0},'duration_minutes':{'type':['integer','null'],'minimum':1},'booking_mode':{'enum':['none','preferred','slot']}})}})
for name,s in [('event_envelope',event),('action_request',action),('knowledge_snapshot',knowledge)]:
 s['$schema']='https://json-schema.org/draft/2020-12/schema';s['title']=name+' contract design v1.0';
 (R/(name+'.schema.json')).write_text(json.dumps(s,ensure_ascii=False,indent=2))
ex_event={'spec_version':'1.0','event_id':'evt_example_001','event_type':'field.reservation.confirmed','source_product':'field','connection_id':'con_example_001','aggregate_type':'reservation','aggregate_id':'field_reservation_example','aggregate_version':3,'occurred_at':'2026-09-24T10:05:00Z','correlation_id':'ar_example_001','data':{'resource_id':'field_reservation_example','status':'confirmed'}}
ex_action={'action_request_id':'ar_example_001','connection_id':'con_example_001','kind':'reservation_request','origin_conversation_id':'ap_thread_example','external_service_id':'field_service_example','expected_service_revision':7,'customer':{'name':'테스트 고객','phone':'01000000000','verified':False},'request':{'mode':'preferred','timezone':'Asia/Seoul','preferences':['2026-10-10 오전']},'consent':{'version':'transfer-v1','record_id':'consent_example','confirmed_at':'2026-09-24T10:00:00Z'},'summary':'세탁기 청소 일정 문의','attachment_refs':[],'source':{'provider':'agent-platform','deployment_id':'dep_example','is_test':True}}
ex_knowledge={'connection_id':'con_example_001','source_id':'source_field_example','source_revision':11,'published_at':'2026-09-24T09:00:00Z','content_hash':'sha256:'+'0'*64,'business':{'external_org_id':'field_org_example','name':'테스트 사업체','summary':'합성 테스트 데이터입니다.'},'services':[{'external_service_id':'field_service_example','entity_revision':7,'name':'세탁기 청소','active':True,'price_mode':'quote','price_krw':None,'duration_minutes':90,'booking_mode':'preferred'}]}
valid=[]
for name,ex,schema in [('event_envelope',ex_event,event),('action_request',ex_action,action),('knowledge_snapshot',ex_knowledge,knowledge)]:
 Draft202012Validator.check_schema(schema); Draft202012Validator(schema,format_checker=FormatChecker()).validate(ex)
 (R/(name+'.example.json')).write_text(json.dumps(ex,ensure_ascii=False,indent=2));valid.append(name)
checks=[]
def bad(name,ex,schema):
 errors=list(Draft202012Validator(schema,format_checker=FormatChecker()).iter_errors(ex)); assert errors,name;checks.append(name)
x=copy.deepcopy(ex_action);x['customer']['verified']=True;bad('unverified_customer_must_not_be_marked_verified',x,action)
x=copy.deepcopy(ex_event);x['data']['phone']='01000000000';bad('PII_not_allowed_in_event_data',x,event)
x=copy.deepcopy(ex_action);x['kind']='reservation_confirm';bad('confirm_not_an_external_action',x,action)
x=copy.deepcopy(ex_action);x['expected_service_revision']='7';bad('revision_must_be_integer',x,action)
x=copy.deepcopy(ex_action);x['request']={'mode':'slot','timezone':'Asia/Seoul'};bad('slot_requires_start_end',x,action)
x=copy.deepcopy(ex_action);del x['consent'];bad('customer_consent_reference_required',x,action)
x=copy.deepcopy(ex_knowledge);x['business']['private_notes']='secret';bad('private_facts_excluded',x,knowledge)
if not (R/'CONTRACT_NOTES.md').exists(): (R/'CONTRACT_NOTES.md').write_text('''# 계약 예제 사용 안내\n\n이 파일은 연동 명세를 개발 에이전트가 구조화해 읽을 수 있게 제공한 **JSON Schema·합성 예제**입니다. 운영 API 서버, 완성 OpenAPI, 실제 서명 검증기 또는 SDK가 아닙니다.\n\n- event_envelope: 웹훅 최소 메타데이터 계약. 서명/인가/원본 조회는 서버 별도 검증입니다.\n- action_request: 고객 확인 후 외부 문의/예약 요청. 예약 확정 권한이 아닙니다.\n- knowledge_snapshot: 승인된 외부 사실. 예제 hash의 0은 형식 확인용으로 실제 내용 무결성 검증 값이 아닙니다.\n- task_graph / acceptance_catalog: 46개 작업과160개 인수 명세의 기계 판독본입니다.\n\n타임존·번호·날짜·요청의 실제 의미, 고객 동의 진위, 조직 매핑, 스코프, source hash, end>start, 서비스 소요시간, 전화번호 유효성, 예약 충돌은 schema 통과와 별도로 서버에서 확인해야 합니다. 테스트 전화번호로 외부 메시지를 발송하지 마세요.\n\nSchema/example 검사는 문서 패키지 품질 검사이며 서비스 인수 테스트 통과가 아닙니다. 운영 OpenAPI는 C01에서 양쪽 제품 명세를 기준으로 완성하고 소비자/제공자 계약 테스트를 붙입니다.\n''')
(ROOT:=R.parent/'quality_checks'/'schema_check.json').write_text(json.dumps({'schemas_and_examples_valid':valid,'invalid_examples_rejected':checks,'service_tests_run':False},ensure_ascii=False,indent=2))
print('Validated 3 schemas, 3 examples; rejected',len(checks),'invalid payloads')
