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

## Field 업무 삭제 원장 재적용 — 로컬 격리 복원

Field 보존 처리기는 `FIELD_RETENTION_JOURNAL_DIRECTORY`와 별도 `FIELD_RETENTION_JOURNAL_SECRET`을 사용한다. 실제 원문·전화·사진 bytes를 저장하지 않고 Field 업무/조직/job/사진 ID·범위·단계와 immutable 파일 키만 HMAC 서명·파일/디렉터리 fsync로 남긴다. 이 디렉터리와 서명 키는 DB 백업과 별도로 보호·보관해야 한다. 키를 새로 만들면 기존 원장을 검증할 수 없다.

`file_prepared`는 삭제 의도이며 성공이 아니다. 파일 삭제 후 `get`으로 부재를 확인해야 `file_deleted`를 기록한다. 파일 부재와 SQL 정리 준비 후 `purge_prepared`를 commit 전에 기록하고 commit 후 `completed`를 기록한다. 마지막 기록 실패는 DB 정리 완료와 구분하며 worker가 증빙만 재시도한다. 미확인 파일 의도/서명 손상·job/대상 불일치·다른 제품 DB·미반영 사진은 재적용 실패이고 공개 서버를 재개할 근거가 아니다.

직접 문의·예약·수신 사본의 개인정보/본문, 예약 이벤트 사유·달력 label·outbox 원문을 재적용하며 접수/처리/감사 ID와 기존 확인키 권한은 유지한다. 재적용 entry ID는 별도 `field.retention_restore_audit`에 기록한다. 반복 적용은 이미 적용된 entry를 재실행하지 않는다. Field 수신 사본 정리는 AP 원본 삭제가 아니다.

아래 명령은 **이미 별도 DB와 별도 비공개 파일 디렉터리에 복원한 로컬 mock 자료**에만 쓴다. 실제 운영 DB나 현재 서비스 파일 경로를 대상으로 실행하지 않는다. `FIELD_RETENTION_RESTORE_DATABASE_URL`의 DB 이름은 현재 `FIELD_DATABASE_URL`과 달라야 하고 복원된 DB에는 Field 스키마만 있어야 한다. 현재/복원 파일 경로는 존재하는 별도 실제 디렉터리여야 하며 symlink 별칭도 현재 경로로 재사용할 수 없다. 이 단계는 오프라인에서 실행하고 성공 여부를 확인한 뒤 다음 복구 검수를 진행한다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
# 보호된 환경 파일에 별도 복원 DB/파일 경로와 기존 Field 원장/키를 지정한다.
# FIELD_RETENTION_RESTORE_DATABASE_URL=...
# FIELD_DATABASE_URL=... (현재 서비스 DB 식별용; 이 DB에는 접속하지 않음)
# FIELD_RETENTION_RESTORE_MEDIA_DIRECTORY=...
# FIELD_RETENTION_JOURNAL_DIRECTORY=...
# FIELD_RETENTION_JOURNAL_SECRET=... (기존 키)
# FIELD_PROFILE=mock
node --env-file=/absolute/protected/path/field-restored.env \
  apps/field-api/dist/retention-restore-cli.js --offline-restored
```

실제 검수는 `pnpm test:db:field`의 합성 fixture로 한다. 격리 Field DB를 `pg_dump -Fc`로 백업하고 새 임시 DB에 PG17 `pg_restore`한 뒤, 정리 전 사진을 별도 파일 경로에 복원한다. 원장 재적용 후 파일 부재/원문 제거/재저장 거부/반복 적용을 검사한다. 운영 S3·백업 보관 공급사·원장 전체 유실/누락 탐지·삭제 결과 미상의 추가 대조·**연결/토큰 revoke 원장 재적용**·실 RPO/RTO·운영 복원 인증은 여전히 남아 있다. 이 명령의 성공만으로 전체 복구 게이트를 통과 처리하지 않는다.
