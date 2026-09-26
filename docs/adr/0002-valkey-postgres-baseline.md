# ADR 0002 — PostgreSQL 17·Valkey 실행 기준

- 날짜: 2026-09-24
- 상태: 채택 기준, 사용자 후속 결정
- 적용: C02, A/F 제품별 worker·queue·캐시

## 결정

개발과 서버 실행의 공통 데이터 구성은 PostgreSQL 17과 Valkey다. 두 제품은 DB·런타임 계정·비밀값·큐 소비자를 분리한다. 기존 ADR 0001의 `pg-boss` 선택은 사용하지 않는다. 실제 비동기 작업이 필요한 기능을 구현할 때 Valkey 호환 클라이언트와 queue 정책을 선택하고 재시작·재시도·멱등·실패함을 검증한다. PostgreSQL outbox는 원본 업무 상태와 같은 트랜잭션에 기록한다. Field 첫 구현은 Valkey 8.1.10과 `iovalkey` 0.4.0, Field PostgreSQL 작업 원장과 별도 worker를 사용한다.

## 이유와 범위

사용자가 서버와 맞출 로컬 구성으로 PostgreSQL 17·Valkey를 지정했고, 나머지 인증·공급사·운영 기능은 동작하는 서비스를 구현하며 단계적으로 적용하도록 했다. Field mock에서는 PostgreSQL 17과 Field 전용 Valkey 인스턴스·작업 ID 큐를 로컬 검수했다. AP 전용 Valkey와 두 제품의 실제 서버 ACL/복구는 미검증이다. Valkey가 있다는 사실만으로 알림·외부 공급사가 동작한다고 표시하지 않는다.

## 되돌림과 검수

Field 일반 API 시작·readiness에는 Valkey를 필수로 요구하지 않는다. Field 제작 worker는 자체 DB·Valkey·모델 설정을 요구한다. AP-only·Field-only 실행, 상대 큐 접근 거부, outbox 재조정 및 worker 재시작의 전체 제품 검수는 각 제품 큐와 실제 서버 자격증명이 준비되면 수행한다. 실제 서버 버전·토폴로지는 서버 환경 조사로 확인하고, 충돌하면 이 ADR을 수정한다.
