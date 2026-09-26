# 계약 예제 사용 안내

이 디렉터리는 연동 명세의 **JSON Schema·합성 예제**와 구현 중인 AP/Field 공개 API의 `agent-integrator-v1.openapi.json`·`field-integrator-v1.openapi.json` 미리보기를 제공합니다. Field 미리보기 preview.8에는 현재 동작하는 bearer 읽기, 승인된 FAQ와 명시 binding 경로가, AP 미리보기 preview.8에는 연결별 source 버전·갱신 요청/상태, Field 서명 `facts.changed` 수신, 연결 해제 후 서명된 사건 상태 복구 조회와 예약별 세대 1 종료 영수증이 포함됩니다. 정보 동기화·설치·업무 요청을 포함한 완성 OpenAPI 또는 SDK가 아니며 실제 서명 검증은 각 제품 서버 구현에서 수행합니다.

- event_envelope: 웹훅 최소 메타데이터 계약. 서명/인가/원본 조회는 서버 별도 검증입니다.
- action_request: 고객 확인 후 외부 문의/예약 요청. 예약 확정 권한이 아닙니다.
- knowledge_snapshot: 승인된 외부 사실. 예제 hash의 0은 형식 확인용으로 실제 내용 무결성 검증 값이 아닙니다.
- task_graph / acceptance_catalog: 46개 작업과160개 인수 명세의 기계 판독본입니다.

타임존·번호·날짜·요청의 실제 의미, 고객 동의 진위, 조직 매핑, 스코프, source hash, end>start, 서비스 소요시간, 전화번호 유효성, 예약 충돌은 schema 통과와 별도로 서버에서 확인해야 합니다. 테스트 전화번호로 외부 메시지를 발송하지 마세요.

Schema/example 검사는 문서 패키지 품질 검사이며 서비스 인수 테스트 통과가 아닙니다. `pnpm test:spike:contracts:agent`와 `pnpm test:spike:contracts:field`는 각 미리보기의 정적 검사와 실제 제품 DB/API 제공자 검사를 실행합니다. `pnpm test:contracts`는 현재 정적 계약과 제품별 DB 소비자 검사를 로컬에서 실행하고, `pnpm test:spike:ap-field:http`는 별도 두 mock 서버의 양방향 OAuth·Field bind·source refresh·서명된 Field 정보 변경을 검수합니다. 운영 공급사·버전 호환성·전체 소비자 계약/출시 게이트는 C01에서 계속 검수해야 합니다.
