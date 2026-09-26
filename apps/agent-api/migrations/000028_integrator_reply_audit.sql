alter table ap.inquiry_messages
  add column external_actor_user_id text,
  add column external_client_id text,
  add column external_grant_id uuid,
  add constraint ap_inquiry_messages_external_actor_check
    check ((external_actor_user_id is null and external_client_id is null and external_grant_id is null)
      or (external_actor_user_id is not null and external_client_id is not null and external_grant_id is not null));

create index ap_inquiry_messages_external_grant_idx
  on ap.inquiry_messages(external_grant_id) where external_grant_id is not null;
