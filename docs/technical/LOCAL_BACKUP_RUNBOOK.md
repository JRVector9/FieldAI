# 로컬 mock 제품별 백업·격리 복원 검사

이 도구는 PostgreSQL 17 로컬 mock DB와 파일 저장소용이다. AP와 Field는 각각 별도 덤프·파일·manifest를 만든다. `manifest.json`이 없는 디렉터리는 완료된 백업이 아니다. 출력에는 고객 원문·연락처·사진·확인키 해시가 있으므로 접근을 제한하고 저장소 밖의 보호된 경로를 사용한다.

## 합성 자료 검수

```bash
cd /Users/jr/Desktop/projects/FieldAI
pnpm test:backup:mock
```

검사는 각각 새 PostgreSQL 17 컨테이너와 임시 사진 파일만 사용한다. 실행 중인 AP/Field mock DB와 파일을 읽거나 변경하지 않는다. 제품별 덤프 복원·참조 파일 크기/SHA-256, 누락·손상·다른 제품 DB 거절을 검사하고 임시 자원을 정리한다.

## 로컬 mock 백업과 확인

로컬 자료를 백업할 때만 다음 명령을 실행한다. 출력 경로는 절대 경로이며 아직 존재하지 않아야 한다. AP와 Field에 서로 다른 디렉터리를 쓴다.

```bash
umask 077
node tools/backup-product.mjs agent /absolute/protected/path/agent-backup-001
node tools/verify-product-backup.mjs agent /absolute/protected/path/agent-backup-001
node tools/backup-product.mjs field /absolute/protected/path/field-backup-001
node tools/verify-product-backup.mjs field /absolute/protected/path/field-backup-001
```

백업 명령은 각 제품의 `infra/<product>/.env`에서 mock 파일 경로를 읽고 해당 제품의 `fieldai-<product>-mock-db-1` 컨테이너에서 `pg_dump -Fc`를 실행한다. 먼저 새 PostgreSQL 17 컨테이너에 덤프를 복원해 참조 사진을 식별하고, 파일의 길이·SHA-256을 확인한 뒤 복사한다. 덤프 해시와 제품별 행 수·파일 목록을 manifest에 마지막으로 쓴다. 실패하면 이번 명령이 만든 출력 디렉터리를 지운다. 확인 명령은 또 다른 `--network none` PostgreSQL 17 컨테이너에 복원하고 manifest·파일 해시를 재검사하며 서비스 DB에는 쓰지 않는다.

이 명령은 실제 운영 S3/DB 백업, 주기적 보존, 삭제·revoke 원장 재적용, 실 RPO/RTO 또는 서비스 복원 명령이 아니다. 운영 복구에는 별도 환경/권한·보존 정책·실측 검수와 승인된 절차가 필요하다. 백업 파일을 버전 관리에 넣지 않는다.
