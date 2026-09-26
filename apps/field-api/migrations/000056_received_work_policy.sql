-- 이전 기록의 정책·동의를 소급 생성하지 않는다.
alter table field.external_work_requests add column processing_policy jsonb;
alter table field.external_work_requests add constraint received_work_policy_check check (
  processing_policy is null or (
    jsonb_typeof(processing_policy) = 'object'
    and processing_policy ?& array['purpose','consentVersion','consentItems','retention']
    and processing_policy->>'purpose' = case kind
      when 'inquiry' then 'inquiry_reply' else 'reservation_fulfillment' end
    and processing_policy->>'consentVersion' = 'transfer-v1'
    and jsonb_typeof(processing_policy->'consentItems') = 'array'
    and jsonb_typeof(processing_policy->'retention') = 'object'
    and (processing_policy->'retention') ?& array['policyVersion','state','startsAfter','workDays','photoDays']
    and jsonb_typeof(processing_policy->'retention'->'policyVersion') = 'string'
    and length(processing_policy->'retention'->>'policyVersion') between 1 and 120
    and processing_policy->'retention'->>'state' in ('proposed','approved')
    and processing_policy->'retention'->>'startsAfter' = 'field_work_closed'
    and jsonb_typeof(processing_policy->'retention'->'workDays') = 'number'
    and (processing_policy->'retention'->'workDays') between '1'::jsonb and '3650'::jsonb
    and jsonb_typeof(processing_policy->'retention'->'photoDays') = 'number'
    and (processing_policy->'retention'->'photoDays') between '1'::jsonb and '3650'::jsonb
  ) is true
);
