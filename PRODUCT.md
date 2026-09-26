# Product

## Register

product

## Users

독립 AI 상담을 운영하는 AP 사업자, 사이트·직접 문의·예약을 운영하는 Field 사업자, 각 고객, AP 제휴 매체와 제품별 관리자. 각 역할은 자기 제품의 업무와 권한 범위에서 작업한다.

## Product Purpose

AP는 Field 없이 외부 사이트에 설치할 수 있는 사업 AI와 상담 운영 서비스다. Field는 AP 없이 사이트 제작, 직접 문의와 예약을 운영하는 서비스다. 연결은 공개 계약과 양쪽 동의를 통해 제공한다. 상세 제품 기준은 `docs/00_PRODUCT_ARCHITECTURE.md`, `docs/01_AGENT_PLATFORM_PRD.md`, `docs/02_FIELD_PRD.md`를 따른다.

## Brand Personality

차분함, 명료함, 신뢰감. 사용자가 지금 저장·공개·전달·확정 중 어느 상태인지 바로 이해할 수 있는 업무 도구다.

## Anti-references

`reference/field_ui_prototype_v3.html`의 시각 언어는 유지하되 운영 화면에서 단일 계정 역할 전환, 공유 DB, 샘플 영업 데이터, 동작하지 않는 성공 표시를 사용하지 않는다. 별도 제품을 한 관리실의 탭으로 합치지 않는다.

## Design Principles

- 제품별 소유권과 권한을 화면 이동·출처·상태에 드러낸다.
- 처음 사용한 사업자에게 실제 빈 상태와 다음 행동을 보여준다.
- 입력, 서버 저장, 승인, 공개, 전달, 확정, 발송의 단계를 구분한다.
- 고객이 AP 또는 Field를 쓰기 위해 다른 제품에 가입하게 하지 않는다.
- 외부 연동 실패가 독립 제품의 직접 경로를 막지 않게 한다.

## Accessibility & Inclusion

표시 글자 최소 14px, 본문·입력 16px, 조작 영역 약 44px. 320·390·768·1440px, 200% 확대, 키보드, 스크린리더, 동작 감소 환경을 검수한다. `docs/05_UI_MIGRATION_MAP.md`의 UI 계약을 따른다.
