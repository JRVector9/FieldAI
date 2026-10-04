-- A-03: 인증 메일 운영 조회는 원문 대신 마스킹 주소와 상태만 제공하고 조회 사실을 감사한다.
alter table field.admin_access_audit drop constraint admin_access_audit_resource_check,
  add constraint admin_access_audit_resource_check check (resource in ('overview','email_outbox'));
create index field_email_outbox_cursor_idx on field.email_outbox(created_at desc,id desc);
-- 롤백: cursor index만 제거 가능. email_outbox 감사 행이 있으면 enum 확장을 유지해 감사 이력을 보존한다.
