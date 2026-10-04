-- A-02/A-03: operational metadata reads remain audited without granting customer content access.
alter table ap.admin_access_audit drop constraint admin_access_audit_resource_check;
alter table ap.admin_access_audit add constraint admin_access_audit_resource_check
  check (resource in ('overview', 'field_actions', 'email_outbox'));
create index ap_admin_unknown_actions_cursor_idx on ap.field_action_requests(consent_confirmed_at, id)
  where state = 'delivery_unknown';
create index ap_admin_email_outbox_cursor_idx on ap.email_outbox(state, created_at desc, id desc);
-- Rollback: preserve new audit rows separately before restoring resource='overview'. Drop only these two indexes.
