alter table ap.billing_consents add column first_charge_policy text not null default 'after_authorization' check(first_charge_policy='after_authorization');
alter table ap.billing_authorizations alter column callback_token_ciphertext drop not null;
alter table ap.billing_authorizations add column session_id text not null;
alter table ap.billing_authorizations add column auth_key_hash text;
alter table ap.billing_authorizations add column provider_mode text not null check(provider_mode in ('test','live'));
alter table ap.billing_authorizations add column provider_mid text not null check(length(provider_mid) between 1 and 14);
alter table ap.billing_authorizations add constraint ap_billing_auth_payload check(
 (state<>'awaiting' or callback_token_ciphertext is not null)
 and (state<>'pending' or (auth_key_ciphertext is not null and auth_key_hash is not null))
 and (state<>'canceled' or (auth_key_ciphertext is null and callback_token_ciphertext is null))
);
create function ap.billing_authorization_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'billing authorization metadata is retained' using errcode='PAB02'; end if;
 if (new.id,new.subscription_id,new.request_key,new.callback_token_hash,new.session_id,new.expires_at,new.provider_mode,new.provider_mid)
  is distinct from (old.id,old.subscription_id,old.request_key,old.callback_token_hash,old.session_id,old.expires_at,old.provider_mode,old.provider_mid)
  or old.auth_key_hash is not null and new.auth_key_hash is distinct from old.auth_key_hash
  or old.state in ('completed','canceled') and new.state is distinct from old.state then
  raise exception 'billing authorization binding is immutable' using errcode='PAB02';
 end if;
 return new;
end $$;
create trigger ap_billing_authorization_guard before update or delete on ap.billing_authorizations for each row execute function ap.billing_authorization_guard();
