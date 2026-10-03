-- AP-O09 조직 삭제 후속(추가): 조직 삭제 실행(organizations.deleted_at 기록 뒤)에서 owner 발송 기록의 연락처 암호문을 지울 수 있게
-- 000078 notification_delivery_guard를 넓힌다. 기존 조건(문의 보존 정리)은 그대로 두고 'owner 대상 + 삭제된 조직' 경우만 추가한다.
-- Field 000077과 같은 규칙이다. 연락처 외 binding·종료 상태 불변 조건은 바꾸지 않는다.
create or replace function ap.notification_delivery_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'notification delivery ledger is immutable' using errcode='PAN01'; end if;
 if (new.id,new.organization_id,new.notification_id,new.recipient_id,new.channel,new.fallback_of,new.created_at)
    is distinct from (old.id,old.organization_id,old.notification_id,old.recipient_id,old.channel,old.fallback_of,old.created_at)
    or (old.started_at is not null and (new.started_at,new.provider,new.account_id,new.key_fingerprint,new.reserved,new.reserved_day)
      is distinct from (old.started_at,old.provider,old.account_id,old.key_fingerprint,old.reserved,old.reserved_day))
    or (old.provider_id is not null and new.provider_id is distinct from old.provider_id)
    or (new.recipient_ciphertext is distinct from old.recipient_ciphertext and not (new.recipient_ciphertext is null and new.retention_purged_at is not null and (exists(select 1 from ap.notification_recipients r join ap.inquiries i on i.id::text=r.target_id where r.id=new.recipient_id and r.target_kind='inquiry' and i.retention_work_purged_at is not null)
      or exists(select 1 from ap.notification_recipients r join ap.organizations o on o.id=r.organization_id
        where r.id=new.recipient_id and r.target_kind='owner' and o.deleted_at is not null))))
    or (old.retention_purged_at is not null and new.retention_purged_at is distinct from old.retention_purged_at)
    or (old.started_at is not null and new.state in ('pending','blocked_limit','suppressed'))
    or (old.state in ('sent','failed','suppressed') and (new.state,new.allow_fallback) is distinct from (old.state,old.allow_fallback)) then
   raise exception 'notification delivery binding or terminal state is immutable' using errcode='PAN01';
 end if;
 return new;
end $$;
-- 롤백(가역): ap.notification_delivery_guard()를 000078 정의로 다시 적용한다(이미 지운 owner 발송 암호문은 복원되지 않는다).
