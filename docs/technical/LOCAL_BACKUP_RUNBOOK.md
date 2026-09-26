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

## AP 문의·익명 AI 삭제 원장 재적용 — 로컬 격리 복원

AP worker는 `AP_DATABASE_URL`, AP 비공개 사진 저장소, `AP_RETENTION_JOURNAL_DIRECTORY`, 별도 `AP_RETENTION_JOURNAL_SECRET`만 사용한다. Field 설정·DB·서버·Valkey에 의존하지 않는다. 서명 키와 삭제 원장은 DB 백업과 별도로 보관하며, 기존 키를 새로 생성해 대체하지 않는다. `pnpm mock:run`은 AP/Field의 각 worker를 관리한다.

AP 삭제 원장의 모든 작성자를 중단한 뒤 최신 전체 checkpoint를 원장 밖의 보호된 새 파일로 내보낸다. `--quiesced`는 작성자를 자동 중단하는 옵션이 아니다. 원장 전체 directory/entry 누락, 추가 미대조 entry, 서명 변조, 미확인 파일 삭제 의도는 복원 성공이 아니며 파일/DB 변경 전에 거절한다. 원장과 checkpoint를 함께 과거로 교체한 경우의 탐지·운영 보관 증빙은 별도다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
# AP_PROFILE=mock, 기존 AP_RETENTION_JOURNAL_DIRECTORY/SECRET,
# AP_RETENTION_CHECKPOINT_OUTPUT=/absolute/protected/separate/ap-deletions-latest.json
# 모든 AP 삭제 원장 작성자가 중단된 상태에서 실행한다.
node --env-file=/absolute/protected/path/ap-journal.env \
  apps/agent-api/dist/retention-checkpoint-cli.js --quiesced
```

복원 CLI는 현재 AP DB를 식별하되 그 DB를 정리 대상으로 사용하지 않는다. 별도 로컬 `fieldai_agent_restore_<hex>` DB(127.0.0.1/localhost:55431, agent_local)와 별도 실제 파일 디렉터리만 허용한다. AP namespace가 있어야 하고 Field namespace가 있으면 거절한다. 삭제 의도만 있는 파일·job/사진 binding 불일치·사진 누락은 재적용 실패다. 원장에는 고객 원문/연락처/사진 bytes를 기록하지 않으며 파일 키/조직/업무/job/사진 ID·단계만 남긴다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
# 보호된 env에 AP_PROFILE=mock, AP_DATABASE_URL(현재 DB 식별),
# AP_INQUIRY_MEDIA_DIRECTORY(현재 파일 식별), 기존 AP_RETENTION_JOURNAL_DIRECTORY/SECRET,
# AP_RETENTION_RESTORE_DATABASE_URL(별도 복원 DB),
# AP_RETENTION_RESTORE_MEDIA_DIRECTORY(별도 복원 파일),
# AP_RETENTION_RESTORE_CHECKPOINT_FILE(따로 보관한 최신 checkpoint)를 지정한다.
node --env-file=/absolute/protected/path/ap-restored.env \
  apps/agent-api/dist/retention-restore-cli.js --offline-restored
```

`pnpm test:db:agent`에서 실제 격리 PG17 dump/restore 후 원문/사진 정리와 반복0, 원장 directory/entry 누락·추가/변조·미확인 의도 거절, checkpoint export/restore CLI 및 현재 DB localhost 별칭·현재 파일 경로·원장 내부 출력 거절을 확인했다. 사진 scope 정리 후 새로 업로드한 사진은 기존 정리 job의 cutoff 밖이므로 복원 재적용에서도 유지하며, 이 경로를 실제 AP DB 검사에 포함했다. 이 결과는 모든 namespace/경로 별칭 부정 사례나 운영 RPO/RTO 검수의 완료 근거가 아니다. AP 연결/OAuth revoke 원장 재적용은 아직 별도 후속이며, 전체 복구 검수 전 운영 서비스 재개를 승인하지 않는다.

## Field 업무 삭제 원장 재적용 — 로컬 격리 복원

Field 보존 처리기는 `FIELD_RETENTION_JOURNAL_DIRECTORY`와 별도 `FIELD_RETENTION_JOURNAL_SECRET`을 사용한다. 실제 원문·전화·사진 bytes를 저장하지 않고 Field 업무/조직/job/사진 ID·범위·단계와 immutable 파일 키만 HMAC 서명·파일/디렉터리 fsync로 남긴다. 이 디렉터리와 서명 키는 DB 백업과 별도로 보호·보관해야 한다. 키를 새로 만들면 기존 원장을 검증할 수 없다.

