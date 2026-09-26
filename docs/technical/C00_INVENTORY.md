# C00 저장소·환경 인벤토리 — 2026-09-24

## 범위와 근거

- 작업: C00 / 계약·조율. 요구 B01~B12, QA115·QA116.
- 조사 명령: `rg --files -uu`, `find . -maxdepth 4`, `git status --short --branch`, `node --version`, `pnpm --version`, `docker info`, `docker ps`, `gh search repos`, 환경변수 **이름만** 확인.
- 조사 위치: `/Users/jr/Desktop/projects/FieldAI`. 다른 서버·계정·운영 DB는 조사하지 않았다.

## 확인한 현재 상태

| 항목 | 관찰 |
|---|---|
| Git | 이 폴더와 상위 경로에 `.git`이 없어 Git 저장소가 아니다. 사용자 미커밋 변경 여부는 판정할 수 없다. |
| 자료 | `AGENTS.md`, `TASKS.md`, 마스터 v3.0, 분할 문서 00~06, `contracts/` JSON Schema·합성 예제·QA/작업 카탈로그, HTML UI 시안이 있다. |
| 코드·테스트 | 서비스 앱, `package.json`, 잠금 파일, 앱 DB migration, 앱 테스트, CI 설정이 없다. `tools/`와 `quality_checks/`는 문서 패키지 생성·검사 자료다. |
| 실행 환경 | Node v24.18.0, pnpm v10.33.4, npm v11.16.0, Docker CLI v29.6.2/서버 v29.5.2. 로컬 `psql`/`postgres` 실행 파일은 없다. |
| Docker | 다른 프로젝트의 컨테이너가 실행 중이다. 해당 컨테이너·볼륨·포트는 변경하지 않는다. |
| 환경변수 | 현재 프로세스에 `AP_`, `FIELD_`, `KAKAO_`, `DATABASE_`, `POSTGRES_`, `OPENAI_` 등 접두어의 자격증명 이름은 없었다. 값은 조회·출력하지 않았다. |
| 운영 데이터 | 이 폴더 안에는 확인되지 않았다. 외부 호스트·실서비스·운영 DB의 존재 여부는 미확인이다. 따라서 QA115의 운영 이행을 N/A로 확정하지 않는다. |

## 보존·변경 경계

- 기존 문서·계약·UI 시안·ZIP·quality_checks는 보존한다. 구버전 패키지의 운영 전환 여부를 추정하지 않는다.
- 이 단계의 쓰기 범위: `docs/technical/`, `docs/adr/`, `DEVELOPMENT_STATUS.md`, `TASKS.md`, 신규 앱/인프라/테스트 경로. 분할 명세의 제품 결정을 조용히 바꾸지 않는다.
- 새 테스트 DB는 기존 컨테이너와 분리한 이름·포트·볼륨으로 만든다. 운영 데이터 삭제·이전·DNS·청구·고객 발송은 하지 않는다.
- 실패 위험: 인증 구현체의 실제 OAuth 동작, 브라우저 쿠키/iframe, PostgreSQL exclusion constraint, 공급사 계약, 운영 환경은 아직 검증되지 않았다.

## C00 판정

문서 패키지에서 신규 서비스 구현을 시작할 수 있다. 현재 작업 폴더에 보존해야 할 **기존 서비스 코드나 로컬 앱 DB는 발견되지 않았다**. 외부 운영 자산 부재까지 증명한 것은 아니다.