삭제 복원에는 원장 밖에 따로 보관한 최신 `retention-checkpoint`가 필수다. 모든 삭제 worker/원장 작성자를 중단한 뒤 전체 entry ID·내용 SHA-256을 서명해 내보낸다. 원장 directory 부재·한 entry 누락·미대조 추가 entry·변조·회수 checkpoint 혼용은 파일/DB 변경 전에 실패한다. 신규 worker의 빈 `read()`는 fresh 환경만을 위한 동작이며 복원 성공 근거가 아니다. checkpoint와 원장을 함께 과거로 바꾸는 경우와 legacy 누락·운영 공급사 보관 검수는 별도다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
# Field retention worker 등 모든 삭제 원장 작성자를 중단한 상태에서 실행한다.
# 기존 DIRECTORY/SECRET, FIELD_PROFILE=mock, 아래 별도 새 출력 경로를 보호된 env에 지정한다.
# FIELD_RETENTION_CHECKPOINT_OUTPUT=/absolute/protected/separate/field-deletions-latest.json
node --env-file=/absolute/protected/path/field-journal.env \
  apps/field-api/dist/retention-checkpoint-cli.js --quiesced
```

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
# FIELD_RETENTION_RESTORE_CHECKPOINT_FILE=/absolute/protected/separate/field-deletions-latest.json
# FIELD_PROFILE=mock
node --env-file=/absolute/protected/path/field-restored.env \
  apps/field-api/dist/retention-restore-cli.js --offline-restored
```

CLI는 로컬 Field mock binding(127.0.0.1/localhost:55432, field_local)과 별도 `fieldai_field_restore_<hex>` DB만 허용한다. checkpoint 출력은 journal 밖의 새 0600 파일이어야 하며 기존 checkpoint/원장 파일을 덮어쓰지 않는다.

실제 검수는 `pnpm test:db:field`의 합성 fixture로 한다. 격리 Field DB를 `pg_dump -Fc`로 백업하고 새 임시 DB에 PG17 `pg_restore`한 뒤, 정리 전 사진을 별도 파일 경로에 복원한다. 전체 directory/entry 부재·미대조 추가·서명 변조/미확인 의도는 실패하고 원문/사진을 유지한다. checkpoint export/restore CLI 실제 적용 후 파일 부재/원문 제거/재저장 거부/반복0을 검사한다. active DB localhost alias·active media symlink alias/잘못된 local port/원장 안의 checkpoint 출력도 실제 거절한다. 이 삭제 검사는 회수 원장을 포함하지 않으며 아래 절의 별도 명령/검사를 함께 수행해야 한다. 운영 S3·보관 공급사·checkpoint/원장 동시 과거 교체·legacy 누락·삭제 결과 미상의 추가 대조·실 RPO/RTO·운영 복원 인증은 여전히 남아 있다.

## Field 연결·OAuth 권한 회수 원장 재적용

`FIELD_REVOCATION_JOURNAL_DIRECTORY`와 별도 `FIELD_REVOCATION_JOURNAL_SECRET`을 사용한다. Field owner의 연결/선택 권한 회수와 검증된 AP 서명 회수 수신은 native 대상 lock·권한 검증 뒤 서명 원장을 fsync하고 DB 상태를 commit한다. 원장에는 조직·대상·선택·회수 ID/시각/출처만 있고 원문/연락처/token/route key는 없다. 기록 실패는 503이며 회수 완료가 아니다. commit 미확인 의도도 복원에서는 보수적으로 회수한다. 반복 성공 요청은 같은 DB 결과를 돌려주며 원장을 추가하지 않는다.

AP access/refresh ciphertext는 Field 연결 해제 즉시 null이 되고 재활성화/재저장을 DB가 거절한다. 별도의 event route key는 원격 회수와 인증된 ACK 재시도에 아직 필요해 유지한다. 일반 데이터 조회/도구에는 revoked 연결을 허용하지 않는다. 이 전용 키의 최종 폐기 수명·legacy 회수 baseline은 후속 필수 작업이다.

복원에는 **모든 Field 원장 작성자를 중단한 뒤 마지막으로 내보낸 신뢰 checkpoint**를 별도 보호 경로에서 제공한다. checkpoint는 전체 entry ID·내용 해시의 서명 목록이다. 누락·변조·추가 미대조 entry·없는 디렉터리·다른 제품 namespace·조직/선택 binding 불일치는 실패한다. checkpoint export가 원장 유실 이전의 마지막 기록까지 포함했다는 보관 근거가 필요하다. 이미 원장이 유실된 뒤 checkpoint를 새로 만들거나 DB 백업에 들어 있던 과거 checkpoint로 대체하지 않는다. checkpoint와 원장을 함께 과거로 바꾸는 경우를 로컬 HMAC만으로 검출한다고 주장하지 않는다.

```bash
cd /Users/jr/Desktop/projects/FieldAI
# 이 명령 전에 Field API/event worker 등 모든 회수 원장 작성자를 중단한다.
# 보호된 환경에 기존 DIRECTORY/SECRET와 mock profile을 지정한다.
# FIELD_REVOCATION_CHECKPOINT_OUTPUT=/absolute/protected/separate/field-revocations-latest.json
node --env-file=/absolute/protected/path/field-journal.env \
  apps/field-api/dist/revocation-checkpoint-cli.js --quiesced

# 별도 DB에 복원한 후 API/worker가 없는 상태에서 실행한다.
# FIELD_DATABASE_URL=... (현재 서비스 DB 식별만; 이 DB에는 접속하지 않음)
# FIELD_REVOCATION_RESTORE_DATABASE_URL=... (별도 Field 복원 DB)
# FIELD_REVOCATION_RESTORE_CHECKPOINT_FILE=/absolute/protected/separate/field-revocations-latest.json
# FIELD_REVOCATION_JOURNAL_DIRECTORY=... (기존 독립 원장)
# FIELD_REVOCATION_JOURNAL_SECRET=... (기존 키)
# FIELD_PROFILE=mock
node --env-file=/absolute/protected/path/field-restored.env \
  apps/field-api/dist/revocation-restore-cli.js --offline-restored
```

checkpoint 출력은 원장 디렉터리 밖의 새 파일(0600)이어야 한다. CLI는 현재 DB 이름의 localhost/127.0.0.1·URL escape 별칭을 거절하고, 분리된 로컬 Field 복원 DB만 대상으로 한다. 원격 운영 복구 명령이 아니다. 복원 함수는 전체 검증 후 한 transaction으로 연결/설치·선택/access/refresh token·동의를 차단하고 `field.revocation_restore_audit`에 entry ID/결과를 남긴다. 기존 업무·고객 확인키·예약/구독을 삭제하지 않는다. 원격 ACK를 새로 만들거나 자동 네트워크 발송을 시작하지 않으며 기존 미완료 회수 행은 재대조 필요 상태로 막는다. 새 덤프에서 아직 없던 대상은 `target_absent`로 기록한다. 삭제 재적용과 회수 재적용 모두 성공하고 추가 복구 검수를 마친 뒤 서비스 재개를 판단한다.

실제 격리 DB 검사는 해제 전 PG17 dump→별도 restore→기존 bearer 200 확인→원장/CLI 적용→bearer 401·토큰 회수/비밀값 null·재활성화 거절·반복0, 기존 고객 문의/확인키 유지, 원장 누락/변조/미대조/전체 디렉터리 없음·AP namespace 혼합·binding 오류의 전체 rollback을 검사한다. 이는 실 공급사 보관·원장/신뢰 checkpoint 동시 rollback 방지·기존 회수 baseline·운영 RPO/RTO 인증을 대신하지 않는다.

## 정리 worker의 원장 연속성

AP migration66와 Field migration62의 제품별 `retention_journal_receipts`는 signed entry ID/내용 SHA-256만 기록하며 조직·업무 삭제에 종속되지 않는다. update/delete는 DB에서 거절한다. 두 worker는 startup/다음 job/각 append 전에 이 기록과 기존 completed job/file-deleted 감사 사실을 자체 signed journal과 대조한다. 폴더가 있어도 기록이 없거나 내용이 바뀌면 정리를 진행하지 않는다. read/append는 없는 폴더를 빈 성공이나 신규 초기화로 바꾸지 않는다.

최초 로컬 설정은 `node tools/setup-mock-env.mjs agent field`로 각 제품의 최초 key 생성 때만 빈 directory를 만든다. 기존 key가 있는 환경의 directory를 잃었다면 자동 초기화하지 말고 원래 signed journal을 보호된 보관본에서 복구한다. 기존 완료/파일 감사 사실이 원장과 맞아야 최초 receipt baseline도 기록할 수 있다. 파일 fsync 뒤 DB receipt 저장이 실패한 signed entry는 다음 대조에서 보존하며 없애지 않는다. DB 백업을 복원한 뒤에는 공개 서비스/worker를 재개하기 전에 해당 제품의 최신 별도 checkpoint와 삭제·revoke 원장을 검증·재적용해야 한다. DB와 journal/checkpoint를 함께 과거로 교체한 상황이나 baseline 이전에 원래부터 없던 기록의 운영 보장은 별도다.
